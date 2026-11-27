'use strict';
/* Küchen-Controller – Oberfläche (läuft im Browser des iPads)
 *
 * - Holt regelmäßig den Status aller Geräte vom Server.
 * - Tippen auf eine Kachel schaltet das Gerät.
 * - Fragt beim ersten Mal nach dem Zugangsschlüssel und merkt ihn sich.
 * - Fragt nur, wenn der Bildschirm sichtbar ist (spart Daten und Strom).
 */
(function () {
  const SPEICHER_SCHLUESSEL = 'kueche.zugangsschluessel';
  const $ = (id) => document.getElementById(id);

  const el = {
    titel: $('titel'), testmodus: $('testmodus'), uhr: $('uhr'), datum: $('datum'),
    raster: $('geraete'), leer: $('leer'), laden: $('laden'),
    meldung: $('meldung'), meldungText: $('meldung-text'), meldungZu: $('meldung-zu'),
    anmeldung: $('anmeldung'), form: $('anmeldung-form'), eingabe: $('anmeldung-eingabe'),
    anmeldungFehler: $('anmeldung-fehler'),
  };

  let intervallMs = 10000;
  let zeitgeber = null;
  let meldungZeitgeber = null;
  let verbindungsFehler = false;
  const kacheln = new Map(); // id -> { knopf, name, status, daten }

  // ---------- Zugangsschlüssel ----------
  function leseSchluessel() {
    try { return localStorage.getItem(SPEICHER_SCHLUESSEL) || ''; } catch { return ''; }
  }
  function speichereSchluessel(s) {
    try { localStorage.setItem(SPEICHER_SCHLUESSEL, s); } catch { /* privater Modus */ }
  }
  // Komfort: http://pc:8080/#schluessel=XYZ übernimmt den Schlüssel einmalig
  (function schluesselAusAdresse() {
    const t = /[#&]schluessel=([^&]+)/.exec(location.hash);
    if (t) {
      speichereSchluessel(decodeURIComponent(t[1]));
      history.replaceState(null, '', location.pathname);
    }
  })();

  function zeigeAnmeldung(fehlertext) {
    stoppeAktualisierung();
    el.anmeldung.hidden = false;
    el.anmeldungFehler.hidden = !fehlertext;
    el.anmeldungFehler.textContent = fehlertext || '';
    el.eingabe.value = '';
    setTimeout(() => el.eingabe.focus(), 50);
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = el.eingabe.value.trim();
    if (!s) return;
    speichereSchluessel(s);
    el.anmeldung.hidden = true;
    el.eingabe.blur();
    aktualisiere();
  });

  // ---------- Verbindung zum Server ----------
  class AnmeldeFehler extends Error {}

  async function anfrage(pfad, optionen = {}) {
    const schluessel = leseSchluessel();
    if (!schluessel) throw new AnmeldeFehler('');
    let antwort;
    try {
      antwort = await fetch(pfad, {
        ...optionen,
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + schluessel, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      });
    } catch {
      const err = new Error('Keine Verbindung zum Küchen-Server. Läuft der PC und ist das iPad im WLAN?');
      err.verbindung = true;
      throw err;
    }
    let daten = {};
    try { daten = await antwort.json(); } catch { /* leer */ }
    if (antwort.status === 401) throw new AnmeldeFehler('Der Schlüssel war falsch. Bitte erneut eingeben.');
    if (antwort.status === 429) throw new AnmeldeFehler(daten.fehler || 'Zu viele Versuche. Bitte später erneut.');
    return { ok: antwort.ok, status: antwort.status, daten };
  }

  // ---------- Anzeige ----------
  function zeigeMeldung(text, dauerhaft) {
    el.meldungText.textContent = text;
    el.meldung.hidden = false;
    clearTimeout(meldungZeitgeber);
    if (!dauerhaft) meldungZeitgeber = setTimeout(versteckeMeldung, 8000);
  }
  function versteckeMeldung() { el.meldung.hidden = true; }
  el.meldungZu.addEventListener('click', versteckeMeldung);

  function statusText(g) {
    if (!g.erreichbar) return 'Nicht erreichbar';
    return g.an ? 'An' : 'Aus';
  }

  function zeichneKachel(k, g) {
    k.daten = g;
    k.name.textContent = g.name;
    k.statusText.textContent = statusText(g);
    k.knopf.classList.toggle('an', g.erreichbar && g.an === true);
    k.knopf.classList.toggle('fehler', !g.erreichbar);
    k.knopf.setAttribute('aria-pressed', g.erreichbar && g.an ? 'true' : 'false');
    k.knopf.setAttribute('aria-label', `${g.name}: ${statusText(g)}`);
  }

  function neueKachel(g) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'kachel';
    const name = document.createElement('span');
    name.className = 'kachel-name';
    const status = document.createElement('span');
    status.className = 'kachel-status';
    const punkt = document.createElement('span');
    punkt.className = 'punkt';
    const statusText = document.createElement('span');
    status.append(punkt, statusText);
    knopf.append(name, status);
    const k = { knopf, name, statusText, daten: g };
    knopf.addEventListener('click', () => schalte(k));
    return k;
  }

  function zeichneAlle(liste) {
    const ids = new Set(liste.map((g) => g.id));
    for (const [id, k] of kacheln) if (!ids.has(id)) { k.knopf.remove(); kacheln.delete(id); }
    liste.forEach((g) => {
      let k = kacheln.get(g.id);
      if (!k) { k = neueKachel(g); kacheln.set(g.id, k); }
      if (!k.knopf.classList.contains('wartet')) zeichneKachel(k, g);
      el.raster.appendChild(k.knopf); // hält die Reihenfolge der Konfiguration
    });
    el.leer.hidden = liste.length > 0;
  }

  // ---------- Aktionen ----------
  async function aktualisiere() {
    clearTimeout(zeitgeber);
    try {
      const { ok, daten } = await anfrage('/api/geraete');
      el.laden.hidden = true;
      if (!ok) throw new Error(daten.fehler || 'Der Server hat einen Fehler gemeldet.');
      if (verbindungsFehler) { verbindungsFehler = false; versteckeMeldung(); }
      el.titel.textContent = daten.titel;
      document.title = daten.titel;
      el.testmodus.hidden = !daten.testmodus;
      intervallMs = Math.max(2, daten.aktualisierungSekunden) * 1000;
      zeichneAlle(daten.geraete);
    } catch (e) {
      if (e instanceof AnmeldeFehler) return zeigeAnmeldung(e.message);
      el.laden.hidden = true;
      verbindungsFehler = !!e.verbindung;
      zeigeMeldung(e.message, verbindungsFehler);
    }
    planeNaechste();
  }

  async function schalte(k) {
    const g = k.daten;
    // Eindeutiger Befehl je nach angezeigtem Zustand (verhindert Doppel-Umschalten)
    const aktion = g.erreichbar && g.an === true ? 'aus' : g.erreichbar && g.an === false ? 'an' : 'umschalten';
    k.knopf.classList.add('wartet');
    k.statusText.textContent = 'Schaltet …';
    try {
      const { ok, daten } = await anfrage('/api/geraete/' + encodeURIComponent(g.id), {
        method: 'POST', body: JSON.stringify({ aktion }),
      });
      k.knopf.classList.remove('wartet');
      if (ok) {
        zeichneKachel(k, daten);
      } else {
        zeichneKachel(k, { ...g, erreichbar: daten.erreichbar ?? g.erreichbar, an: daten.an ?? g.an });
        zeigeMeldung(daten.fehler || `„${g.name}" konnte nicht geschaltet werden.`);
      }
    } catch (e) {
      k.knopf.classList.remove('wartet');
      zeichneKachel(k, g);
      if (e instanceof AnmeldeFehler) return zeigeAnmeldung(e.message);
      zeigeMeldung(e.message, false);
    }
  }

  // ---------- Regelmäßig aktualisieren, nur wenn sichtbar ----------
  function planeNaechste() {
    clearTimeout(zeitgeber);
    if (document.visibilityState === 'visible' && el.anmeldung.hidden) {
      zeitgeber = setTimeout(aktualisiere, intervallMs);
    }
  }
  function stoppeAktualisierung() { clearTimeout(zeitgeber); }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { aktualisiere(); uhr(); }
    else stoppeAktualisierung();
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) aktualisiere(); });

  // ---------- Uhr ----------
  const uhrFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const datumFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  function uhr() {
    const jetzt = new Date();
    el.uhr.textContent = uhrFormat.format(jetzt);
    el.datum.textContent = datumFormat.format(jetzt);
  }
  uhr();
  setInterval(uhr, 1000 * 15);

  // ---------- Start ----------
  if (!leseSchluessel()) { el.laden.hidden = true; zeigeAnmeldung(''); }
  else aktualisiere();
})();
