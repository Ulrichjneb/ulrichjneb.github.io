@echo off
REM Startet den Kuechen-Controller von Hand (Fenster offen lassen).
REM Fuer den automatischen Start: autostart-einrichten.ps1 verwenden.
cd /d "%~dp0\..\.."
node server\server.js
pause
