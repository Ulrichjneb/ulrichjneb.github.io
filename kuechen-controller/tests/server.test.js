'use strict';
/**
 * Automatische Tests. Aufruf im Ordner kuechen-controller:  npm test
 *
 * Es wird nichts Echtes geschaltet: Die Tests benutzen den Testmodus und
 * nachgemachte Shelly-Geräte, die nur auf diesem Rechner laufen.
 */
process.env.KUECHE_LEISE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { ladeKonfiguration, KonfigFehler } = require('../server/konfiguration');
const { erstelleServer } = require('../server/server');
const { erstelleNetzPruefer, schluesselStimmt, erstelleSperre } = require('../server/sicherheit');
const { erstelleShellyTreiber, GeraeteFehler } = require('../server/shelly');

const VORLAGE = JSON.parse(fs.readFileSync(path.join(__dirname, '../konfiguration/config.example.json'), 'utf8'));
const SCHLUESSEL = 'test-schluessel-1234567890-abcdef';

function tempOrdner() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kueche-test-')); }

function baueKonfig(aenderung = {}) {
  const k = structuredClone(VORLAGE);
  k.sicherheit.zugangsschluessel = SCHLUESSEL;
  k.testmodus.antwortzeitMs = 5;
  k.protokoll.datei = path.join(tempOrdner(), 'aktionen.log');
  return Object.assign(k, aenderung);
}

async function starte(konfig) {
  const server = erstelleServer(konfig);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const anfrage = (pfad, { schluessel = SCHLUESSEL, ...opt } = {}) => fetch(basis + pfad, {
    ...opt,
    headers: { ...(schluessel ? { Authorization: 'Bearer ' + schluessel } : {}), ...(opt.headers || {}) },
  });
  const schalte = (id, aktion) => anfrage('/api/geraete/' + id, { method: 'POST', body: JSON.stringify({ aktion }) });
  return { server, anfrage, schalte, stopp: () => new Promise((r) => server.close(r)) };
}

// ---------------------------------------------------------------- Konfiguration
test('Konfiguration: erzeugt config.json und Schlüssel beim ersten Start', () => {
  const pfad = path.join(tempOrdner(), 'config.json');
  const { konfig, neuerSchluessel } = ladeKonfiguration(pfad);
  assert.ok(fs.existsSync(pfad));
  assert.ok(neuerSchluessel && neuerSchluessel.length >= 30);
  assert.equal(JSON.parse(fs.readFileSync(pfad, 'utf8')).sicherheit.zugangsschluessel, neuerSchluessel);
  assert.equal(konfig.testmodus.aktiv, true);
  // Zweiter Start: Schlüssel bleibt gleich
  assert.equal(ladeKonfiguration(pfad).neuerSchluessel, null);
});

test('Konfiguration: verständliche Meldung bei Tippfehlern', () => {
  const pfad = path.join(tempOrdner(), 'config.json');
  fs.writeFileSync(pfad, '{ "server": { "port": 8080, } }');
  assert.throws(() => ladeKonfiguration(pfad), (e) => e instanceof KonfigFehler && /Schreibfehler/.test(e.message));

  const k = baueKonfig();
  k.geraete.push({ ...k.geraete[0] }); // doppelte id
  fs.writeFileSync(pfad, JSON.stringify(k));
  assert.throws(() => ladeKonfiguration(pfad), /doppelt/);

  const k2 = baueKonfig();
  k2.oberflaeche.farben.an = 'red; } body { display:none';
  fs.writeFileSync(pfad, JSON.stringify(k2));
  assert.throws(() => ladeKonfiguration(pfad), /ungültig/);
});

