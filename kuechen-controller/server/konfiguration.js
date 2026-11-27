'use strict';
/**
 * Lädt und prüft die Konfiguration (konfiguration/config.json).
 *
 * - Fehlt config.json, wird sie aus config.example.json erzeugt.
 * - Ist noch kein echter Zugangsschlüssel eingetragen, wird ein zufälliger
 *   erzeugt und in config.json gespeichert.
 * - Fehler in der Datei werden mit einer verständlichen Meldung gemeldet.
 *
 * Für Tests kann ein anderer Pfad über die Umgebungsvariable KUECHE_CONFIG
 * angegeben werden.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJEKT_ORDNER = path.resolve(__dirname, '..');
const STANDARD_PFAD = path.join(PROJEKT_ORDNER, 'konfiguration', 'config.json');
const VORLAGE_PFAD = path.join(PROJEKT_ORDNER, 'konfiguration', 'config.example.json');
const MIN_SCHLUESSEL_LAENGE = 16;

class KonfigFehler extends Error {}

function neuerSchluessel() {
  // 24 zufällige Bytes -> 32 Zeichen, gut abtippbar (keine + / =)
  return crypto.randomBytes(24).toString('base64url');
}

function istPlatzhalter(schluessel) {
  return typeof schluessel !== 'string'
    || schluessel.length < MIN_SCHLUESSEL_LAENGE
    || schluessel.startsWith('WIRD-BEIM-ERSTEN-START');
}

function pruefe(bedingung, meldung) {
  if (!bedingung) throw new KonfigFehler(meldung);
}

function istText(wert) {
  return typeof wert === 'string' && wert.trim() !== '';
}

function validiere(k) {
  pruefe(k && typeof k === 'object', 'Die Konfiguration ist leer oder kein gültiges JSON-Objekt.');

  // Server
  pruefe(k.server && Number.isInteger(k.server.port) && k.server.port > 0 && k.server.port < 65536,
    '„server.port" muss eine Zahl zwischen 1 und 65535 sein.');
  pruefe(istText(k.server.adresse), '„server.adresse" fehlt (z. B. "0.0.0.0").');

  // Sicherheit
  const s = k.sicherheit;
  pruefe(s && typeof s === 'object', 'Der Abschnitt „sicherheit" fehlt.');
  pruefe(Array.isArray(s.erlaubteNetze) && s.erlaubteNetze.length > 0,
    '„sicherheit.erlaubteNetze" muss mindestens ein Netz enthalten.');
  pruefe(Number.isInteger(s.maxFehlversuche) && s.maxFehlversuche > 0,
    '„sicherheit.maxFehlversuche" muss eine positive Zahl sein.');
  pruefe(typeof s.sperrzeitMinuten === 'number' && s.sperrzeitMinuten >= 0,
    '„sicherheit.sperrzeitMinuten" muss eine Zahl ≥ 0 sein.');

  // Testmodus
  pruefe(k.testmodus && typeof k.testmodus.aktiv === 'boolean',
    '„testmodus.aktiv" muss true oder false sein.');
  if (k.testmodus.nichtErreichbar !== undefined) {
    pruefe(Array.isArray(k.testmodus.nichtErreichbar), '„testmodus.nichtErreichbar" muss eine Liste sein.');
  }

  // Shelly
  pruefe(k.shelly && Number.isInteger(k.shelly.zeitlimitMs) && k.shelly.zeitlimitMs >= 200,
    '„shelly.zeitlimitMs" muss eine Zahl ab 200 sein.');

  // Protokoll
  pruefe(k.protokoll && istText(k.protokoll.datei), '„protokoll.datei" fehlt.');
  pruefe(typeof k.protokoll.maxGroesseMB === 'number' && k.protokoll.maxGroesseMB > 0,
    '„protokoll.maxGroesseMB" muss eine Zahl größer 0 sein.');

  // Oberfläche
  const o = k.oberflaeche;
  pruefe(o && istText(o.titel), '„oberflaeche.titel" fehlt.');
  pruefe(typeof o.aktualisierungSekunden === 'number' && o.aktualisierungSekunden >= 2,
    '„oberflaeche.aktualisierungSekunden" muss mindestens 2 sein.');
  pruefe(o.farben && typeof o.farben === 'object', '„oberflaeche.farben" fehlt.');
  pruefe(o.schriftgroessen && typeof o.schriftgroessen === 'object', '„oberflaeche.schriftgroessen" fehlt.');
  // Farben/Schriftgrößen landen in CSS -> nur harmlose Zeichen erlauben
  const cssWert = /^[#a-zA-Z0-9.,%() -]+$/;
  for (const [name, wert] of Object.entries({ ...o.farben, ...o.schriftgroessen })) {
    pruefe(typeof wert === 'string' && cssWert.test(wert),
      `Der Wert für „${name}" in der Oberfläche ist ungültig: ${JSON.stringify(wert)}`);
  }

  // Geräte
  pruefe(Array.isArray(k.geraete), '„geraete" muss eine Liste sein (darf leer sein).');
  const ids = new Set();
  k.geraete.forEach((g, i) => {
    const wo = `Gerät Nr. ${i + 1}`;
    pruefe(g && typeof g === 'object', `${wo} ist kein gültiger Eintrag.`);
    pruefe(istText(g.id) && /^[a-z0-9_-]+$/.test(g.id),
      `${wo}: „id" darf nur Kleinbuchstaben, Ziffern, - und _ enthalten (z. B. "deckenlicht").`);
    pruefe(!ids.has(g.id), `${wo}: Die id „${g.id}" kommt doppelt vor.`);
    ids.add(g.id);
    pruefe(istText(g.name), `${wo} („${g.id}"): „name" fehlt.`);
    pruefe(istText(g.ip) && /^[a-zA-Z0-9.:[\]-]+$/.test(g.ip),
      `${wo} („${g.id}"): „ip" fehlt oder ist ungültig.`);
    pruefe(g.generation === 1 || g.generation === 2,
      `${wo} („${g.id}"): „generation" muss 1 (ältere Shellys) oder 2 (Plus/Pro/Gen3/Gen4) sein.`);
    pruefe(Number.isInteger(g.kanal) && g.kanal >= 0,
      `${wo} („${g.id}"): „kanal" muss 0 oder größer sein.`);
  });
}

/**
 * Lädt die Konfiguration. Gibt { konfig, pfad, neuerSchluessel } zurück.
 * neuerSchluessel ist gesetzt, wenn gerade ein Schlüssel erzeugt wurde.
 */
