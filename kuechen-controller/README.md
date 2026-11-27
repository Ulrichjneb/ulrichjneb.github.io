# 🍳 Küchen-Controller

Eine Steuerung für Shelly-Schalter in der Küche.
Ein alter PC läuft dauerhaft als kleiner **Server** im Heimnetz. Ein **iPad** zeigt eine einfache Bedienoberfläche im Vollbild. Der PC spricht **direkt** mit den Shellys im WLAN, ganz ohne Shelly-Cloud.

```
  iPad (Oberfläche)  ──WLAN──▶  alter PC (Server)  ──WLAN──▶  Shelly-Schalter
     tippen                     prüft & protokolliert          schalten
```

## 📑 Inhalt

1. [Was wird gebraucht?](#1-was-wird-gebraucht)
2. [Erster Start](#2-erster-start)
3. [iPad einrichten](#3-ipad-einrichten)
4. [Einstellungen ändern (config.json)](#4-einstellungen-ändern-configjson)
5. [Automatischer Start](#5-automatischer-start)
6. [Sicherheit](#6-sicherheit)
7. [Protokoll](#7-protokoll)
8. [Testen](#8-testen)
9. [Hilfe bei Problemen](#9-hilfe-bei-problemen)
10. [Ordnerübersicht](#10-ordnerübersicht)

---

## 1. Was wird gebraucht?

- Ein PC, der dauerhaft läuft und per LAN oder WLAN im Heimnetz hängt (Windows oder Linux).
- **Node.js** ab Version 18. Download unter [nodejs.org](https://nodejs.org), die Version mit „LTS" wählen.
  Weitere Pakete braucht der Server nicht.
- Ein iPad im selben WLAN.

> 💡 Prüfen, ob Node.js installiert ist: Eingabeaufforderung bzw. Terminal öffnen und `node --version` eintippen. Erscheint eine Zahl wie `v22.11.0`, ist alles gut.

## 2. Erster Start

1. Den Ordner `kuechen-controller` auf den PC kopieren, z. B. nach `C:\kuechen-controller` oder `/home/ben/kuechen-controller`.
2. Im Ordner ein Terminal öffnen und eintippen:

   ```
   node server/server.js
   ```

   Unter Windows geht es auch per Doppelklick auf `autostart\windows\start.bat`.

3. Beim **allerersten** Start passiert automatisch:
   - Die Datei `konfiguration/config.json` wird aus der Vorlage erzeugt.
   - Ein zufälliger **Zugangsschlüssel** wird erzeugt und angezeigt:

   ```
   🔑 Neuer Zugangsschlüssel wurde erzeugt und in der Konfiguration gespeichert:
      nw8cObXDCNiihlkLf3KU7MwFKQD-0ATj
   ```

   Diesen Schlüssel brauchst du gleich für das iPad. Er steht jederzeit auch in `config.json` unter `sicherheit` → `zugangsschluessel`.

4. Am Anfang ist der **Testmodus** an. Es wird also noch nichts Echtes geschaltet.

**Stoppen:** Im Terminal `Strg + C` drücken.

## 3. iPad einrichten

1. Die **IP-Adresse des PCs** herausfinden:
   - Windows: `ipconfig` eintippen und bei „IPv4-Adresse" nachsehen (z. B. `192.168.178.20`).
   - Linux: `hostname -I` eintippen.
   - Tipp: Im Router für den PC eine **feste IP-Adresse** einstellen, damit sie sich nie ändert.
2. Auf dem iPad in **Safari** öffnen: `http://192.168.178.20:8080`. Die eigene IP und den eigenen Port verwenden.
3. Den Zugangsschlüssel eingeben und auf **Speichern** tippen.
4. Für den Vollbildmodus: **Teilen-Symbol** (Quadrat mit Pfeil) → **„Zum Home-Bildschirm"** → **Hinzufügen**.
5. Die App jetzt über das neue Symbol auf dem Startbildschirm öffnen. Sie läuft dann ohne Browserleiste.
   Den Schlüssel dort **noch einmal eingeben**, denn die Startbildschirm-App hat ihren eigenen Speicher.

> 💡 **Abkürzung:** Statt den Schlüssel abzutippen, kann man einmal `http://192.168.178.20:8080/#schluessel=DEIN-SCHLÜSSEL` öffnen. Die Seite übernimmt ihn und entfernt ihn sofort aus der Adresszeile.

**Bedienung:** Tippen auf eine Kachel schaltet das Gerät um.

| Aussehen | Bedeutung |
|---|---|
| 🟧 Orange gefüllt, „An" | Gerät ist eingeschaltet |
| ⬜ Hell, „Aus" | Gerät ist ausgeschaltet |
| 🟥 Rot gestrichelt, „Nicht erreichbar" | Gerät antwortet nicht. Unten erscheint eine Meldung mit Hinweis. |
| Blass, „Schaltet …" | Befehl ist unterwegs |

## 4. Einstellungen ändern (config.json)

**Alle** Einstellungen stehen in `konfiguration/config.json`. Im Programmcode muss nichts geändert werden.
Nach jeder Änderung den **Server neu starten**.

> ⚠️ Die Datei ist im JSON-Format: Texte stehen in `"Anführungszeichen"`, zwischen Einträgen steht ein Komma, aber **nach dem letzten Eintrag kein Komma**. Bei einem Tippfehler zeigt der Server beim Start eine verständliche Meldung.

| Abschnitt | Einstellung | Bedeutung |
|---|---|---|
| `server` | `port` | Port, unter dem die Oberfläche erreichbar ist (Standard `8080`) |
| | `adresse` | `"0.0.0.0"` = auf allen Netzwerkverbindungen des PCs erreichbar |
| `sicherheit` | `zugangsschluessel` | Geheimer Schlüssel für das iPad. Zum Erneuern einfach löschen bzw. auf `""` setzen, dann wird beim nächsten Start ein neuer erzeugt. |
| | `erlaubteNetze` | Nur Geräte aus diesen Netzen dürfen zugreifen (Standard: alle üblichen Heimnetze) |
| | `maxFehlversuche` / `sperrzeitMinuten` | Nach so vielen falschen Schlüsseln wird das Gerät so lange gesperrt |
| `testmodus` | `aktiv` | `true` = nur simulieren, `false` = echte Shellys schalten |
| | `antwortzeitMs` | Künstliche Verzögerung im Testmodus (in Millisekunden) |
| | `nichtErreichbar` | Geräte-ids, die im Testmodus absichtlich „kaputt" sind, zum Ausprobieren der Fehlermeldungen |
| `shelly` | `zeitlimitMs` | So lange wird auf einen Shelly gewartet (3000 = 3 Sekunden) |
| `protokoll` | `datei` / `maxGroesseMB` | Wo das Protokoll liegt und wie groß es werden darf |
| `oberflaeche` | `titel` | Überschrift, z. B. „Küche" |
| | `aktualisierungSekunden` | Wie oft das iPad den Status neu abfragt |
| | `farben` | Alle Farben als Farbcode (z. B. `"#e9a23b"`). `an` = Farbe eingeschalteter Kacheln. |
| | `schriftgroessen` | Schriftgrößen (z. B. `"26px"`) |
| `geraete` | Liste | Die Geräte (siehe unten) |

**Ein Gerät** sieht so aus:

```json
{ "id": "deckenlicht", "name": "Deckenlicht", "ip": "192.168.1.101", "generation": 2, "kanal": 0 }
```

- `id`: interner Kurzname, nur Kleinbuchstaben, Ziffern, `-` und `_`
- `name`: wird auf dem iPad angezeigt
- `ip`: IP-Adresse des Shellys (in der Shelly-App unter Geräteinformationen)
- `generation`: `1` für ältere Shellys (Shelly 1, 2.5, Plug S …), `2` für **Plus / Pro / Gen3 / Gen4**
- `kanal`: bei Geräten mit einem Schalter `0`. Bei Mehrfach-Schaltern zählt man ab `0`.

> 📌 Die vier Geräte in der Vorlage sind **nur Platzhalter** für den Testmodus. Die echte Zuordnung folgt später.

## 5. Automatischer Start

Damit der Server nach jedem Neustart des PCs von selbst läuft:

### 🐧 Linux (Ubuntu, Debian, Mint, Raspberry Pi OS …)

Im Ordner `kuechen-controller` einmal eintippen:

```bash
sudo bash autostart/linux/einrichten.sh
```

Fertig. Der Server läuft als Systemdienst und wird nach einem Absturz nach 5 Sekunden neu gestartet.

| Was | Befehl |
|---|---|
| Läuft er? | `systemctl status kuechen-controller` |
| Nach Änderung an config.json | `sudo systemctl restart kuechen-controller` |
| Live-Meldungen ansehen | `journalctl -u kuechen-controller -f` |
| Autostart abschalten | `sudo systemctl disable --now kuechen-controller` |

### 🪟 Windows 10 / 11

1. Den Server **einmal von Hand** starten (`start.bat`), damit `config.json` entsteht. Dann das Fenster schließen.
2. **PowerShell als Administrator** öffnen (Startmenü → „PowerShell" → Rechtsklick → *Als Administrator ausführen*).
3. In den Projektordner wechseln, z. B. `cd C:\kuechen-controller`, und eintippen:

   ```powershell
   powershell -ExecutionPolicy Bypass -File autostart\windows\autostart-einrichten.ps1
   ```

Das Skript richtet ein:
- eine **geplante Aufgabe**, die den Server bei jedem Hochfahren startet (auch ohne Anmeldung) und ihn bei Absturz neu startet,
- eine **Firewall-Regel**, die den Port **nur für das Heimnetz** öffnet.

> ⚠️ Das Netzwerk des PCs muss in Windows auf **„Privat"** stehen: *Einstellungen → Netzwerk und Internet → (WLAN/Ethernet) → Eigenschaften → Netzwerkprofil: Privat*.

| Was | Wie |
|---|---|
| Nach Änderung an config.json | Aufgabenplanung öffnen → „Kuechen-Controller" → Rechtsklick → *Beenden*, dann *Ausführen*. Oder den PC neu starten. |
| Autostart entfernen | In Admin-PowerShell: `Unregister-ScheduledTask -TaskName "Kuechen-Controller" -Confirm:$false` |

> 💡 Zusätzlich im BIOS bzw. in den Energieoptionen einstellen: **Energiesparmodus aus** und *„Nach Stromausfall automatisch einschalten"* (falls vorhanden).

## 6. Sicherheit

- 🏠 **Nur Heimnetz:** Der Server beantwortet nur Anfragen aus den Netzen in `erlaubteNetze`. Im Router **keine Portfreigabe** für den PC einrichten, dann ist er aus dem Internet gar nicht erreichbar.
- 🔑 **Zugangsschlüssel:** Jeder Befehl braucht den Schlüssel. Er steht nur in `config.json` und **nie im Code**.
- 🚫 **Schutz vor Raten:** Nach 10 falschen Schlüsseln wird das Gerät 15 Minuten gesperrt.
- 📝 **Protokoll ohne Geheimnisse:** Der Schlüssel wird nie protokolliert.
- ☁️ **GitHub:** `config.json` und das Protokoll werden über `.gitignore` **nie hochgeladen**. Auf GitHub liegt nur die Vorlage ohne Schlüssel.

> ℹ️ Die Verbindung im Heimnetz ist unverschlüsselt (http). Das ist für ein privates Heimnetz üblich. Wer das WLAN-Passwort nicht kennt, kann nicht mitlesen.

## 7. Protokoll

Jede Aktion wird in `protokoll/aktionen.log` festgehalten, eine Zeile pro Aktion:

```
Zeit                 Gerät                      Befehl        Ergebnis  Details
2026-11-27 17:00:33  Deckenlicht (deckenlicht)  einschalten   OK        jetzt an
2026-11-27 17:00:33  Dunstabzug (dunstabzug)    umschalten    FEHLER    „Dunstabzug" antwortet nicht …
2026-11-27 17:00:33  -                          Anmeldung     ABGELEHNT falscher oder fehlender Zugangsschlüssel von 192.168.1.30
```

- Statusabfragen werden nur protokolliert, wenn ein Gerät **ausfällt** oder **wieder erreichbar** ist. So bleibt die Datei übersichtlich.
- Wird die Datei größer als `maxGroesseMB`, wird sie in `aktionen.log.1` umbenannt und neu begonnen.
- Die Datei lässt sich mit jedem Texteditor oder mit Excel öffnen (Spalten sind durch Tabulatoren getrennt).

## 8. Testen

Automatische Prüfung aller Funktionen (es wird dabei nichts Echtes geschaltet):

```
npm test
```

Am Ende sollte `# fail 0` stehen.

## 9. Hilfe bei Problemen

| Problem | Lösung |
|---|---|
| „Port 8080 ist schon belegt" | Läuft der Server schon (z. B. über den Autostart)? Sonst in `config.json` einen anderen Port eintragen. |
| iPad zeigt „Keine Verbindung zum Küchen-Server" | Läuft der PC? Stimmt die IP-Adresse? Ist das iPad im selben WLAN? Unter Windows: Netzwerk auf „Privat"? |
| iPad fragt immer wieder nach dem Schlüssel | Schlüssel in `config.json` nachsehen und genau abtippen (Groß-/Kleinschreibung beachten). |
| „Zu viele falsche Versuche" | 15 Minuten warten oder den Server neu starten. |
| Gerät „Nicht erreichbar" | Shelly eingeschaltet? IP-Adresse korrekt? Am besten im Router eine feste IP vergeben. |
| „verlangt ein Passwort" | Den Passwortschutz in der Shelly-App für dieses Gerät ausschalten. Unterstützung für Passwörter folgt später. |
| „hat den Befehl abgelehnt" | `generation` und `kanal` des Geräts in `config.json` prüfen. |

## 10. Ordnerübersicht

```
kuechen-controller/
├── README.md                    ← diese Anleitung
├── ENTWICKLUNGSPROTOKOLL.md     ← was in welchem Schritt gebaut wurde
├── package.json                 ← Projektbeschreibung, Befehle „npm start" und „npm test"
├── konfiguration/
│   ├── config.example.json      ← Vorlage (auf GitHub)
│   └── config.json              ← DEINE Einstellungen (entsteht beim 1. Start, nicht auf GitHub)
├── server/
│   ├── server.js                ← Zentrale: nimmt Anfragen an
│   ├── konfiguration.js         ← liest und prüft config.json
│   ├── sicherheit.js            ← Heimnetz- und Schlüsselprüfung
│   ├── shelly.js                ← spricht mit den echten Shellys
│   ├── testgeraete.js           ← Dummy-Geräte für den Testmodus
│   ├── protokoll.js             ← schreibt das Protokoll
│   └── statisch.js              ← liefert die Oberfläche aus
├── oberflaeche/
│   ├── index.html, stil.css, app.js   ← die iPad-Oberfläche
│   └── icons/                   ← App-Symbol für den Startbildschirm
├── autostart/
│   ├── linux/einrichten.sh
│   └── windows/start.bat, autostart-einrichten.ps1
├── tests/server.test.js         ← automatische Tests
└── protokoll/aktionen.log       ← entsteht beim Betrieb (nicht auf GitHub)
```
