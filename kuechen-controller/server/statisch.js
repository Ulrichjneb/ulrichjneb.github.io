'use strict';
/**
 * Liefert die Dateien der Oberfläche (HTML, CSS, JS, Icons) aus.
 *
 * Sparsam mit Daten:
 *  - Textdateien werden einmal gzip-komprimiert und im Speicher gehalten.
 *  - Mit ETag antwortet der Server "304 – unverändert", wenn das iPad die
 *    Datei schon hat. Dann wird gar nichts übertragen.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const KOMPRIMIERBAR = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg']);

/** Bereitet einen Inhalt (Buffer) für die Auslieferung vor. */
function vorbereiten(inhalt, endung) {
  const etag = '"' + crypto.createHash('sha1').update(inhalt).digest('base64url').slice(0, 20) + '"';
  const gz = KOMPRIMIERBAR.has(endung) && inhalt.length > 512 ? zlib.gzipSync(inhalt, { level: 9 }) : null;
  return { inhalt, gz, etag, typ: TYPEN[endung] || 'application/octet-stream' };
}

/** Sendet einen vorbereiteten Eintrag mit ETag/gzip-Unterstützung. */
function sende(req, res, eintrag, cacheControl = 'no-cache') {
  const kopf = { 'Content-Type': eintrag.typ, ETag: eintrag.etag, 'Cache-Control': cacheControl, Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === eintrag.etag) {
    res.writeHead(304, kopf);
    return res.end();
  }
  const gzipOk = eintrag.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const koerper = gzipOk ? eintrag.gz : eintrag.inhalt;
  if (gzipOk) kopf['Content-Encoding'] = 'gzip';
  kopf['Content-Length'] = koerper.length;
  res.writeHead(200, kopf);
  res.end(req.method === 'HEAD' ? undefined : koerper);
}

/** Lädt alle Dateien eines Ordners einmalig in den Speicher. */
function erstelleDateiAuslieferung(ordner) {
  const dateien = new Map();
  (function einlesen(dir, praefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const voll = path.join(dir, e.name);
      const url = praefix + e.name;
      if (e.isDirectory()) einlesen(voll, url + '/');
      else dateien.set(url, vorbereiten(fs.readFileSync(voll), path.extname(e.name).toLowerCase()));
    }
  })(ordner, '/');

  return function liefere(req, res, pfad) {
    if (pfad === '/') pfad = '/index.html';
    const eintrag = dateien.get(pfad);
    if (!eintrag) return false;
    // Icons ändern sich selten -> 1 Tag zwischenspeichern; Rest immer kurz nachfragen (304)
    const cache = pfad.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache';
    sende(req, res, eintrag, cache);
    return true;
  };
}

module.exports = { erstelleDateiAuslieferung, vorbereiten, sende };
