'use strict';
/**
 * Küchen-Controller – Server
 *
 * Start:  node server/server.js   (oder: npm start)
 *
 * Schnittstellen (alle nur aus dem Heimnetz erreichbar):
 *   GET  /                       Oberfläche (ohne Schlüssel, enthält keine Geheimnisse)
 *   GET  /design.css             Farben und Schriftgrößen aus der Konfiguration
 *   GET  /manifest.webmanifest   Angaben für "Zum Home-Bildschirm"
 *   GET  /api/geraete            Liste aller Geräte mit Status   (Schlüssel nötig)
 *   POST /api/geraete/<id>       Gerät schalten, Inhalt: {"aktion":"an"|"aus"|"umschalten"}
 *                                                                 (Schlüssel nötig)
 * Der Schlüssel wird im Header "Authorization: Bearer <schluessel>" geschickt.
 */
const http = require('node:http');
const path = require('node:path');

const { ladeKonfiguration, KonfigFehler, PROJEKT_ORDNER } = require('./konfiguration');
const { erstelleNetzPruefer, schluesselStimmt, schluesselAusAnfrage, erstelleSperre } = require('./sicherheit');
const { erstelleProtokoll } = require('./protokoll');
const { erstelleShellyTreiber, GeraeteFehler } = require('./shelly');
const { erstelleTestTreiber } = require('./testgeraete');
const { erstelleDateiAuslieferung, vorbereiten, sende } = require('./statisch');

const AKTIONEN = { an: 'einschalten', aus: 'ausschalten', umschalten: 'umschalten' };
const MAX_KOERPER_BYTES = 1024;

// Schutz-Header für jede Antwort
const SICHERHEITS_KOPF = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function sendeJson(res, status, daten) {
  const koerper = JSON.stringify(daten);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(koerper),
    'Cache-Control': 'no-store',
  });
  res.end(koerper);
}

function leseKoerper(req) {
  return new Promise((resolve, reject) => {
    let groesse = 0;
    const teile = [];
    req.on('data', (stueck) => {
      groesse += stueck.length;
      if (groesse > MAX_KOERPER_BYTES) { reject(new Error('zu_gross')); req.destroy(); return; }
      teile.push(stueck);
    });
    req.on('end', () => resolve(Buffer.concat(teile).toString('utf8')));
    req.on('error', reject);
  });
}

/** Erzeugt CSS-Variablen aus den Farben/Schriftgrößen der Konfiguration. */
function erzeugeDesignCss(o) {
  const zeilen = [];
  for (const [n, w] of Object.entries(o.farben)) zeilen.push(`  --farbe-${n}: ${w};`);
  for (const [n, w] of Object.entries(o.schriftgroessen)) zeilen.push(`  --schrift-${n}: ${w};`);
  return `:root {\n${zeilen.join('\n')}\n}\n`;
}

