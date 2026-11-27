# 📒 Entwicklungsprotokoll – Küchen-Controller

Hier steht in einfachen Worten, was in welchem Schritt gebaut wurde. Zum späteren Nachlesen.

**Stand:** 27.11.2026 · Grundbaustein fertig, alle Tests im Testmodus bestanden.

---

## Schritt 1 – Projektstruktur 📁

**Fertig:** Ein eigener Ordner `kuechen-controller/` mit Unterordnern für Server, Oberfläche, Konfiguration, Autostart und Tests.

- Technik: **Node.js ohne Zusatzpakete.** Es wird nichts aus dem Internet nachgeladen, der Server ist dadurch schlank und schnell.
- Der Ordner liegt in deinem GitHub-Pages-Repository. Deshalb sind Geheimnisse (`config.json`, Protokoll) per `.gitignore` vom Hochladen ausgeschlossen.

## Schritt 2 – Konfiguration ⚙️

**Fertig:** Alle Einstellungen stehen in **einer** Datei: `konfiguration/config.json`.

- Darin: Port, erlaubte Netze, Zugangsschlüssel, Testmodus, Zeitlimit, Protokoll, Titel, Farben, Schriftgrößen, Geräte.
- Beim ersten Start wird die Datei aus der Vorlage erzeugt, mit einem **automatisch erzeugten, zufälligen Schlüssel**.
- Tippfehler in der Datei führen zu einer **verständlichen deutschen Meldung**, nicht zu einem rätselhaften Absturz.
- Im Code ist nichts fest eingetragen.

## Schritt 3 – Server 🖥️

**Fertig:** Der Server nimmt Befehle vom iPad an und gibt sie **direkt** an die Shellys weiter, ohne Cloud.

- Unterstützt **beide Shelly-Generationen**: ältere (Gen1) und Plus/Pro/Gen3/Gen4 (Gen2-Schnittstelle).
- Prüft **jede** Anfrage: Kommt sie aus dem Heimnetz? Stimmt der Schlüssel?
- Antwortet ein Shelly nicht, gibt es eine klare Meldung, z. B. *„Deckenlicht antwortet nicht. Ist das Gerät eingeschaltet und im WLAN?"*. Der Server läuft weiter.
- **Protokoll** jeder Aktion: Zeit, Gerät, Befehl, Ergebnis.
- Verbrauch: ca. **47 MB Arbeitsspeicher**. Das passt auch auf alte PCs.

## Schritt 4 – Testmodus 🧪

**Fertig:** Mit `"testmodus": { "aktiv": true }` gibt es Dummy-Geräte.

- Sie merken sich an/aus und antworten mit kleiner Verzögerung wie echte Geräte. Es wird aber nichts geschaltet.
- Über `nichtErreichbar` lassen sich Geräte absichtlich „kaputt" machen, um Fehlermeldungen zu sehen.
- Oben auf dem iPad steht dann ein grünes Abzeichen **„Testmodus"**.

## Schritt 5 – Oberfläche 📱

**Fertig:** Eine ruhige, gut lesbare iPad-Seite mit großen Kacheln.

- Eine Kachel pro Gerät mit Name und Status: **orange = an**, **hell = aus**, **rot gestrichelt = nicht erreichbar**.
- Uhrzeit und Datum oben rechts.
- Fehlermeldungen erscheinen unten als Hinweis, in Alltagssprache.
- **Vollbild** über „Zum Home-Bildschirm" mit eigenem App-Symbol.
- **Sparsam:** Die ganze Seite wiegt gepackt ca. **6 KB**. Bei erneutem Laden wird nur „unverändert" gemeldet (0 Bytes). Der Status wird nur abgefragt, solange der Bildschirm an ist.
- Farben und Schriftgrößen kommen aus der Konfiguration.

## Schritt 6 – Automatischer Start 🔁

**Fertig:** Einrichtungs-Skripte für **Linux** (Systemdienst) und **Windows** (geplante Aufgabe + Firewall-Regel nur fürs Heimnetz).

- Je einmal ausführen. Danach startet der Server bei jedem Hochfahren und nach einem Absturz von selbst neu.
- Anleitung: README, Abschnitt 5.
- ⚠️ Noch nicht auf dem echten PC ausprobiert, weil das Betriebssystem noch offen ist.

## Schritt 7 – Sicherheit 🔒

**Fertig:**

- Nur Anfragen aus dem Heimnetz (prüft der Server selbst, unter Windows zusätzlich die Firewall).
- Schlüssel nur in `config.json`, nie im Code, nie auf GitHub.
- Sperre nach 10 falschen Schlüsseln für 15 Minuten.
- Schlüssel steht nie im Protokoll. Zur Sicherheit wird jede Zeile zusätzlich danach durchsucht.
- Strenge Browser-Schutzregeln (kein fremder Code, keine Einbettung in fremde Seiten).

## Schritt 8 – Prüfung ✅

**13 automatische Tests, alle bestanden** (`npm test`). Dazu eine Sichtprüfung auf einem simulierten iPad.

| Bereich | Geprüft | Ergebnis |
|---|---|---|
| Konfiguration | Erzeugen, Schlüssel, Tippfehler-Meldungen, gefährliche Farbwerte abgelehnt | ✅ |
| Heimnetz | Heimnetz-Adressen erlaubt, Internet-Adressen abgelehnt (IPv4 + IPv6) | ✅ |
| Schlüssel | Fehlt/falsch → abgelehnt, Sperre nach Fehlversuchen | ✅ |
| Testmodus | Anzeigen, an, aus, umschalten, Zustand gemerkt | ✅ |
| Fehlerfall | Gerät antwortet nicht → klare Meldung, Server läuft weiter | ✅ |
| Shelly Gen1 + Gen2 | Mit nachgemachten Shellys: Status, an, aus, umschalten, falscher Kanal | ✅ |
| Zeitlimit / Passwort | Wartet nicht ewig, verständliche Meldungen | ✅ |
| Protokoll | Richtiges Format, kein Schlüssel | ✅ |
| Oberfläche | Lädt, gepackt, Zwischenspeicher, Vollbild-Angaben, kein Zugriff auf config.json | ✅ |
| iPad-Ansicht | Schlüssel-Eingabe, Kacheln, Fehlermeldung, Schlüssel gemerkt | ✅ |

### Noch offen

- [ ] Echte Shelly-Geräte zuordnen (eigene Aufgabe)
- [ ] Mit echten Shellys im Heimnetz testen
- [ ] Autostart auf dem echten PC einrichten (Betriebssystem angeben)
- [ ] Shellys mit Passwortschutz unterstützen (falls gewünscht)
- [ ] Geführter Zugriff auf dem iPad
