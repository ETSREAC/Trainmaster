# [Feature] Desktop-App & Windows-Installer: Ein-Klick-Setup (Electron, NSIS, Zero-Popup & Code-Signing)

**Typ:** Packaging / Distribution / Desktop Application  
**Status:** Open / Konzipiert  
**Komponenten:** `desktop/` (Electron Main Process), `electron-builder.json`, `.github/workflows/release-desktop.yml`, `scripts/build-desktop.mjs`  
**Labels:** `desktop`, `electron`, `installer`, `nsis`, `windows`, `ux`, `deployment`, `code-signing`

---

## 1. Problemstellung & Motivation („Die alten Modellbahner abholen“)

Die Kernzielgruppe klassischer Modellbahner ist oft 50–70+ Jahre alt. Viele haben erstklassige Anlagen im Keller, aber **keine IT-Kenntnisse**:
* Ein Setup mit `git clone`, `npm install`, `node scripts/start.mjs` oder schwarzen Terminal-Fenstern führt bei **95 % der Nutzer zum sofortigen Abbruch**.
* Wenn bei einem Start plötzliche Warnungen aufploppen (*„Der Computer wurde durch Windows geschützt“* oder *„Windows Defender Firewall hat Funktionen blockiert“*), bekommen viele Nutzer Angst vor Viren und löschen das Programm wieder.
* **Ziel:** TrainMaster muss wie jedes klassische Windows-Programm funktionieren:
  1. Download einer einzigen Datei: `TrainMaster-Setup.exe`.
  2. Doppelklick -> Schneller Ein-Klick-Installationsassistent auf Deutsch mit Lokomotiv-Logo.
  3. Desktop-Verknüpfung `TrainMaster` wird erstellt.
  4. Doppelklick auf das Icon öffnet sofort das vollwertige Stellwerk-Fenster — **ohne offene schwarze DOS-Box, ohne Abhängigkeit von vorinstalliertem Node.js und ohne verwirrende Popups**.

---

## 2. Analyse der „komischen Pop-Ups“ & technische Lösungen

### 2.1 Pop-Up 1: Windows SmartScreen („Der Computer wurde durch Windows geschützt“)
* **Ursache:** Microsoft stuft jede neue `.exe` ohne digitale Signatur oder mit geringer Download-Historie als verdächtig ein.
* **Lösungswege:**
  1. **Open-Source Code-Signing via SignPath.io (Empfohlen & kostenlos):**
     * SignPath.io stellt in Kooperation mit der *SignPath Foundation* kostenlose Code-Signing-Zertifikate für anerkannte Open-Source-Projekte bereit.
     * Wird direkt in die GitHub Actions Release-Pipeline integriert. Signierte EXEs bauen sofort Microsoft SmartScreen-Reputation auf.
  2. **Microsoft Azure Trusted Signing (Kostengünstige Alternative):**
     * Offizieller Microsoft Cloud-Dienst für Entwicklerzertifikate (~10 $/Monat), verifiziert über Microsoft Entra ID.
  3. **In-App & Download-Führung (Sofortmaßnahme ohne Zertifikat):**
     * Auf der Download-Seite und im GitHub Release klare Screenshots platzieren: *„Falls Windows SmartScreen erscheint: Klicken Sie auf 'Weitere Informationen' -> 'Trotzdem ausführen'“*.
     * Verteilung über den **Windows Package Manager (`winget install TrainMaster`)** oder Microsoft Store (MSIX), wodurch SmartScreen komplett umgangen wird.

### 2.2 Pop-Up 2: Windows Defender Firewall („Firewall hat Funktionen blockiert“)
* **Ursache:** Sobald das TrainMaster-Backend Sockets für die Netzwerkkommunikation bindet (z. B. Express Web-UI, WebSocket Port `3001`, Z21 UDP `21105`, WiThrottle `12090`), fragt Windows nach Freigabe für Private/Öffentliche Netzwerke.
* **Lösung:**
  1. **Automatischer Firewall-Eintrag beim Setup:**
     * Das NSIS-Installationsskript führt während der Installation automatisch und lautlos folgenden Befehl aus:
       ```powershell
       netsh advfirewall firewall add rule name="TrainMaster Modellbahn-Server" dir=in action=allow program="$INSTDIR\TrainMaster.exe" enable=yes profile=private
       ```
     * Dadurch ist die Firewall bereits vor dem ersten Start korrekt konfiguriert und das Pop-up erscheint **nie**.
  2. **Dual-Mode-Binding:**
     * Im Standard-Modus bindet der Server zunächst nur auf `127.0.0.1` (Localhost) — hierfür verlangt Windows **keine Firewall-Genehmigung**.
     * Erst wenn der Nutzer in den Einstellungen „Zugriff durch externe Smartphones/Tablets erlauben (0.0.0.0)“ aktiviert, wird die LAN-Schnittstelle geöffnet.

### 2.3 Pop-Up 3: Schwarzes Konsolenfenster (CMD-Box)
* **Ursache:** Wenn Node.js über `.bat` oder Standard-Laufzeitumgebungen gestartet wird, öffnet Windows ein CMD-Fenster. Klickt der Nutzer versehentlich auf das `X`, stürzt die Modellbahn ab.
* **Lösung:**
  * Durch **Electron** (oder Caxa mit `--win-subsystem=windows`) wird die Binary als echte GUI-Anwendung (`WinMain`) kompiliert. Es existiert **kein Konsolenfenster**.
  * Der Node.js-Backend-Server läuft im Electron-Main-Process oder als unsichtbarer Child-Process.

