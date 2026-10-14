# [Feature] Automatische Geschwindigkeits-Messstrecke & km/h-Tachokalibrierung

**Typ:** Feature / Hardware & Diagnostics  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/SpeedMeasurementService.ts`, `server/src/types.ts`, `client/src/components/Throttle.ts`, `client/src/components/TrackCanvas.ts`  
**Labels:** `diagnostics`, `speed-measurement`, `kmh`, `calibration`

---

## 1. Problemstellung & Motivation

Modellbahn-Zentralen und Lok-Decoder steuern Lokomotiven mit abstrakten **DCC-Fahrstufen (0 bis 128)**:
* Fahrstufe 60 bedeutet bei einer kleinen Rangierlok vielleicht $30\,\text{km/h}$, bei einem ICE aber $180\,\text{km/h}$.
* Auf dem Fahrregler steht bislang nur eine Zahl von 0 bis 128 – der Modellbahner weiß nicht, wie schnell die Lok im Maßstab (H0, N, TT) wirklich fährt.
* Beim Einstellen von Decodern (CV5 Höchstgeschwindigkeit, CV6 Mittengeschwindigkeit) muss man mühsam raten oder teure Rollenprüfstände kaufen.

---

## 2. Konzept: Die 2-Melder-Messstrecke

Jeder Modellbahner kann auf seiner Anlage zwei beliebige Belegtmelder (z. B. auf einem geraden Streckenabschnitt) zur **Messstrecke** erklären:

```text
               ┌──────────────── Abstand s = 100 cm ────────────────┐
               │                                                    │
───────────────[ Melder 1 ]─────────────────────────────────────────[ Melder 2 ]───────────────➔
           Zeitstempel t1                                       Zeitstempel t2
```

### Mathematische Berechnung:

1. **Reale Modellzeit:**  
   $$\Delta t = t_2 - t_1 \quad (\text{in Sekunden})$$
2. **Reale Modellgeschwindigkeit:**  
   $$v_{\text{modell}} = \frac{s}{\Delta t} \quad (\text{in m/s})$$
3. **Umgerechnete Vorbild-Geschwindigkeit:**  
   $$v_{\text{vorbild}} = v_{\text{modell}} \cdot \text{Maßstab} \cdot 3{,}6 \quad (\text{in km/h})$$

| Nenngröße | Maßstab | Beispiel: $100\,\text{cm}$ in $2{,}5\,\text{s}$ |
| :--- | :--- | :--- |
| **H0** | $1:87$ | $0{,}4\,\text{m/s} \cdot 87 \cdot 3{,}6 = \mathbf{125{,}3\,\text{km/h}}$ |
| **TT** | $1:120$ | $0{,}4\,\text{m/s} \cdot 120 \cdot 3{,}6 = \mathbf{172{,}8\,\text{km/h}}$ |
| **N** | $1:160$ | $0{,}4\,\text{m/s} \cdot 160 \cdot 3{,}6 = \mathbf{230{,}4\,\text{km/h}}$ |

---

## 3. Automatische Tachokalibrierung (Einmess-Assistent)

TrainMaster kann eine Lokomotive **vollautomatisch einmessen**:
1. Der Nutzer startet den *"Einmess-Assistenten"* für die Lok.
2. TrainMaster fährt die Messstrecke automatisch mit Fahrstufe 10, 30, 60, 90 und 120 ab.
3. TrainMaster speichert die gemessenen km/h-Werte direkt im Lok-Profil ab:
   - Der Tacho im Fahrregler (und auf dem CrowPanel Display-Knob!) zeigt nun **echte km/h** an!
   - Tempobeschränkungen (z. B. Langsamfahrt $40\,\text{km/h}$) werden exakt in die passende DCC-Fahrstufe umgerechnet.

---

## 4. Datenmodell-Spezifikation (`types.ts`)

```typescript
export interface SpeedMeasurementTrack {
  id: string;
  name: string;
  sensorAId: string;              // Start-Sensor
  sensorBId: string;              // Ziel-Sensor
  distanceMm: number;             // Exakter Abstand in Millimetern (z. B. 1000)
}

// Erweiterung der Lokomotive:
export interface Locomotive {
  // ... bestehende Felder ...
  speedCurveKmh?: Record<number, number>; // DCC Fahrstufe ➔ km/h (z. B. { 20: 35, 60: 80, 128: 160 })
}
```

---

## 5. UI-Integration

* **Live-Speed-Badge im Stellwerk:** Wenn ein Zug über die Messstrecke fährt, ploppt eine moderne Geschwindigkeits-Anzeige auf:  
  `🚅 DB BR 101: 118,4 km/h (Fahrstufe 72)`.
* **Tacho-Option:** Im Fahrregler kann zwischen `DCC Fahrstufen (0–128)` und `km/h` gewechselt werden.

---

## 6. Akzeptanzkriterien

- [ ] Zwei beliebige Sensoren können mit Abstand in mm als Messstrecke definiert werden.
- [ ] Durchfahrten in beide Richtungen berechnen die Geschwindigkeit präzise in km/h.
- [ ] Berücksichtigung des Maßstabs aus den Einstellungen (H0, N, TT, Z).
- [ ] Tachoanzeige im Web-Regler visualisiert Vorbild-km/h.
