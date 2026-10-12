import net from 'net';
import { AmbientLightingConfig, LightingMode, WeatherType } from '../types.js';

export interface AmbientLightingEvents {
  onConfigUpdated: (config: AmbientLightingConfig, saveToDisk?: boolean) => void;
  onLightningStrike: (thunderDelayMs: number) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class AmbientLightingEngine {
  private config: AmbientLightingConfig;
  private events: AmbientLightingEvents;
  private socket: net.Socket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private lightningTimer: NodeJS.Timeout | null = null;
  private isLightningRunning = false;
  private currentColor = { r: 0, g: 0, b: 0 };

  constructor(initialConfig: AmbientLightingConfig | undefined, events: AmbientLightingEvents) {
    this.events = events;
    this.config = initialConfig || {
      enabled: true,
      ip: '192.168.1.50',
      port: 5577,
      mode: 'CIRCADIAN',
      modelDayMinutes: 15, // 15 Realminuten = 24 Modellstunden
      currentModelHour: 14.0, // Startzeit 14:00 Uhr Nachmittag
      manualColor: { r: 255, g: 160, b: 60 },
      weather: 'CLEAR',
      randomWeather: false,
      lightningFrequencySec: 25,
      soundSyncEnabled: true,
      isPaused: false
    };

    if (this.config.enabled) {
      this.connect();
    }
    this.startEngineLoop();
  }

  public getConfig(): AmbientLightingConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<AmbientLightingConfig>): void {
    const oldIp = this.config.ip;
    const oldPort = this.config.port;
    const oldEnabled = this.config.enabled;
    const oldMode = this.config.mode;
    const oldWeather = this.config.weather;

    this.config = { ...this.config, ...partial };
    this.events.onConfigUpdated(this.config, true);

    if (this.config.enabled && (!oldEnabled || this.config.ip !== oldIp || this.config.port !== oldPort)) {
      this.reconnect();
    } else if (!this.config.enabled && oldEnabled) {
      this.sendPowerOff();
      this.disconnect();
    }

    // Sofortige Reaktion auf Modus- oder Wetterwechsel
    if (this.config.enabled && this.isConnected) {
      if (this.config.mode === 'MANUAL') {
        this.applyColor(this.config.manualColor.r, this.config.manualColor.g, this.config.manualColor.b);
      } else if (this.config.mode === 'OFF') {
        this.sendPowerOff();
      } else if (this.config.mode === 'CIRCADIAN' || this.config.mode === 'WEATHER') {
        this.updateLightingTick(true);
      }
    }

    if (this.config.weather === 'STORM' && oldWeather !== 'STORM' && !this.isLightningRunning) {
      // Wenn frisch auf Sturm geschaltet wurde, direkt einen Begrüßungsblitz abfeuern
      setTimeout(() => this.triggerLightning(), 1500);
    }
  }

  private connect(): void {
    if (this.isConnecting || this.isConnected || !this.config.enabled) return;
    this.isConnecting = true;

    try {
      this.socket = new net.Socket();
      this.socket.setTimeout(4000);

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.socket?.setTimeout(0);
        this.socket?.setKeepAlive(true, 10000);
        this.events.onLog(`[Raumlicht] Erfolgreich verbunden mit Magic Home unter ${this.config.ip}:${this.config.port}`, 'info');
        this.sendPowerOn();
        this.updateLightingTick(true);
      });

      this.socket.on('timeout', () => {
        this.socket?.destroy();
      });

      this.socket.on('error', (err) => {
        // Leiser Fehlerlog - Fahrbetrieb darf nicht gestört werden
        this.cleanupSocket();
      });

      this.socket.on('close', () => {
        this.cleanupSocket();
        this.scheduleReconnect();
      });