function ladeKonfiguration(pfad = process.env.KUECHE_CONFIG || STANDARD_PFAD) {
  if (!fs.existsSync(pfad)) {
    if (!fs.existsSync(VORLAGE_PFAD)) {
      throw new KonfigFehler(`Keine Konfiguration gefunden: ${pfad}`);
    }
    fs.copyFileSync(VORLAGE_PFAD, pfad);
  }

  let roh;
  try {
    roh = fs.readFileSync(pfad, 'utf8');
  } catch (e) {
    throw new KonfigFehler(`Die Konfiguration konnte nicht gelesen werden (${pfad}): ${e.message}`);
  }

  let konfig;
  try {
    konfig = JSON.parse(roh);
  } catch (e) {
    throw new KonfigFehler(
      `In ${path.basename(pfad)} ist ein Schreibfehler (kein gültiges JSON). ` +
      `Häufige Ursachen: fehlendes Komma, Komma nach dem letzten Eintrag, fehlende Anführungszeichen. ` +
      `Details: ${e.message}`);
  }

  validiere(konfig);

  let erzeugt = null;
  if (istPlatzhalter(konfig.sicherheit.zugangsschluessel)) {
    erzeugt = neuerSchluessel();
    konfig.sicherheit.zugangsschluessel = erzeugt;
    fs.writeFileSync(pfad, JSON.stringify(konfig, null, 2) + '\n', { mode: 0o600 });
  }

  // Protokollpfad relativ zum Projektordner auflösen
  konfig.protokoll.datei = path.resolve(PROJEKT_ORDNER, konfig.protokoll.datei);
  konfig.testmodus.nichtErreichbar = konfig.testmodus.nichtErreichbar || [];
  konfig.testmodus.antwortzeitMs = konfig.testmodus.antwortzeitMs ?? 250;

  return { konfig, pfad, neuerSchluessel: erzeugt };
}

module.exports = { ladeKonfiguration, validiere, KonfigFehler, PROJEKT_ORDNER };
