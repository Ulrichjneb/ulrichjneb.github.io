'use strict';
/**
 * Sicherheit: Heimnetz-Prüfung, Zugangsschlüssel-Prüfung und Sperre nach
 * zu vielen Fehlversuchen.
 */
const crypto = require('node:crypto');
const net = require('node:net');

// ---------- IP-Adressen und Netze ----------

/** Wandelt eine IP-Adresse in { version, zahl } (BigInt) um oder null. */
function ipZuZahl(ip) {
  if (typeof ip !== 'string') return null;
  ip = ip.trim().replace(/^\[|\]$/g, '').split('%')[0]; // Klammern und Zonen-ID entfernen

  // IPv4 in IPv6 verpackt (z. B. ::ffff:192.168.1.5) -> als IPv4 behandeln
  const verpackt = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (verpackt) ip = verpackt[1];

  const version = net.isIP(ip);
  if (version === 4) {
    const teile = ip.split('.').map(Number);
    return { version: 4, zahl: teile.reduce((z, t) => (z << 8n) + BigInt(t), 0n) };
  }
  if (version === 6) {
    let [links, rechts] = ip.split('::');
    const l = links ? links.split(':') : [];
    let r = rechts !== undefined && rechts !== '' ? rechts.split(':') : [];
    // eingebettete IPv4 am Ende (z. B. 64:ff9b::1.2.3.4)
    const letzte = (rechts !== undefined ? r : l);
    if (letzte.length && letzte[letzte.length - 1].includes('.')) {
      const v4 = letzte.pop().split('.').map(Number);
      letzte.push(((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16));
    }
    const fehlend = rechts !== undefined ? 8 - l.length - r.length : 0;
    const gruppen = [...l, ...Array(fehlend).fill('0'), ...r];
    if (gruppen.length !== 8) return null;
    return { version: 6, zahl: gruppen.reduce((z, g) => (z << 16n) + BigInt(parseInt(g || '0', 16)), 0n) };
  }
  return null;
}

/** Wandelt "192.168.0.0/16" in ein prüfbares Netz um. */
function netzEinlesen(text) {
  const [adresse, laengeText] = String(text).split('/');
  const ip = ipZuZahl(adresse);
  if (!ip) throw new Error(`Ungültiges Netz in „erlaubteNetze": ${text}`);
  const bits = ip.version === 4 ? 32 : 128;
  const laenge = laengeText === undefined ? bits : Number(laengeText);
  if (!Number.isInteger(laenge) || laenge < 0 || laenge > bits) {
    throw new Error(`Ungültige Netzlänge in „erlaubteNetze": ${text}`);
  }
  const maske = laenge === 0 ? 0n : ((1n << BigInt(laenge)) - 1n) << BigInt(bits - laenge);
  return { version: ip.version, basis: ip.zahl & maske, maske, text };
}

function erstelleNetzPruefer(netzListe) {
  const netze = netzListe.map(netzEinlesen);
  return function istErlaubt(ip) {
    const a = ipZuZahl(ip);
    if (!a) return false;
    return netze.some((n) => n.version === a.version && (a.zahl & n.maske) === n.basis);
  };
}

// ---------- Zugangsschlüssel ----------

/** Vergleicht zwei Texte in konstanter Zeit (schützt vor Zeitmessungs-Angriffen). */
function schluesselStimmt(erwartet, erhalten) {
  if (typeof erhalten !== 'string' || erhalten.length === 0) return false;
  const a = crypto.createHash('sha256').update(erwartet).digest();
  const b = crypto.createHash('sha256').update(erhalten).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Liest den Schlüssel aus dem Header "Authorization: Bearer <schluessel>". */
function schluesselAusAnfrage(req) {
  const kopf = req.headers['authorization'] || '';
  const treffer = /^Bearer\s+(.+)$/i.exec(kopf);
  return treffer ? treffer[1].trim() : '';
}

// ---------- Sperre nach Fehlversuchen ----------

function erstelleSperre(maxFehlversuche, sperrzeitMinuten) {
  const versuche = new Map(); // ip -> { anzahl, gesperrtBis }
  const sperrzeitMs = sperrzeitMinuten * 60 * 1000;

  return {
    istGesperrt(ip) {
      const e = versuche.get(ip);
      if (!e || !e.gesperrtBis) return false;
      if (Date.now() >= e.gesperrtBis) { versuche.delete(ip); return false; }
      return true;
    },
    fehlversuch(ip) {
      const e = versuche.get(ip) || { anzahl: 0, gesperrtBis: 0 };
      e.anzahl += 1;
      if (e.anzahl >= maxFehlversuche) e.gesperrtBis = Date.now() + sperrzeitMs;
      versuche.set(ip, e);
      if (versuche.size > 1000) versuche.delete(versuche.keys().next().value); // Speicher begrenzen
      return e.anzahl;
    },
    erfolg(ip) { versuche.delete(ip); },
  };
}

module.exports = {
  ipZuZahl, erstelleNetzPruefer, schluesselStimmt, schluesselAusAnfrage, erstelleSperre,
};
