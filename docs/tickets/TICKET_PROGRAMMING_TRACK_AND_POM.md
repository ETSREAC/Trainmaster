# [Feature] Programmiergleis & PoM: Decoder auslesen, CV-Programmierung & Visueller CV29-Rechner

**Typ:** Core Hardware & Decoder Management  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/hal/ICommandStation.ts`, `server/src/hal/DccExDriver.ts`, `server/src/hal/Z21Driver.ts`, `server/src/engine/DecoderProgrammerService.ts`, `client/src/components/CVProgrammerModal.ts`  
**Labels:** `dcc`, `hardware`, `cv-programming`, `pom`, `decoder`

---

## 1. Problemstellung & Motivation

Aktuell kann TrainMaster Lokomotiven steuern (Fahrstufen, Richtung, F-Tasten) und Weichen/Signale schalten.  
Was jedoch für jede digitale Modellbahn **essenziell** ist:

1. **Decoder einrichten & Adressen ändern:**  
   Neue Loks werden werkseitig immer mit DCC-Adresse `3` ausgeliefert. Um ihnen eine neue Adresse (z. B. `101` oder `218`) zuzuweisen oder die Höchstgeschwindigkeit zu drosseln, muss man CV-Werte (Configuration Variables) schreiben.
2. **Decoder auslesen (Service Mode auf dem Programmiergleis):**  
   Prüfen, welcher Decoder verbaut ist (CV 8 Hersteller-ID), welche Adresse vergeben ist oder warum eine Lok bockt.
3. **PoM (Program on Main / Programmieren auf dem Hauptgleis):**  
   Feinabstimmung von Motorregelung, Lautstärke oder Bremsverzögerung (CV 3/4) direkt während des Fahrens auf der Anlage, ohne die Lok auf ein separates Gleis stellen zu müssen.
4. **Das CV 29-Dilemma:**  
   Die Konfigurationsvariable CV 29 ist berüchtigt: Sie steuert Richtungsumkehr, 14 vs. 128 Fahrstufen, Analogmodus, RailCom und kurze vs. lange Adresse. Modellbahner müssen Binärwerte im Kopf zusammenrechnen ($1 + 2 + 4 + 8 + 32 = 47$) – hier passieren die meisten Fehler.

---

## 2. Konzept & Funktionsumfang

Das Feature wird als eigenständiger, komfortabler **CV-Programmer & Decoder-Manager** realisiert:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🛠️ DCC Decoder-Programmer & CV-Manager                       [✕]        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   [ 🔴 Programmiergleis (Service Mode) ]   [ 🟢 Hauptgleis (PoM) ]     │
│                                                                        │
│  Modus: Service Mode (Direct Bit/Byte & Paged)                         │
│  Lok auf Programmiergleis: [ 🔍 Adresse automatisch ermitteln ]         │
│  ➔ Erkannte Adresse: #218 (Lange Adresse) | Hersteller: ESU (151)     │
│                                                                        │
│ ┌─ Einzelne CV lesen / schreiben ──────────────────────────────────┐   │
│ │ CV-Nummer: [ 29 ]   Wert (0-255): [ 38 ]   Bit: [ 00100110 ]     │   │
│ │ [ 📖 CV Auslesen ]           [ ✍️ CV Schreiben ]                   │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│ ┌─ 💡 Interaktiver CV 29 Schnell-Rechner ──────────────────────────┐   │
│ │  [ ] Bit 0: Fahrtrichtung invertieren (1)                        │   │
│ │  [✓] Bit 1: 28 / 128 Fahrstufen aktiv (2)                        │   │
│ │  [✓] Bit 2: Analoger Gleichstrom-Betrieb erlauben (4)             │   │
│ │  [ ] Bit 3: RailCom Bi-Direktional aktiv (8)                     │   │
│ │  [ ] Bit 4: Individuelle Geschwindigkeitskennlinie (16)          │   │
│ │  [✓] Bit 5: Lange DCC-Adresse aktiv (ab 128) (32)                │   │
│ │  ➔ Berechneter Wert: 38 (Automatisch in Eingabefeld übernommen) │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│ ┌─ ⚡ Schnell-Tuning (Standard-CVs) ────────────────────────────────┐   │
│ │  Anfahrspannung (CV 2):       [====|-------------] 12            │   │
│ │  Beschleunigungszeit (CV 3):  [=======|----------] 24            │   │
│ │  Bremsverzögerung (CV 4):     [==========|-------] 35            │   │
│ │  Höchstgeschwindigkeit (CV 5):[================|-] 190           │   │
│ │  Mittengeschwindigkeit (CV 6):[=========|--------] 95            │   │
│ │  [ 🚀 Standard-Werte schreiben ]                                  │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  [ 💾 Decoder-Backup (JSON) ]   [ 🔄 CV-Reset (CV 8 = 8) ]    [Fertig] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Hardware-Protokolle & HAL-Anbindung

Sowohl **DCC-EX** als auch **Roco Z21** beherrschen das Programmiergleis und PoM nativ über ihre jeweiligen Schnittstellen:

### 1. DCC-EX CommandStation:
* **Programmiergleis lesen:** `<R CV>` ➔ Antwort: `<r CV VALUE>`
* **Programmiergleis schreiben:** `<W CV VALUE>` ➔ Antwort: `<r CV VALUE>`
* **Programmiergleis Bit schreiben:** `<B CV BIT VALUE>`
* **PoM Byte schreiben (Hauptgleis):** `<w ADDR CV VALUE>`
* **PoM Bit schreiben (Hauptgleis):** `<b ADDR CV BIT VALUE>`

### 2. Roco Z21 / z21 start:
* **Service Mode CV lesen:** `LAN_X_CV_READ` (`0x23 0x11 MSB LSB`) ➔ Antwort: `0x64 0x14 CV VALUE`
* **Service Mode CV schreiben:** `LAN_X_CV_WRITE` (`0x24 0x12 MSB LSB VALUE`)
* **PoM schreiben:** `LAN_X_CV_POM_WRITE_BYTE` (`0xE6 0x30 MSB LSB CV VALUE`)

---

## 4. Schnittstellen-Erweiterung (`ICommandStation.ts`)

```typescript
export interface ICommandStation {
  // ... bestehende Methoden ...