### 2.4 Pop-Up 4: Windows UAC Admin-Warnung („Möchten Sie zulassen, dass Änderungen vorgenommen werden?“)
* **Lösung:**
  * **Per-User Installation (Standard für moderne Programme wie VS Code, Slack, Chrome):**
  * Das Setup installiert TrainMaster in `%LOCALAPPDATA%\Programs\TrainMaster`.
  * **Vorteil:** Erfordert **keine Administratorrechte**! Der Installer startet sofort mit normalem Klick ohne gelb-blaues UAC-Sicherheitsfenster.

---

## 3. Architektur der Desktop-App (Electron-Wrapper)

```
TrainMaster/
├── desktop/
│   ├── main.ts              # Electron Main Process (erzeugt BrowserWindow, startet Server)
│   ├── preload.ts           # Kontext-Brücke (IPC)
│   ├── tray.ts              # Windows System-Tray (Status, Schnell-Stopp, Beenden)
│   └── package.json         # Desktop spezifische Abhängigkeiten (electron, electron-builder)
├── server/                  # Bestehendes Node.js Backend (unverändert)
├── client/                  # Bestehendes Vite Frontend (wird als dist gebaut)
├── electron-builder.json    # Konfiguration für NSIS Installer, Icons, File Associations
└── .github/workflows/
    └── release-desktop.yml  # Automatische CI-Erstellung der .exe bei Git-Release
```

### 3.1 Lebenszyklus & Startsequenz
1. Nutzer klickt auf `TrainMaster.exe`.
2. Electron Main Process startet:
   * Startet den internen TrainMaster Express/WebSocket-Server auf freiem internen Port (z. B. `3001`).
   * Initialisiert Hardware-Treiber (Serial COM-Ports, UDP-Sockets für Z21/CS3).
   * Erzeugt ein natives Windows-Anwendungsfenster (Chromium) mit Titel `TrainMaster Modellbahn-Steuerung`.
   * Lädt die vorcompilierte Web-App (`client/dist/index.html`).
3. Ein Tray-Icon mit Lokomotiv-Symbol nistet sich in der Windows-Taskleiste neben der Uhr ein:
   * Rechtsklick-Menü: *„Not-Halt (Strom AUS)“*, *„Im Browser öffnen“*, *„Einstellungen“*, *„Beenden“*.
4. Beim Klick auf das Schließen-Kreuz (`X`) fragt TrainMaster: *„Modellbahn stoppen und beenden?“* oder minimiert auf Wunsch ins Tray, damit Automatikzüge weiterfahren.

---

## 4. Installer-Konfiguration (`electron-builder.json`)

```json
{
  "appId": "de.trainmaster.app",
  "productName": "TrainMaster",
  "directories": {
    "output": "dist-desktop"
  },
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ],
    "icon": "desktop/assets/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": "always",
    "createStartMenuShortcut": true,
    "shortcutName": "TrainMaster",
    "language": "1031",
    "uninstallDisplayName": "TrainMaster Modellbahn-Steuerung"
  }
}
```

---

## 5. Offline-Fähigkeit für Kelleranlagen

Viele Modelleisenbahnanlagen stehen im Keller oder auf dem Dachboden **ohne Internetzugang**:
* Das Installer-Paket bündelt **alle** Abhängigkeiten (Node.js Runtime, SQLite/Dateisystem, UI-Assets, Icons).
* Es findet beim Start kein Zwangsupdate oder Lizenz-Check ins Internet statt.
* Lokales Logging und Backups liegen in `%APPDATA%\TrainMaster\backups`.

---

## 6. Automatische Updates (GitHub Releases)

* Über `electron-updater` prüft TrainMaster beim Start (falls Internet vorhanden), ob auf GitHub ein neues Release bereitsteht.
* Ein unaufdringlicher grüner Button im Stellwerk meldet: *„Update 1.8.0 verfügbar – Jetzt mit einem Klick aktualisieren“*.
* Der Download und die Installation erfolgen im Hintergrund ohne manuelle Datei-Verschieberei.

---

## 7. Akzeptanzkriterien

- [ ] `desktop/`-Paket mit Electron Main Process und BrowserWindow erstellt.
- [ ] Backend (`server`) wird als integrierter Prozess ohne sichtbare Konsole gestartet.
- [ ] Frontend (`client/dist`) lädt lokal ohne Internetverbindung.
- [ ] `electron-builder` baut ein funktionierendes `TrainMaster-Setup.exe` (NSIS) und ein `TrainMaster-Portable.exe`.
- [ ] Per-User Installation eingerichtet: Setup läuft ohne Administrator-UAC-Meldung durch.
- [ ] Keine offenen Konsolen- oder Terminal-Fenster sichtbar.
- [ ] System-Tray-Icon mit Statusanzeige und Not-Aus-Funktion integriert.
- [ ] Firewall-Regel wird im Installer lautlos hinterlegt oder durch `127.0.0.1`-Bindung vermieden.
- [ ] GitHub Actions CI-Job `release-desktop.yml` baut bei Git-Tags automatisch die Windows-Installationsdatei und hängt sie an das GitHub Release an.
