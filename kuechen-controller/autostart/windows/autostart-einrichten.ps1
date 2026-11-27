# Richtet den Kuechen-Controller unter Windows 10/11 ein:
#   1. Geplante Aufgabe: startet den Server bei jedem Hochfahren
#      (auch ohne Anmeldung) und startet ihn nach Absturz neu.
#   2. Firewall-Regel: Port nur fuer das lokale Heimnetz oeffnen.
#
# Aufruf: PowerShell ALS ADMINISTRATOR oeffnen, dann:
#   powershell -ExecutionPolicy Bypass -File autostart\windows\autostart-einrichten.ps1
#
# Entfernen:
#   Unregister-ScheduledTask -TaskName "Kuechen-Controller" -Confirm:$false
#   Remove-NetFirewallRule -DisplayName "Kuechen-Controller (Heimnetz)"

$ErrorActionPreference = 'Stop'

$istAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $istAdmin) {
  Write-Host "Bitte PowerShell als Administrator starten (Rechtsklick -> Als Administrator ausfuehren)." -ForegroundColor Red
  exit 1
}

$projekt = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "Node.js wurde nicht gefunden. Bitte zuerst installieren (siehe README)." -ForegroundColor Red
  exit 1
}

# Port aus der Konfiguration lesen (nichts fest eingetragen)
$konfigDatei = Join-Path $projekt 'konfiguration\config.json'
if (-not (Test-Path $konfigDatei)) {
  Write-Host "config.json fehlt noch. Bitte den Server einmal von Hand starten (start.bat), dann dieses Skript erneut ausfuehren." -ForegroundColor Yellow
  exit 1
}
$port = (Get-Content $konfigDatei -Raw -Encoding UTF8 | ConvertFrom-Json).server.port

Write-Host "Projektordner: $projekt"
Write-Host "Node.js:       $node"
Write-Host "Port:          $port"

# 1. Geplante Aufgabe
$aktion   = New-ScheduledTaskAction -Execute $node -Argument "`"$projekt\server\server.js`"" -WorkingDirectory $projekt
$ausloeser = New-ScheduledTaskTrigger -AtStartup
$ausloeser.Delay = 'PT30S'   # 30 Sekunden warten, bis das Netzwerk bereit ist
$benutzer = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
$optionen = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName 'Kuechen-Controller' -Action $aktion -Trigger $ausloeser `
  -Principal $benutzer -Settings $optionen -Description 'Kuechen-Controller fuer Shelly-Geraete' -Force | Out-Null
Start-ScheduledTask -TaskName 'Kuechen-Controller'
Write-Host "Geplante Aufgabe 'Kuechen-Controller' eingerichtet und gestartet." -ForegroundColor Green

# 2. Firewall: nur Heimnetz (LocalSubnet), nur private Netzwerke
Get-NetFirewallRule -DisplayName 'Kuechen-Controller (Heimnetz)' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Kuechen-Controller (Heimnetz)' -Direction Inbound -Protocol TCP `
  -LocalPort $port -RemoteAddress LocalSubnet -Profile Private -Action Allow | Out-Null
Write-Host "Firewall-Regel eingerichtet (Port $port, nur Heimnetz)." -ForegroundColor Green
Write-Host ""
Write-Host "Wichtig: Das WLAN/LAN dieses PCs muss in Windows als 'Privates Netzwerk' eingestellt sein." -ForegroundColor Yellow
Write-Host "(Einstellungen -> Netzwerk und Internet -> Eigenschaften -> Netzwerkprofil: Privat)"
