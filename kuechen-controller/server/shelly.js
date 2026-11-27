'use strict';
/**
 * Direkte Verbindung zu Shelly-Geräten im Heimnetz (ohne Shelly-Cloud).
 *
 * Unterstützt:
 *   generation 1  – ältere Shellys (z. B. Shelly 1, 2.5, Plug S)
 *                   http://<ip>/relay/<kanal>?turn=on|off|toggle
 *   generation 2  – Shelly Plus / Pro / Gen3 / Gen4
 *                   http://<ip>/rpc/Switch.Set?id=<kanal>&on=true|false
 *
 * Alle Funktionen geben ein Ergebnis zurück oder werfen einen GeraeteFehler
 * mit einer verständlichen deutschen Meldung. Sie bringen den Server nie zum
 * Absturz.
 */

class GeraeteFehler extends Error {
  constructor(meldung, art) {
    super(meldung);
    this.art = art; // 'nicht_erreichbar' | 'zeitlimit' | 'passwort' | 'antwort'
  }
}

function adresse(geraet) {
  return `http://${geraet.ip}`;
}

async function holeJson(geraet, pfad, zeitlimitMs) {
  let antwort;
  try {
    antwort = await fetch(adresse(geraet) + pfad, {
      signal: AbortSignal.timeout(zeitlimitMs),
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    const ursache = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'zeitlimit' : 'nicht_erreichbar';
    const meldung = ursache === 'zeitlimit'
      ? `„${geraet.name}" antwortet nicht (Zeitlimit überschritten). Ist das Gerät eingeschaltet und im WLAN?`
      : `„${geraet.name}" ist nicht erreichbar. Ist das Gerät eingeschaltet und stimmt die IP-Adresse (${geraet.ip})?`;
    throw new GeraeteFehler(meldung, ursache);
  }

  if (antwort.status === 401) {
    throw new GeraeteFehler(
      `„${geraet.name}" verlangt ein Passwort. Bitte den Passwortschutz in der Shelly-App ausschalten ` +
      `(Passwort-Unterstützung folgt später).`, 'passwort');
  }
  if (!antwort.ok) {
    throw new GeraeteFehler(
      `„${geraet.name}" hat den Befehl abgelehnt (Fehlercode ${antwort.status}). ` +
      `Stimmen „generation" und „kanal" in der Konfiguration?`, 'antwort');
  }
  try {
    return await antwort.json();
  } catch {
    throw new GeraeteFehler(`„${geraet.name}" hat eine unverständliche Antwort geschickt. Ist es wirklich ein Shelly?`, 'antwort');
  }
}

function erwarteBool(wert, geraet) {
  if (typeof wert !== 'boolean') {
    throw new GeraeteFehler(`„${geraet.name}" hat keinen Schaltzustand gemeldet. Stimmen „generation" und „kanal"?`, 'antwort');
  }
  return wert;
}

function erstelleShellyTreiber({ zeitlimitMs }) {
  /** Fragt den aktuellen Zustand ab. Ergebnis: { an: true|false } */
  async function status(geraet) {
    if (geraet.generation === 1) {
      const d = await holeJson(geraet, `/relay/${geraet.kanal}`, zeitlimitMs);
      return { an: erwarteBool(d.ison, geraet) };
    }
    const d = await holeJson(geraet, `/rpc/Switch.GetStatus?id=${geraet.kanal}`, zeitlimitMs);
    return { an: erwarteBool(d.output, geraet) };
  }

  /** Schaltet. aktion: 'an' | 'aus' | 'umschalten'. Ergebnis: { an: true|false } */
  async function schalten(geraet, aktion) {
    if (geraet.generation === 1) {
      const turn = { an: 'on', aus: 'off', umschalten: 'toggle' }[aktion];
      const d = await holeJson(geraet, `/relay/${geraet.kanal}?turn=${turn}`, zeitlimitMs);
      return { an: erwarteBool(d.ison, geraet) };
    }
    if (aktion === 'umschalten') {
      const d = await holeJson(geraet, `/rpc/Switch.Toggle?id=${geraet.kanal}`, zeitlimitMs);
      return { an: !erwarteBool(d.was_on, geraet) };
    }
    const an = aktion === 'an';
    await holeJson(geraet, `/rpc/Switch.Set?id=${geraet.kanal}&on=${an}`, zeitlimitMs);
    return { an };
  }

  return { name: 'shelly', status, schalten };
}

module.exports = { erstelleShellyTreiber, GeraeteFehler };
