#!/usr/bin/env bash
# Richtet den Küchen-Controller als Systemdienst ein (Linux mit systemd,
# z. B. Ubuntu, Debian, Linux Mint, Raspberry Pi OS).
#
# Aufruf (im Ordner kuechen-controller):
#   sudo bash autostart/linux/einrichten.sh
#
# Danach startet der Server bei jedem Hochfahren automatisch und wird nach
# einem Absturz nach 5 Sekunden neu gestartet.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte mit sudo ausführen:  sudo bash autostart/linux/einrichten.sh"
  exit 1
fi

PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE="$(command -v node || true)"
BENUTZER="${SUDO_USER:-$(stat -c %U "$PROJEKT")}"
DIENST=/etc/systemd/system/kuechen-controller.service

if [ -z "$NODE" ]; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst installieren (siehe README)."
  exit 1
fi

echo "Projektordner: $PROJEKT"
echo "Node.js:       $NODE ($("$NODE" --version))"
echo "Läuft als:     $BENUTZER"

cat > "$DIENST" <<EOF
[Unit]
Description=Küchen-Controller (Shelly-Steuerung für das iPad)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$BENUTZER
WorkingDirectory=$PROJEKT
ExecStart=$NODE $PROJEKT/server/server.js
Restart=always
RestartSec=5
# Schutz: Dienst darf nur im Projektordner schreiben
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now kuechen-controller.service
sleep 2
systemctl --no-pager --lines=15 status kuechen-controller.service || true

echo
echo "Fertig. Nützliche Befehle:"
echo "  Status ansehen:   systemctl status kuechen-controller"
echo "  Neu starten:      sudo systemctl restart kuechen-controller   (nach Änderungen an config.json)"
echo "  Stoppen:          sudo systemctl stop kuechen-controller"
echo "  Meldungen:        journalctl -u kuechen-controller -f"
echo "  Autostart aus:    sudo systemctl disable --now kuechen-controller"
