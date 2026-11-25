; =====================================================================
;  claude-diktat.ahk  –  Claude nach vorne holen + Diktat starten
; =====================================================================
;  Was macht dieses Skript?
;    Du drückst eine Taste (Standard: F9), egal in welchem Programm.
;    Dann:
;      1. Das zuletzt benutzte Claude-Fenster kommt nach vorne.
;      2. Der Cursor wird ins Eingabefeld des Chats gesetzt.
;      3. Die Windows-Diktierfunktion (Windows-Taste + H) startet.
;    Enter wird NICHT gedrückt – du schickst selbst ab.
;
;  Sicherheit:
;    Das Skript lädt nichts herunter, geht nicht ins Internet,
;    braucht keine Admin-Rechte und installiert nichts.
;    Es aktiviert nur Fenster, klickt und sendet Tasten.
;
;  Benötigt: AutoHotkey Version 2 (nicht Version 1!)
; =====================================================================

#Requires AutoHotkey v2.0   ; Bricht mit einer Meldung ab, falls jemand das Skript mit Version 1 startet
#SingleInstance Force       ; Wenn du das Skript nochmal startest, ersetzt es die alte Kopie (keine Doppelten)


; =====================================================================
;  EINSTELLUNGEN  –  Nur hier musst du etwas ändern
; =====================================================================

; --- Die Taste, die alles auslöst ---
; Beispiele:  "F9"   "F8"   "^d" (= Strg+D)   "!d" (= Alt+D)   "^!d" (= Strg+Alt+D)
; Zeichen-Bedeutung:  ^ = Strg    ! = Alt    + = Umschalt    # = Windows-Taste
TASTE := "F9"

; --- Wartezeit, nachdem das Claude-Fenster nach vorne geholt wurde ---
; In Millisekunden (1000 = 1 Sekunde).
; Wenn der Klick manchmal "ins Leere" geht: Wert erhöhen, z.B. auf 600.
WARTEZEIT_NACH_AKTIVIEREN := 350

; --- Wartezeit zwischen Klick ins Eingabefeld und Start des Diktats ---
WARTEZEIT_VOR_DIKTAT := 200

; --- Wie soll der Cursor ins Eingabefeld kommen? ---
; "klick"  = Das Skript klickt unten in die Mitte des Fensters (empfohlen)
; "taste"  = Das Skript drückt ein Tastenkürzel (siehe FOKUS_TASTENKUERZEL unten)
; "nichts" = Das Skript macht hier gar nichts (nur Fenster nach vorne + Diktat)
FOKUS_METHODE := "klick"

; --- Nur für die Methode "klick": Wo genau wird geklickt? ---
; Waagerecht (links/rechts) in Prozent der Fensterbreite.
;   50 = genau Mitte,  40 = etwas weiter links,  60 = etwas weiter rechts
KLICK_WAAGERECHT_PROZENT := 50

; Senkrecht: Abstand vom UNTEREN Fensterrand in Pixeln.
;   Größere Zahl = Klick weiter oben.  Kleinere Zahl = weiter unten.
;   Die Zahl wird automatisch an deine Windows-Bildschirmskalierung (z.B. 125 %) angepasst.
KLICK_ABSTAND_VON_UNTEN := 110

; Soll die Maus nach dem Klick wieder dorthin zurück, wo sie vorher war?
;   true = ja,  false = nein (Maus bleibt über dem Eingabefeld)
MAUS_ZURUECK := true

; --- Nur für die Methode "taste": Welches Tastenkürzel? ---
; Trage hier ein Kürzel ein, das in DEINER Claude-Version ins Eingabefeld springt.
; Gleiche Schreibweise wie oben bei TASTE.  Beispiel: "^n" wäre Strg+N
; ACHTUNG: Strg+N öffnet in Claude meist einen NEUEN Chat – das willst du vermutlich nicht.
FOKUS_TASTENKUERZEL := ""

; --- Hilfstaste zum Einstellen der Klickposition ---
; Maus über das Eingabefeld von Claude halten und diese Taste drücken:
; Das Skript zeigt dir dann die passenden Zahlen für die Einstellungen oben.
; Leer lassen ("") um diese Hilfe auszuschalten.
HILFSTASTE_POSITION := "^F9"   ; = Strg+F9

; --- Welche Browser sollen durchsucht werden, falls die Claude-App nicht läuft? ---
BROWSER_PROGRAMME := ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"]

; =====================================================================
;  ENDE DER EINSTELLUNGEN  –  ab hier musst du nichts mehr ändern
; =====================================================================


; ---------------------------------------------------------------------
;  START: Tasten anmelden und kurze Info anzeigen
; ---------------------------------------------------------------------
try {
    Hotkey(TASTE, ClaudeDiktat)
} catch {
    MsgBox("Die Taste '" TASTE "' konnte nicht eingerichtet werden.`n"
         . "Bitte prüfe die Einstellung TASTE oben im Skript.", "Claude-Diktat", "Icon!")
    ExitApp()
}

if (HILFSTASTE_POSITION != "") {
    try Hotkey(HILFSTASTE_POSITION, PositionAnzeigen)
}

TrayTip("Drücke " TASTE ", um Claude mit Diktat zu öffnen.", "Claude-Diktat läuft")


