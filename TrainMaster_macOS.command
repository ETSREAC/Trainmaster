#!/usr/bin/env bash
cd "$(dirname "$0")"

# Terminal-Titel setzen
echo -ne "\033]0;TrainMaster 🚂\007"

echo "========================================================"
echo "  Starting TrainMaster (Server + Web Client) on macOS"
echo "========================================================"
echo ""

# Prüfen ob node vorhanden ist, andernfalls typische macOS-Pfade prüfen
if ! command -v node >/dev/null 2>&1; then
    if [ -x "/opt/homebrew/bin/node" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    elif [ -x "/usr/local/bin/node" ]; then
        export PATH="/usr/local/bin:$PATH"
    elif [ -s "$HOME/.nvm/nvm.sh" ]; then
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
fi

if ! command -v node >/dev/null 2>&1; then
    echo "❌ [FEHLER] Node.js ist nicht installiert oder nicht im PATH!"
    echo "Bitte installiere Node.js (Version 18 oder neuer):"
    echo "  👉 Download von https://nodejs.org"
    echo "  👉 oder via Homebrew: brew install node"
    echo ""
    read -p "Drücke [Enter] zum Schließen..."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "📦 [INFO] Erste Ausführung: Installiere Abhängigkeiten..."
    npm install
fi

node scripts/start.mjs