      this.socket.connect(this.config.port, this.config.ip);
    } catch (err) {
      this.cleanupSocket();
      this.scheduleReconnect();
    }
  }

  private cleanupSocket(): void {
    this.isConnected = false;
    this.isConnecting = false;
    if (this.socket) {
      this.socket.removeAllListeners();
      try { this.socket.destroy(); } catch {}
      this.socket = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.config.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15000); // Alle 15 Sekunden Neuversuch
  }

  private reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
  }

  private sendBuffer(buf: Buffer): void {
    if (!this.isConnected || !this.socket) return;
    try {
      this.socket.write(buf);
    } catch (err) {
      this.cleanupSocket();
      this.scheduleReconnect();
    }
  }

  private sendPowerOn(): void {
    this.sendBuffer(Buffer.from([0x71, 0x23, 0x0f, 0xa3]));
  }

  private sendPowerOff(): void {
    this.sendBuffer(Buffer.from([0x71, 0x24, 0x0f, 0xa4]));
  }

  private createColorBuffer(r: number, g: number, b: number): Buffer {
    const body = [0x31, Math.max(0, Math.min(255, Math.round(r))), Math.max(0, Math.min(255, Math.round(g))), Math.max(0, Math.min(255, Math.round(b))), 0x00, 0xf0, 0x0f];
    const checksum = body.reduce((sum, val) => sum + val, 0) & 0xff;
    return Buffer.from([...body, checksum]);
  }

  private applyColor(r: number, g: number, b: number): void {
    if (this.isLightningRunning) return; // Blitze haben absolute Priorität
    this.currentColor = { r, g, b };
    this.sendBuffer(this.createColorBuffer(r, g, b));
  }

  private startEngineLoop(): void {
    // Aktualisierungsschleife jede Sekunde für flüssige Zeit- und Lichtverläufe
    this.tickTimer = setInterval(() => {
      this.updateLightingTick(false);
    }, 1000);

    // Wetter-Zufalls-Prüfung alle 5 Sekunden
    this.lightningTimer = setInterval(() => {
      this.checkStormSimulation();
    }, 5000);
  }

  private updateLightingTick(force: boolean): void {
    if (!this.config.enabled || !this.isConnected || this.isLightningRunning) return;

    if (this.config.mode === 'OFF') {
      return;
    }

    if (this.config.mode === 'MANUAL') {
      if (force) {
        this.applyColor(this.config.manualColor.r, this.config.manualColor.g, this.config.manualColor.b);
      }
      return;
    }

    // Fortschreiten der Modellzeit berechnen (nur wenn nicht pausiert)
    if (!this.config.isPaused) {
      if (this.config.modelDayMinutes > 0) {
        // 24 Modellstunden verteilt auf (modelDayMinutes * 60) Sekunden
        const hoursPerSecond = 24 / (this.config.modelDayMinutes * 60);
        this.config.currentModelHour = (this.config.currentModelHour + hoursPerSecond) % 24;
      } else {
        // Echtzeit
        const now = new Date();
        this.config.currentModelHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      }

      // Live-Fortschritt an Client broadcasten (ohne Festplatten-Schreibzugriff)
      this.events.onConfigUpdated(this.config, false);
    }

    // Grundfarbe anhand der zirkadianen Tageslichtkurve ermitteln
    let target = this.calculateCircadianColor(this.config.currentModelHour);

    // Wettereinfluss berechnen (Wetter dämpft die Tageskurve)
    const activeWeather = this.config.weather || 'CLEAR';
    if (this.config.mode === 'WEATHER' || (this.config.mode === 'CIRCADIAN' && activeWeather !== 'CLEAR')) {
      if (activeWeather === 'CLOUDY') {
        // Wolken: Dämpft Helligkeit um ca. 35%
        target = {
          r: Math.round(target.r * 0.65),
          g: Math.round(target.g * 0.65),
          b: Math.round(target.b * 0.75)
        };
      } else if (activeWeather === 'STORM') {
        // Sturm / Gewitterhimmel: Starke Dämpfung (ca. 70%), kühlere Gewittertönung, tageszeitabhängig
        target = {
          r: Math.max(6, Math.round(target.r * 0.28)),
          g: Math.max(10, Math.round(target.g * 0.30)),
          b: Math.max(35, Math.round(target.b * 0.60) + 12)
        };
      }
    }

    // Wenn sich die Farbe merklich geändert hat oder erzwungen wurde -> anwenden
    const dr = Math.abs(target.r - this.currentColor.r);
    const dg = Math.abs(target.g - this.currentColor.g);
    const db = Math.abs(target.b - this.currentColor.b);

    if (force || dr > 1 || dg > 1 || db > 1) {
      this.applyColor(target.r, target.g, target.b);
    }
  }

  /**
   * Zirkadiane 24h-Kurve für warmes, vorbildgerechtes Modellbahnlicht
   */
  private calculateCircadianColor(hour: number): { r: number; g: number; b: number } {
    // 00:00 - 05:00: Tiefe Nacht (Mondscheinblau)
    if (hour < 5.0) {
      return { r: 8, g: 15, b: 70 };
    }
    // 05:00 - 06:30: Morgendämmerung (Blau -> Purpur -> zartes Morgenrot)
    if (hour < 6.5) {
      const f = (hour - 5.0) / 1.5;
      return {
        r: Math.round(8 + f * (180 - 8)),
        g: Math.round(15 + f * (60 - 15)),
        b: Math.round(70 + f * (40 - 70))
      };
    }
    // 06:30 - 08:30: Sonnenaufgang (Morgenrot -> Goldorange)
    if (hour < 8.5) {
      const f = (hour - 6.5) / 2.0;
      return {
        r: Math.round(180 + f * (255 - 180)),
        g: Math.round(60 + f * (170 - 60)),
        b: Math.round(40 + f * (70 - 40))
      };
    }
    // 08:30 - 17:00: Tag (Helles, warmes Tageslicht)
    if (hour < 17.0) {
      return { r: 255, g: 240, b: 215 };
    }
    // 17:00 - 19:00: Später Nachmittag -> Abenddämmerung (Goldgelb -> Intensives Orange)
    if (hour < 19.0) {
      const f = (hour - 17.0) / 2.0;
      return {
        r: 255,
        g: Math.round(240 - f * (240 - 110)),
        b: Math.round(215 - f * (215 - 20))
      };
    }
    // 19:00 - 20:30: Sonnenuntergang (Abendrot -> Purpur)
    if (hour < 20.5) {
      const f = (hour - 19.0) / 1.5;
      return {
        r: Math.round(255 - f * (255 - 40)),
        g: Math.round(110 - f * (110 - 25)),
        b: Math.round(20 + f * (130 - 20))
      };
    }
    // 20:30 - 22:00: Blaue Stunde (Purpur -> Nachtblau)
    if (hour < 22.0) {
      const f = (hour - 20.5) / 1.5;
      return {
        r: Math.round(40 - f * (40 - 8)),
        g: Math.round(25 - f * (25 - 15)),
        b: Math.round(130 - f * (130 - 70))
      };
    }
    // 22:00 - 24:00: Nacht
    return { r: 8, g: 15, b: 70 };
  }

  private checkStormSimulation(): void {
    if (!this.config.enabled || !this.isConnected || this.isLightningRunning) return;
    const isStorm = this.config.weather === 'STORM' && (this.config.mode === 'WEATHER' || this.config.mode === 'CIRCADIAN');
    if (!isStorm) return;

    // Zufalls-Chance für Blitzschlag
    const intervalSec = this.config.lightningFrequencySec || 25;
    const probability = 5 / intervalSec; // Da alle 5s aufgerufen

    if (Math.random() < probability) {
      this.triggerLightning();
    }
  }

  /**
   * Zündet die spektakuläre Test-1 Mehrfachblitz-Sequenz
   */
  public async triggerLightning(): Promise<void> {
    if (!this.isConnected || this.isLightningRunning) return;
    this.isLightningRunning = true;

    const savedColor = { ...this.currentColor };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // WebSocket-Event für Audio-Synchronisation (Donnerschlag)
    const thunderDelay = 1200; // 1,2 Sekunden bis zum Donnergroll
    this.events.onLightningStrike(thunderDelay);

    try {
      // 1. Vorblitz (Zucken 130ms)
      this.sendBuffer(this.createColorBuffer(255, 255, 255));
      await sleep(130);

      // 2. Dunkelpause (100ms)
      this.sendBuffer(this.createColorBuffer(5, 10, 30));
      await sleep(100);

      // 3. Haupteinschlag (Vollgas Kaltweiß 240ms)
      this.sendBuffer(this.createColorBuffer(255, 255, 255));
      await sleep(240);

      // 4. Nachflackern
      this.sendBuffer(this.createColorBuffer(30, 45, 90));
      await sleep(90);

      this.sendBuffer(this.createColorBuffer(210, 230, 255));
      await sleep(170);

      // 5. Sanfte Rückkehr zur Grundfarbe
      this.sendBuffer(this.createColorBuffer(savedColor.r, savedColor.g, savedColor.b));
    } catch (err) {
      // Fehler still abfangen
    } finally {
      this.isLightningRunning = false;
    }
  }

  public dispose(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.lightningTimer) clearInterval(this.lightningTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.disconnect();
  }
}