  // Programmiergleis (Service Mode)
  readCV?(cv: number): Promise<number | null>;
  writeCV?(cv: number, value: number): Promise<boolean>;
  writeCVBit?(cv: number, bit: number, value: boolean): Promise<boolean>;

  // Hauptgleis-Programmierung (Operations Mode / PoM)
  writeCVPoM?(locoAddress: number, cv: number, value: number): Promise<boolean>;
  writeCVBitPoM?(locoAddress: number, cv: number, bit: number, value: boolean): Promise<boolean>;
  readCVPoM?(locoAddress: number, cv: number): Promise<number | null>; // Via RailCom
}
```

---

## 5. Decoder Backup & Wiederherstellung (Disaster Recovery)

* **Export:** TrainMaster kann alle Standard-CVs (CV 1–6, 8, 17, 18, 19, 29, 31, 32) in einer Datei `decoder_backup_BR101.json` sichern.
* **Restore:** Nach einem Decoder-Reset (CV 8 = 8) kann das Profil mit einem einzigen Klick wieder auf den Decoder geschrieben werden.

---

## 6. Akzeptanzkriterien

- [ ] Auslesen und Schreiben einzelner CVs auf dem Programmiergleis (Service Mode) via DCC-EX und Z21.
- [ ] Schreiben von CVs während der Fahrt auf dem Hauptgleis (PoM) ohne Unterbrechung anderer Züge.
- [ ] Automatische Ermittlung der Lokadresse (kurz CV 1 bzw. lang CV 17/18) auf dem Programmiergleis.
- [ ] Interaktiver Bit-Rechner für CV 29 mit Live-Vorschau.
- [ ] Schieberegler für V_Min, Anfahrzeit, Bremszeit und Höchstgeschwindigkeit (CV 2–6).
- [ ] Decoder-Backup als JSON exportier- und importierbar.