// ---------------------------------------------------------------- Sicherheit
test('Sicherheit: nur Heimnetz-Adressen sind erlaubt', () => {
  const erlaubt = erstelleNetzPruefer(VORLAGE.sicherheit.erlaubteNetze);
  for (const ip of ['192.168.1.20', '10.0.0.5', '172.20.1.1', '127.0.0.1', '::1', '::ffff:192.168.178.30', 'fe80::1%eth0', 'fd12:3456::1']) {
    assert.equal(erlaubt(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '193.168.1.1', '2a00:1450::1', '::ffff:8.8.8.8', '', 'kaputt']) {
    assert.equal(erlaubt(ip), false, ip);
  }
});

test('Sicherheit: Schlüsselvergleich und Sperre nach Fehlversuchen', () => {
  assert.equal(schluesselStimmt('abc', 'abc'), true);
  assert.equal(schluesselStimmt('abc', 'abd'), false);
  assert.equal(schluesselStimmt('abc', ''), false);
  const sperre = erstelleSperre(3, 15);
  sperre.fehlversuch('1.2.3.4'); sperre.fehlversuch('1.2.3.4');
  assert.equal(sperre.istGesperrt('1.2.3.4'), false);
  sperre.fehlversuch('1.2.3.4');
  assert.equal(sperre.istGesperrt('1.2.3.4'), true);
  assert.equal(sperre.istGesperrt('5.6.7.8'), false);
});

test('Server: lehnt Anfragen von außerhalb des Heimnetzes ab', async () => {
  const k = baueKonfig();
  k.sicherheit.erlaubteNetze = ['192.168.0.0/16']; // 127.0.0.1 gilt hier als "fremd"
  const s = await starte(k);
  try {
    const r1 = await s.anfrage('/');
    assert.equal(r1.status, 403);
    const r2 = await s.anfrage('/api/geraete');
    assert.equal(r2.status, 403);
  } finally { await s.stopp(); }
});

test('Server: Schlüssel wird geprüft, falsche Versuche führen zur Sperre', async () => {
  const k = baueKonfig();
  k.sicherheit.maxFehlversuche = 3;
  const s = await starte(k);
  try {
    assert.equal((await s.anfrage('/api/geraete', { schluessel: null })).status, 401);
    assert.equal((await s.anfrage('/api/geraete', { schluessel: 'falsch' })).status, 401);
    assert.equal((await s.anfrage('/api/geraete/deckenlicht', {
      schluessel: 'falsch', method: 'POST', body: '{"aktion":"an"}' })).status, 401);
    // jetzt gesperrt – sogar mit richtigem Schlüssel
    assert.equal((await s.anfrage('/api/geraete')).status, 429);
  } finally { await s.stopp(); }
});

// ---------------------------------------------------------------- Testmodus + Schalten
test('Testmodus: Geräte anzeigen, schalten, Fehlerfall, Protokoll', async () => {
  const k = baueKonfig();
  const s = await starte(k);
  try {
    // Liste
    let r = await s.anfrage('/api/geraete');
    assert.equal(r.status, 200);
    let d = await r.json();
    assert.equal(d.testmodus, true);
    assert.equal(d.geraete.length, 4);
    assert.deepEqual(d.geraete.find((g) => g.id === 'deckenlicht'), { id: 'deckenlicht', name: 'Deckenlicht', an: false, erreichbar: true });

    // an / aus / umschalten
    assert.equal((await (await s.schalte('deckenlicht', 'an')).json()).an, true);
    assert.equal((await (await s.schalte('deckenlicht', 'an')).json()).an, true, 'zweimal "an" bleibt an');
    assert.equal((await (await s.schalte('deckenlicht', 'umschalten')).json()).an, false);
    assert.equal((await (await s.schalte('deckenlicht', 'umschalten')).json()).an, true);
    assert.equal((await (await s.schalte('deckenlicht', 'aus')).json()).an, false);
    await s.schalte('kaffeemaschine', 'an');
    d = await (await s.anfrage('/api/geraete')).json();
    assert.equal(d.geraete.find((g) => g.id === 'kaffeemaschine').an, true, 'Zustand wird gemerkt');

    // Fehlerfall: Gerät antwortet nicht -> klare Meldung, kein Absturz
    r = await s.schalte('dunstabzug', 'an');
    assert.equal(r.status, 502);
    d = await r.json();
    assert.equal(d.erreichbar, false);
    assert.match(d.fehler, /Dunstabzug.*antwortet nicht/);

    // Ungültige Eingaben
    assert.equal((await s.schalte('gibtsnicht', 'an')).status, 404);
    assert.equal((await s.schalte('deckenlicht', 'explodieren')).status, 400);
    assert.equal((await s.anfrage('/api/geraete/deckenlicht', { method: 'POST', body: 'kein json' })).status, 400);
    assert.equal((await s.anfrage('/api/geraete/deckenlicht', { method: 'POST', body: 'x'.repeat(5000) }).catch(() => ({ status: 'abgebrochen' }))).status !== 200, true);
    assert.equal((await s.anfrage('/api/geraete/deckenlicht')).status, 405);

    // Server läuft nach all dem noch
    assert.equal((await s.anfrage('/api/geraete')).status, 200);

    // Protokoll: Zeit, Gerät, Befehl, Ergebnis – und KEIN Schlüssel
    const log = fs.readFileSync(k.protokoll.datei, 'utf8');
    assert.match(log, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\tDeckenlicht \(deckenlicht\)\teinschalten\tOK\tjetzt an$/m);
    assert.match(log, /\tDunstabzug \(dunstabzug\)\teinschalten\tFEHLER\t/);
    assert.ok(!log.includes(SCHLUESSEL), 'Schlüssel darf nicht im Protokoll stehen');
  } finally { await s.stopp(); }
});

test('Protokoll: Schlüssel wird geschwärzt, auch wenn er versehentlich auftaucht', () => {
  const { erstelleProtokoll } = require('../server/protokoll');
  const datei = path.join(tempOrdner(), 'p.log');
  const p = erstelleProtokoll({ datei, maxGroesseMB: 1 }, [SCHLUESSEL]);
  p.schreibe('-', 'Test', 'OK', `enthält ${SCHLUESSEL} aus Versehen`);
  const inhalt = fs.readFileSync(datei, 'utf8');
  assert.ok(!inhalt.includes(SCHLUESSEL));
  assert.match(inhalt, /enthält \*\*\* aus Versehen/);
});

// ---------------------------------------------------------------- Oberfläche
test('Oberfläche: wird ausgeliefert, gepackt, mit Zwischenspeicher und Schutz-Headern', async () => {
  const s = await starte(baueKonfig());
  try {
    let r = await s.anfrage('/', { schluessel: null });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.ok(!html.includes(SCHLUESSEL));

    // 304, wenn unverändert
    r = await s.anfrage('/app.js', { schluessel: null });
    const etag = r.headers.get('etag');
    r = await s.anfrage('/app.js', { schluessel: null, headers: { 'If-None-Match': etag } });
    assert.equal(r.status, 304);

    // gzip
    const roh = await new Promise((res) => http.get(s.server.address() && `http://127.0.0.1:${s.server.address().port}/app.js`,
      { headers: { 'Accept-Encoding': 'gzip' } }, (a) => { a.resume(); res(a.headers); }));
    assert.equal(roh['content-encoding'], 'gzip');

    // Design aus Konfiguration
    const css = await (await s.anfrage('/design.css', { schluessel: null })).text();
    assert.match(css, /--farbe-hintergrund: #0a0f18;/);
    assert.match(css, /--schrift-knopfName: 24px;/);

    const manifest = await (await s.anfrage('/manifest.webmanifest', { schluessel: null })).json();
    assert.equal(manifest.display, 'standalone');

    assert.equal((await s.anfrage('/icons/apple-touch-icon.png', { schluessel: null })).status, 200);
    assert.equal((await s.anfrage('/../konfiguration/config.json', { schluessel: null })).status, 404);
    assert.equal((await s.anfrage('/%2e%2e/konfiguration/config.example.json', { schluessel: null })).status, 404);
  } finally { await s.stopp(); }
});

// ---------------------------------------------------------------- Echte Shelly-Anbindung (nachgemacht)
function falscherShelly(generation) {
  let an = false;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (d) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    // Echte Shellys kennen nur ihre vorhandenen Kanäle
    if (generation === 2 && u.pathname.startsWith('/rpc/') && u.searchParams.get('id') !== '0') { res.writeHead(500); return res.end('{"code":-105}'); }
    if (generation === 1 && u.pathname === '/relay/0') {
      const t = u.searchParams.get('turn');
      if (t === 'on') an = true; else if (t === 'off') an = false; else if (t === 'toggle') an = !an;
      return json({ ison: an, has_timer: false });
    }
    if (generation === 2 && u.pathname === '/rpc/Switch.GetStatus') return json({ id: 0, output: an });
    if (generation === 2 && u.pathname === '/rpc/Switch.Set') { const w = an; an = u.searchParams.get('on') === 'true'; return json({ was_on: w }); }
    if (generation === 2 && u.pathname === '/rpc/Switch.Toggle') { const w = an; an = !an; return json({ was_on: w }); }
    if (u.pathname === '/geheim') { res.writeHead(401); return res.end(); }
    if (u.pathname === '/langsam') return; // antwortet nie
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

for (const generation of [1, 2]) {
  test(`Shelly-Anbindung Generation ${generation}: Status, an, aus, umschalten`, async () => {
    const fake = await falscherShelly(generation);
    const treiber = erstelleShellyTreiber({ zeitlimitMs: 1000 });
    const g = { id: 'x', name: 'Testlampe', ip: `127.0.0.1:${fake.address().port}`, generation, kanal: 0 };
    try {
      assert.deepEqual(await treiber.status(g), { an: false });
      assert.deepEqual(await treiber.schalten(g, 'an'), { an: true });
      assert.deepEqual(await treiber.status(g), { an: true });
      assert.deepEqual(await treiber.schalten(g, 'umschalten'), { an: false });
      assert.deepEqual(await treiber.schalten(g, 'umschalten'), { an: true });
      assert.deepEqual(await treiber.schalten(g, 'aus'), { an: false });
      // falscher Kanal -> verständlicher Fehler
      await assert.rejects(treiber.status({ ...g, kanal: 3 }), (e) => e instanceof GeraeteFehler && /Fehlercode (404|500)/.test(e.message));
    } finally { fake.close(); }
  });
}

test('Shelly-Anbindung: nicht erreichbar und Zeitlimit ergeben klare Meldungen', async () => {
  const treiber = erstelleShellyTreiber({ zeitlimitMs: 300 });
  // Port, auf dem nichts läuft
  const frei = http.createServer();
  await new Promise((r) => frei.listen(0, '127.0.0.1', r));
  const port = frei.address().port;
  await new Promise((r) => frei.close(r));
  await assert.rejects(treiber.status({ name: 'Weg', ip: `127.0.0.1:${port}`, generation: 2, kanal: 0 }),
    (e) => e instanceof GeraeteFehler && e.art === 'nicht_erreichbar' && /nicht erreichbar/.test(e.message));

  // Gerät nimmt Verbindung an, antwortet aber nie -> Zeitlimit
  const stumm = http.createServer(() => { /* schweigt */ });
  await new Promise((r) => stumm.listen(0, '127.0.0.1', r));
  const start = Date.now();
  await assert.rejects(treiber.schalten({ name: 'Lahm', ip: `127.0.0.1:${stumm.address().port}`, generation: 2, kanal: 0 }, 'an'),
    (e) => e instanceof GeraeteFehler && e.art === 'zeitlimit' && /Zeitlimit/.test(e.message));
  assert.ok(Date.now() - start < 2000, 'Zeitlimit wird eingehalten');
  stumm.closeAllConnections(); stumm.close();

  // Gerät verlangt Passwort
  const fake = await falscherShelly(2);
  const t2 = erstelleShellyTreiber({ zeitlimitMs: 300 });
  await assert.rejects(t2.status({ name: 'Geschützt', ip: `127.0.0.1:${fake.address().port}/geheim?`, generation: 2, kanal: 0 }),
    (e) => e.art === 'passwort' && /Passwort/.test(e.message));
  fake.close();
});

test('Server im Echtbetrieb: Shelly ausgefallen -> 502 mit Meldung, Server läuft weiter', async () => {
  const fake = await falscherShelly(1);
  const port = fake.address().port;
  const k = baueKonfig({
    testmodus: { aktiv: false, antwortzeitMs: 0, nichtErreichbar: [] },
    geraete: [
      { id: 'lampe', name: 'Lampe', ip: `127.0.0.1:${port}`, generation: 1, kanal: 0 },
      { id: 'weg', name: 'Steckdose', ip: '127.0.0.1:1', generation: 2, kanal: 0 },
    ],
  });
  k.shelly.zeitlimitMs = 500;
  const s = await starte(k);
  try {
    const d = await (await s.anfrage('/api/geraete')).json();
    assert.equal(d.testmodus, false);
    assert.equal(d.geraete[0].erreichbar, true);
    assert.equal(d.geraete[1].erreichbar, false);
    assert.equal((await (await s.schalte('lampe', 'an')).json()).an, true);
    const r = await s.schalte('weg', 'an');
    assert.equal(r.status, 502);
    assert.match((await r.json()).fehler, /Steckdose/);
    assert.equal((await s.anfrage('/api/geraete')).status, 200);
  } finally { await s.stopp(); fake.close(); }
});