function erzeugeManifest(o) {
  return JSON.stringify({
    name: `${o.titel} – Steuerung`,
    short_name: o.titel,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: o.farben.hintergrund,
    theme_color: o.farben.hintergrund,
    lang: 'de',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}

/**
 * Baut den Server zusammen. Gibt den (noch nicht gestarteten) http.Server
 * zurück. Wird von main() und von den Tests benutzt.
 */
function erstelleServer(konfig) {
  const { sicherheit, testmodus, oberflaeche } = konfig;
  const protokoll = erstelleProtokoll(konfig.protokoll, [sicherheit.zugangsschluessel]);
  const ausHeimnetz = erstelleNetzPruefer(sicherheit.erlaubteNetze);
  const sperre = erstelleSperre(sicherheit.maxFehlversuche, sicherheit.sperrzeitMinuten);
  const treiber = testmodus.aktiv
    ? erstelleTestTreiber(konfig.geraete, testmodus)
    : erstelleShellyTreiber(konfig.shelly);
  const geraeteNachId = new Map(konfig.geraete.map((g) => [g.id, g]));
  const liefereDatei = erstelleDateiAuslieferung(path.join(PROJEKT_ORDNER, 'oberflaeche'));
  const designCss = vorbereiten(Buffer.from(erzeugeDesignCss(oberflaeche)), '.css');
  const manifest = vorbereiten(Buffer.from(erzeugeManifest(oberflaeche)), '.webmanifest');
  const letzteErreichbarkeit = new Map(); // für Protokoll: nur Änderungen festhalten

  function geraetName(g) { return `${g.name} (${g.id})`; }

  async function statusAller() {
    return Promise.all(konfig.geraete.map(async (g) => {
      try {
        const { an } = await treiber.status(g);
        if (letzteErreichbarkeit.get(g.id) === false) protokoll.schreibe(geraetName(g), 'Statusabfrage', 'OK', 'wieder erreichbar');
        letzteErreichbarkeit.set(g.id, true);
        return { id: g.id, name: g.name, an, erreichbar: true };
      } catch (e) {
        const meldung = e instanceof GeraeteFehler ? e.message : `„${g.name}": unerwarteter Fehler.`;
        if (letzteErreichbarkeit.get(g.id) !== false) protokoll.schreibe(geraetName(g), 'Statusabfrage', 'FEHLER', meldung);
        letzteErreichbarkeit.set(g.id, false);
        return { id: g.id, name: g.name, an: null, erreichbar: false, fehler: meldung };
      }
    }));
  }

  async function bearbeiteApi(req, res, pfad, ip) {
    // Zugangsschlüssel prüfen
    if (sperre.istGesperrt(ip)) {
      return sendeJson(res, 429, { fehler: `Zu viele falsche Versuche. Bitte in ${sicherheit.sperrzeitMinuten} Minuten erneut probieren.` });
    }
    if (!schluesselStimmt(sicherheit.zugangsschluessel, schluesselAusAnfrage(req))) {
      const anzahl = sperre.fehlversuch(ip);
      protokoll.schreibe('-', 'Anmeldung', 'ABGELEHNT', `falscher oder fehlender Zugangsschlüssel von ${ip} (Versuch ${anzahl})`);
      return sendeJson(res, 401, { fehler: 'Der Zugangsschlüssel fehlt oder ist falsch.' });
    }
    sperre.erfolg(ip);

    if (pfad === '/api/geraete') {
      if (req.method !== 'GET') return sendeJson(res, 405, { fehler: 'Methode nicht erlaubt.' });
      return sendeJson(res, 200, {
        titel: oberflaeche.titel,
        testmodus: testmodus.aktiv,
        aktualisierungSekunden: oberflaeche.aktualisierungSekunden,
        geraete: await statusAller(),
      });
    }

    const treffer = /^\/api\/geraete\/([a-z0-9_-]+)$/.exec(pfad);
    if (treffer) {
      if (req.method !== 'POST') return sendeJson(res, 405, { fehler: 'Methode nicht erlaubt.' });
      const geraet = geraeteNachId.get(treffer[1]);
      if (!geraet) return sendeJson(res, 404, { fehler: `Das Gerät „${treffer[1]}" ist nicht eingerichtet.` });

      let aktion;
      try {
        aktion = JSON.parse(await leseKoerper(req)).aktion;
      } catch {
        return sendeJson(res, 400, { fehler: 'Die Anfrage war ungültig.' });
      }
      if (!Object.hasOwn(AKTIONEN, aktion)) {
        return sendeJson(res, 400, { fehler: 'Unbekannte Aktion. Erlaubt sind: an, aus, umschalten.' });
      }

      try {
        const { an } = await treiber.schalten(geraet, aktion);
        letzteErreichbarkeit.set(geraet.id, true);
        protokoll.schreibe(geraetName(geraet), AKTIONEN[aktion], 'OK', an ? 'jetzt an' : 'jetzt aus');
        return sendeJson(res, 200, { id: geraet.id, name: geraet.name, an, erreichbar: true });
      } catch (e) {
        const meldung = e instanceof GeraeteFehler ? e.message : `„${geraet.name}": unerwarteter Fehler beim Schalten.`;
        if (!(e instanceof GeraeteFehler)) console.error(e);
        letzteErreichbarkeit.set(geraet.id, false);
        protokoll.schreibe(geraetName(geraet), AKTIONEN[aktion], 'FEHLER', meldung);
        return sendeJson(res, 502, { id: geraet.id, name: geraet.name, an: null, erreichbar: false, fehler: meldung });
      }
    }

    return sendeJson(res, 404, { fehler: 'Unbekannte Adresse.' });
  }

  async function bearbeite(req, res) {
    for (const [k, w] of Object.entries(SICHERHEITS_KOPF)) res.setHeader(k, w);
    const ip = req.socket.remoteAddress || '';

    // 1. Nur Heimnetz
    if (!ausHeimnetz(ip)) {
      protokoll.schreibe('-', 'Zugriff', 'ABGELEHNT', `Anfrage von außerhalb des Heimnetzes: ${ip}`);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Zugriff nur aus dem Heimnetz erlaubt.');
    }

    let pfad;
    try {
      pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return sendeJson(res, 400, { fehler: 'Ungültige Adresse.' });
    }

    // 2. Schnittstelle (mit Schlüssel)
    if (pfad.startsWith('/api/')) return bearbeiteApi(req, res, pfad, ip);

    // 3. Oberfläche (ohne Schlüssel, enthält keine Geheimnisse)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); return res.end();
    }
    if (pfad === '/design.css') return sende(req, res, designCss);
    if (pfad === '/manifest.webmanifest') return sende(req, res, manifest);
    if (liefereDatei(req, res, pfad)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden.');
  }

  const server = http.createServer((req, res) => {
    bearbeite(req, res).catch((e) => {
      // Letzte Sicherung: Fehler melden, aber niemals abstürzen
      console.error('[Server] Unerwarteter Fehler:', e);
      if (!res.headersSent) sendeJson(res, 500, { fehler: 'Interner Fehler im Server. Details stehen in der Konsole.' });
      else res.end();
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.protokoll = protokoll;
  return server;
}

function main() {
  let ergebnis;
  try {
    ergebnis = ladeKonfiguration();
  } catch (e) {
    console.error('\n❌ Die Konfiguration ist fehlerhaft:\n   ' + e.message + '\n');
    if (!(e instanceof KonfigFehler)) console.error(e);
    process.exit(1);
  }
  const { konfig, pfad, neuerSchluessel } = ergebnis;

  let server;
  try {
    server = erstelleServer(konfig);
  } catch (e) {
    console.error('\n❌ Der Server konnte nicht vorbereitet werden:\n   ' + e.message + '\n');
    process.exit(1);
  }

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${konfig.server.port} ist schon belegt. Läuft der Server bereits? ` +
        `Sonst in der Konfiguration einen anderen Port eintragen.\n`);
    } else {
      console.error('\n❌ Serverfehler:', e.message);
    }
    process.exit(1);
  });

  server.listen(konfig.server.port, konfig.server.adresse, () => {
    console.log('\n🍳 Küchen-Controller läuft');
    console.log(`   Adresse:        http://<IP-dieses-PCs>:${konfig.server.port}`);
    console.log(`   Konfiguration:  ${pfad}`);
    console.log(`   Protokoll:      ${konfig.protokoll.datei}`);
    console.log(`   Testmodus:      ${konfig.testmodus.aktiv ? 'AN (es wird nichts wirklich geschaltet)' : 'aus'}`);
    console.log(`   Geräte:         ${konfig.geraete.length}`);
    if (neuerSchluessel) {
      console.log('\n🔑 Neuer Zugangsschlüssel wurde erzeugt und in der Konfiguration gespeichert:');
      console.log(`   ${neuerSchluessel}`);
      console.log('   Diesen Schlüssel einmal auf dem iPad eingeben.');
    }
    console.log('');
    server.protokoll.schreibe('-', 'Serverstart', 'OK',
      `Port ${konfig.server.port}, Testmodus ${konfig.testmodus.aktiv ? 'an' : 'aus'}, ${konfig.geraete.length} Geräte`);
  });

  // Unerwartete Fehler protokollieren statt abzustürzen
  process.on('unhandledRejection', (e) => console.error('[Server] Unbehandelter Fehler:', e));

  const beenden = () => {
    server.protokoll.schreibe('-', 'Serverstopp', 'OK', '');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);
}

if (require.main === module) main();

module.exports = { erstelleServer, erzeugeDesignCss };
