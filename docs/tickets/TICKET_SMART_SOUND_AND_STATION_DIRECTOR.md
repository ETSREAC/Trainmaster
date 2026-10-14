# [Feature] Smart Sound & Station Director: Raumklang, Bahnhofsansagen & Subwoofer-Support

**Typ:** Multimedia / Audio Engine / Smart Environment  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/audio/SoundDirector.ts`, `server/src/audio/AnnouncementGenerator.ts`, `client/src/audio/WebAudioEngine.ts`, `client/src/components/AudioSettingsModal.ts`  
**Labels:** `sound`, `audio`, `tts`, `ambient`, `subwoofer`, `announcements`, `multimedia`

---

## 1. Problemstellung & Motivation

Einer der größten Schwachpunkte im Modellbahn-Hobby ist der Lok-Sound:
* In Spur H0, TT und N sind Lautsprecher in den Loks winzig (10–15 mm) und klingen oft piepsig, blechern und ohne jedes Bassfundament.
* Stationäre Soundmodule (Uhlenbrock, ESU) sind teuer (80–120 € pro Modul), unflexibel und schwer ansteuerbar.
* TrainController besitzt einen rudimentären „Sound Director“, lässt sich dieses Feature aber teuer als Zusatzmodul bezahlen.
* **TrainMaster-Lösung:** Ein intelligentes, browser- und netzwerkbasiertes Audiosystem (Web Audio API & Server-Audio), das PC-Lautsprecher, externe Bluetooth-Boxen, Sonos/AirPlay oder Multiroom-Verstärker ansteuert.

---

## 2. Kernfunktionen

### 2.1 Dynamischer Bahnhofsansagen-Generator (TTS & Gong)
* **Realistische Bahnhofsgongs:** DB-Originalgong (Dreiklang), SBB-Tonfolge oder ÖBB-Gong.
* **Dynamische Text-to-Speech (TTS) oder Audio-Bausteine:**
  * TrainMaster setzt Ansagen basierend auf dem Echtzeit-Fahrplan automatisch zusammen:
    * *„Gong... An Gleis 2: ICE 571 nach München Hauptbahnhof über Nürnberg. Planmäßige Abfahrt 14:15 Uhr. Bitte Vorsicht bei der Einfahrt.“*
    * *„Gong... Achtung an Gleis 1: Eine Durchfahrt. Bitte treten Sie zurück von der Bahnsteigkante.“*
  * **Verspätungs- & Störungsansagen:**
    * Bei BBT-Verzögerung oder Signalstopp: *„Information zu Regional-Express 42 nach Hamburg: Heute circa 5 Minuten später. Grund dafür ist eine Verzögerung im Betriebsablauf.“*
* **Akzent- und Hall-Filter (Convolution Reverb):** Leichtes Echo wie in einer echten Bahnhofshalle (über Web Audio Convolver).

### 2.2 3D-Raum-Ambiente & Umgebungsgeräusche (Position-Aware Audio)
* Zufällige oder zeitgesteuerte Umwelt-Sounds über verschiedene Audiokanäle / Lautsprecher:
  * **Wald/Natur:** Vogelzwitschern, Blätterrauschen, leichter Wind.
  * **Dorf/Kirche:** Stündliches Kirchengeläut (synchronisiert mit der Modellzeit-Uhr).
  * **Industriegebiet / Güterbahnhof:** Hämmern, Entlüftungszischen, Fabrikbrummen.
  * **Bahnübergang:** Echtes Bimmeln der Schrankenanlage beim Schließen.

### 2.3 Subwoofer & Bass-Transducer (Körperschall unterm Anlagentisch)
* Tieffrequente Bass-Sounds (30–90 Hz), die unter der Anlage über einen Subwoofer oder Körperschallwandler (Bass-Shaker) spürbare Vibrationen erzeugen:
  * Anfahren schwerer Dieselloks (V200, Ludmilla, BR 218).
  * Schwerer Dampflok-Auspuffschlag unter Volllast auf Steigungsstrecken.
  * Rollgeräusche über Brücken und Weichenstraßen.

---

## 3. Technische Architektur & Datenmodell

### 3.1 Datenmodell (`types.ts`)

```typescript
export interface SoundTrack {
  id: string;
  name: string;
  category: 'announcement' | 'ambient' | 'sfx' | 'subwoofer';
  fileUri: string;
  defaultVolume: number; // 0.0 - 1.0
  loop: boolean;
  bus: 'master' | 'station' | 'ambient' | 'subwoofer';
}

export interface AnnouncementTemplate {
  id: string;
  name: string;
  gongId: 'db_classic' | 'db_modern' | 'sbb' | 'oebb';
  templateText: string; // z.B. "{GONG} Gleis {TRACK}: {TRAIN_TYPE} {TRAIN_NUM} nach {DESTINATION}..."
  reverbPreset: 'none' | 'small_hall' | 'large_cathedral' | 'open_air';
  triggerEvent: 'onTrainEnter' | 'onTrainStop' | 'onDepartureScheduled';
}

export interface AudioOutputChannel {
  id: string;
  name: string; // z.B. "Bahnhof Lautsprecher (Kanal L)", "Wald (Kanal R)"
  pan: number;  // -1.0 (Links) bis +1.0 (Rechts)
  assignedBlocks: string[]; // Block-IDs, die diesem Lautsprecher zugeordnet sind
}
```

### 3.2 Web Audio API Routing (`client/src/audio/WebAudioEngine.ts`)
* AudioContext mit getrennten GainNodes pro Bus (`Master`, `Station`, `Ambient`, `Subwoofer`).
* Ein ConvolverNode für Bahnhofshallen-Reverb.
* StereoPannerNodes / 3D-Panner für positionsabhängigen Sound je nach Block, in dem sich der Zug befindet.

---

## 4. UI & Bedienung

* **Neuer Reiter „Sound & Director“:**
  * Lautstärkeregler für: *Gesamtlautstärke*, *Bahnhofsdurchsagen*, *Ambiente/Natur*, *Subwoofer*.
  * Sofort-Soundboard: Buttons für manuelle Durchsagen (*Gong*, *Gleisänderung*, *Schranke*, *Kirchenglocken*).
  * Ansagen-Vorschau: Text eingeben und sofort per Knopfdruck probehören.
* **Block-Verknüpfung:**
  * Im Block-Editor (z. B. Block `Gleis 2`) Häkchen: *„Bahnhofsansage bei Einfahrt abspielen“* mit Auswahl der Vorlage.

---

## 5. Akzeptanzkriterien

- [ ] `SoundDirector`-Engine im Frontend/Backend implementiert.
- [ ] Synthetische oder Audio-Snippet-Bahnhofsansagen mit Vorlagen (`{TRAIN}`, `{TRACK}`, `{DESTINATION}`) funktionsfähig.
- [ ] Integrierte Sound-Bibliothek mit klassischen Gongs (DB, ÖBB, SBB) und lizenzfreien Natur-/Industriegeräuschen.
- [ ] Bahnhofshallen-Reverb-Effekt zuschaltbar.
- [ ] Automatisches Auslösen von Ansagen bei Einfahrt von Personenzügen in entsprechend konfigurierte Blöcke.
- [ ] Getrennter Subwoofer-Kanal für tieffrequente Motor- und Rumpelgeräusche.
- [ ] Getestet auf gängigen Browsern ohne Audio-Stottern.
