'use strict';
/**
 * Protokoll: schreibt jede Aktion als eine Zeile in eine Textdatei.
 *
 * Format (Tabulator-getrennt, gut lesbar und mit Excel öffnbar):
 *   Zeit    Gerät    Befehl    Ergebnis    Details
 *
 * Zugangsschlüssel oder Passwörter werden NIE geschrieben. Zur Sicherheit
 * wird jede Zeile zusätzlich nach dem Schlüssel durchsucht und dieser ersetzt.
 *
 * Wird die Datei größer als maxGroesseMB, wird sie in "<name>.1" umbenannt
 * (die vorherige .1 wird dabei überschrieben) und eine neue begonnen.
 */
const fs = require('node:fs');
const path = require('node:path');

function zeitstempel(d = new Date()) {
  const z = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ` +
    `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

function bereinige(text) {
  // Tabs/Zeilenumbrüche würden das Format zerstören
  return String(text ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function erstelleProtokoll({ datei, maxGroesseMB }, geheimnisse = []) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const maxBytes = maxGroesseMB * 1024 * 1024;
  const geheim = geheimnisse.filter((g) => typeof g === 'string' && g.length >= 4);

  function rotiereFallsNoetig() {
    try {
      if (fs.statSync(datei).size >= maxBytes) fs.renameSync(datei, datei + '.1');
    } catch { /* Datei existiert noch nicht – kein Problem */ }
  }

  function schreibe(geraet, befehl, ergebnis, details = '') {
    let zeile = [zeitstempel(), geraet, befehl, ergebnis, details].map(bereinige).join('\t') + '\n';
    for (const g of geheim) zeile = zeile.split(g).join('***');
    try {
      rotiereFallsNoetig();
      fs.appendFileSync(datei, zeile, 'utf8');
    } catch (e) {
      // Protokoll darf den Server niemals zum Absturz bringen
      console.error(`[Protokoll] Konnte nicht schreiben: ${e.message}`);
    }
    if (process.env.KUECHE_LEISE !== '1') process.stdout.write(zeile);
  }

  return { schreibe };
}

module.exports = { erstelleProtokoll, zeitstempel };