; ---------------------------------------------------------------------
;  HAUPTABLAUF: Das passiert, wenn du die Taste drückst
; ---------------------------------------------------------------------
ClaudeDiktat(*) {
    ; Warten, bis du alle Zusatztasten (Strg, Alt, Umschalt, Windows) losgelassen hast.
    ; Sonst könnten sie sich mit den Tasten mischen, die das Skript gleich sendet.
    KeyWait("Control")
    KeyWait("Alt")
    KeyWait("Shift")
    KeyWait("LWin")
    KeyWait("RWin")

    ; Schritt 1: Claude-Fenster suchen
    fenster := ClaudeFensterFinden()
    if (!fenster) {
        MsgBox("Kein Claude-Fenster gefunden.`n`n"
             . "Bitte öffne die Claude-App oder claude.ai im Browser`n"
             . "(im Browser muss der Claude-Tab der aktive Tab sein).",
               "Claude-Diktat", "Icon! T6")   ; T6 = schließt sich nach 6 Sekunden von selbst
        return
    }

    ; Schritt 2: Fenster nach vorne holen
    if (WinGetMinMax(fenster) = -1)   ; -1 bedeutet: Fenster ist minimiert
        WinRestore(fenster)
    WinActivate(fenster)
    if (!WinWaitActive(fenster, , 2)) {   ; höchstens 2 Sekunden warten
        MsgBox("Das Claude-Fenster ließ sich nicht nach vorne holen.", "Claude-Diktat", "Icon! T4")
        return
    }
    Sleep(WARTEZEIT_NACH_AKTIVIEREN)

    ; Schritt 3: Cursor ins Eingabefeld
    if (FOKUS_METHODE = "klick")
        InsEingabefeldKlicken(fenster)
    else if (FOKUS_METHODE = "taste" && FOKUS_TASTENKUERZEL != "")
        Send(FOKUS_TASTENKUERZEL)
    Sleep(WARTEZEIT_VOR_DIKTAT)

    ; Schritt 4: Windows-Diktat starten (Windows-Taste + H)
    Send("#h")
}


; ---------------------------------------------------------------------
;  FENSTER FINDEN: erst die Claude-App, dann ein Browser-Fenster
; ---------------------------------------------------------------------
; WinGetList liefert die Fenster in der Reihenfolge "zuletzt benutzt zuerst".
; Deshalb ist der erste Treffer immer das zuletzt benutzte Claude-Fenster.
ClaudeFensterFinden() {
    ; 1. Versuch: Die Claude-Desktop-App (Programm Claude.exe)
    for id in WinGetList("ahk_exe Claude.exe") {
        try {
            if (WinGetTitle(id) != "")  ; unsichtbare Hilfsfenster ohne Titel überspringen
                return id
        }
    }

    ; 2. Versuch: Ein Browser-Fenster, dessen Titel "Claude" enthält
    for id in WinGetList() {
        try {
            programm := WinGetProcessName(id)
            titel    := WinGetTitle(id)
        } catch {
            continue    ; Fenster ist inzwischen verschwunden oder gesperrt -> überspringen
        }
        for browser in BROWSER_PROGRAMME {
            if (programm = browser && InStr(titel, "Claude"))
                return id
        }
    }

    ; Nichts gefunden
    return 0
}


; ---------------------------------------------------------------------
;  KLICK INS EINGABEFELD
; ---------------------------------------------------------------------
InsEingabefeldKlicken(fenster) {
    CoordMode("Mouse", "Screen")    ; Alle Maus-Angaben beziehen sich auf den ganzen Bildschirm

    ; Aktuelle Mausposition merken (für später)
    MouseGetPos(&alteX, &alteY)

    ; Position und Größe des Fenster-Inhalts holen (ohne Rahmen)
    WinGetClientPos(&fx, &fy, &breite, &hoehe, fenster)

    ; Klickpunkt ausrechnen
    skalierung := A_ScreenDPI / 96   ; 1.0 bei 100 %, 1.25 bei 125 % usw.
    klickX := fx + Round(breite * KLICK_WAAGERECHT_PROZENT / 100)
    klickY := fy + hoehe - Round(KLICK_ABSTAND_VON_UNTEN * skalierung)

    ; Klicken
    Click(klickX, klickY)

    ; Maus zurück an die alte Stelle (falls eingestellt)
    if (MAUS_ZURUECK)
        MouseMove(alteX, alteY, 0)
}


; ---------------------------------------------------------------------
;  HILFE: Passende Klick-Werte anzeigen (Strg+F9)
; ---------------------------------------------------------------------
; Halte die Maus über das Eingabefeld von Claude und drücke Strg+F9.
; Es erscheint ein Hinweis mit den Zahlen, die du oben eintragen kannst.
PositionAnzeigen(*) {
    CoordMode("Mouse", "Screen")
    MouseGetPos(&mx, &my, &fenster)
    try WinGetClientPos(&fx, &fy, &breite, &hoehe, fenster)
    catch
        return   ; Unter der Maus ist kein Fenster -> nichts anzeigen
    skalierung := A_ScreenDPI / 96

    prozent := Round((mx - fx) / breite * 100)
    abstand := Round((fy + hoehe - my) / skalierung)

    ToolTip("Trage oben im Skript ein:`n"
          . "KLICK_WAAGERECHT_PROZENT := " prozent "`n"
          . "KLICK_ABSTAND_VON_UNTEN := " abstand)
    SetTimer(() => ToolTip(), -8000)   ; Hinweis nach 8 Sekunden ausblenden
}
