'use strict';
/**
 * Testmodus: Dummy-Geräte, die sich wie echte Shellys verhalten, aber nichts
 * schalten. Der Zustand (an/aus) wird nur im Speicher gemerkt.
 *
 * Gleiche Schnittstelle wie shelly.js: status(geraet) und schalten(geraet, aktion).
 *
 * Einstellungen in der Konfiguration (Abschnitt "testmodus"):
 *   aktiv            true = Testmodus an
 *   antwortzeitMs    künstliche Verzögerung, damit es sich echt anfühlt
 *   nichtErreichbar  Liste von Geräte-ids, die absichtlich nicht antworten
 *                    (zum Ausprobieren der Fehlermeldungen)
 */
const { GeraeteFehler } = require('./shelly');

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

function erstelleTestTreiber(geraete, { antwortzeitMs = 250, nichtErreichbar = [] }) {
  const zustand = new Map(geraete.map((g) => [g.id, false]));
  const kaputt = new Set(nichtErreichbar);

  async function pruefeErreichbar(geraet) {
    await warte(antwortzeitMs);
    if (kaputt.has(geraet.id)) {
      throw new GeraeteFehler(
        `„${geraet.name}" antwortet nicht (Testmodus: absichtlich nicht erreichbar). ` +
        `Ist das Gerät eingeschaltet und im WLAN?`, 'nicht_erreichbar');
    }
  }

  async function status(geraet) {
    await pruefeErreichbar(geraet);
    return { an: zustand.get(geraet.id) === true };
  }

  async function schalten(geraet, aktion) {
    await pruefeErreichbar(geraet);
    const neu = aktion === 'umschalten' ? !zustand.get(geraet.id) : aktion === 'an';
    zustand.set(geraet.id, neu);
    return { an: neu };
  }

  return { name: 'test', status, schalten };
}

module.exports = { erstelleTestTreiber };
