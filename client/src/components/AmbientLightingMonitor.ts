import { AmbientLightingConfig, LightingMode, WeatherType } from '../types.js';
import { wsClient } from '../wsClient.js';

export class AmbientLightingMonitor {
  private container: HTMLElement | null = null;
  private headerBadge: HTMLElement | null = null;
  private audioCtx: AudioContext | null = null;
  private lastRenderedMode: LightingMode | null = null;
  private lastRenderedWeather: WeatherType | null = null;

  constructor() {
    this.container = document.getElementById('ambient-lighting-settings-container');
    this.headerBadge = document.getElementById('header-ambient-badge');

    wsClient.subscribe(() => {
      this.render();
    });

    this.initAudioSync();
    this.render();
  }

  private initAudioSync(): void {
    // Wenn Server einen Blitz gemeldet hat
    (wsClient as any).onLightningStrike?.((delayMs: number) => {
      this.playThunder(delayMs);
    });
  }

  public playThunder(delayMs: number = 1200): void {
    const cfg = wsClient.settings.ambientLighting;
    if (cfg && cfg.soundSyncEnabled === false) return;

    setTimeout(() => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        if (!this.audioCtx) {
          this.audioCtx = new AudioContextClass();
        }
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }

        const ctx = this.audioCtx;
        const duration = 3.5;
        const sampleRate = ctx.sampleRate;
        const bufferSize = sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);

        // Brown-Noise (tiefes Rumpeln) synthetisieren
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Tiefpassfilter für echten Bass-Groll
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(140, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + duration);

        // Lautstärke-Hüllkurve
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.65, ctx.currentTime + 0.12); // Haupteinschlag
        gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.8);  // Nachgrollen 1
        gain.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 1.4);  // Zweit-Grollen
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration); // Ausklang

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
      } catch (err) {
        console.warn('[Audio] Thunder playback failed:', err);
      }
    }, Math.max(0, delayMs));
  }

  public render(): void {
    this.renderSettingsCard();
    this.renderHeaderWidget();
  }

  private formatTime(h: number): { timeStr: string; phase: string; icon: string } {
    const totalSeconds = Math.floor(((h % 24) + 24) % 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    let phase = 'Taglicht';
    let icon = '☀️';

    if (h < 5.0) {
      phase = 'Tiefe Nacht';
      icon = '🌙';
    } else if (h < 6.5) {
      phase = 'Morgendämmerung';
      icon = '🌅';
    } else if (h < 9.0) {
      phase = 'Morgensonne';
      icon = '🌤️';
    } else if (h < 17.0) {
      phase = 'Taglicht';
      icon = '☀️';
    } else if (h < 19.5) {
      phase = 'Spätnachmittag';
      icon = '🌤️';
    } else if (h < 21.0) {
      phase = 'Sonnenuntergang';
      icon = '🌇';
    } else if (h < 22.5) {
      phase = 'Dämmerung';
      icon = '🌆';
    } else {
      phase = 'Nacht';
      icon = '🌙';
    }

    return { timeStr, phase, icon };
  }

  private renderHeaderWidget(): void {
    if (!this.headerBadge) return;
    const cfg = wsClient.settings.ambientLighting;
    if (!cfg || !cfg.enabled) {
      this.headerBadge.style.display = 'none';
      return;
    }

    this.headerBadge.style.display = 'inline-flex';

    let icon = '☀️';
    let text = 'Tag';

    if (cfg.mode === 'CIRCADIAN' || cfg.mode === 'WEATHER') {
      const h = cfg.currentModelHour ?? 12;
      const { timeStr, icon: timeIcon } = this.formatTime(h);
      icon = timeIcon;
      const shortTime = timeStr.substring(0, 5);

      if (cfg.mode === 'WEATHER' && cfg.weather === 'STORM') {
        icon = '⛈️';
        text = `Sturm (${shortTime})`;
      } else if (cfg.weather === 'STORM') {
        icon = '⛈️';
        text = `Gewitter (${shortTime})`;
      } else if (cfg.weather === 'CLOUDY') {
        icon = '☁️';
        text = `Wolkig (${shortTime})`;
      } else {
        text = `${shortTime} Uhr`;
      }
    } else if (cfg.mode === 'MANUAL') {
      icon = '💡';
      text = 'Manuell';
    } else {
      icon = '⚪';
      text = 'Aus';
    }

    this.headerBadge.innerHTML = `
      <span class="ambient-widget-icon">${icon}</span>
      <span class="ambient-widget-text">${text}</span>
      <button id="btn-quick-lightning" class="btn-quick-flash" title="⚡ Blitz zünden (Test 1)">⚡</button>
    `;

    document.getElementById('btn-quick-lightning')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerLightning();
    });
  }

  private renderSettingsCard(): void {
    if (!this.container) return;
    const cfg = wsClient.settings.ambientLighting || {
      enabled: true,
      ip: '192.168.1.50',
      port: 5577,
      mode: 'CIRCADIAN' as LightingMode,
      modelDayMinutes: 15,
      currentModelHour: 14.0,
      manualColor: { r: 255, g: 160, b: 60 },
      weather: 'CLEAR' as WeatherType,
      randomWeather: false,
      lightningFrequencySec: 25,
      soundSyncEnabled: true,
      isPaused: false
    };

    // Prüfen, ob die DOM-Struktur bereits existiert und der Modus unverändert ist -> nur Live-Werte updaten
    const cardRendered = document.getElementById('ambient-card-rendered');
    if (cardRendered && this.lastRenderedMode === cfg.mode && this.lastRenderedWeather === cfg.weather) {
      this.updateLiveElements(cfg);
      return;
    }

    this.lastRenderedMode = cfg.mode;
    this.lastRenderedWeather = cfg.weather;

    const isCircadian = cfg.mode === 'CIRCADIAN';
    const isWeather = cfg.mode === 'WEATHER';
    const isManual = cfg.mode === 'MANUAL';

    const h = cfg.currentModelHour ?? 14;
    const { timeStr, phase, icon } = this.formatTime(h);

    const isPaused = !!cfg.isPaused;
    const statusBadgeHtml = isPaused
      ? `<span class="badge" style="background:rgba(234,179,8,0.2);color:#eab308;border:1px solid rgba(234,179,8,0.4);font-size:12px;">⏸️ Pausiert</span>`
      : `<span class="badge" style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.4);font-size:12px;display:inline-flex;align-items:center;gap:6px;">
           <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;"></span>
           Automatik aktiv (${cfg.modelDayMinutes > 0 ? '1 Tag = ' + cfg.modelDayMinutes + ' Min' : 'Echtzeit'})
         </span>`;

    this.container.innerHTML = `
      <div id="ambient-card-rendered" class="settings-card" style="border-left: 4px solid #58a6ff;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="display:flex;align-items:center;gap:8px;">
              <span>☀️</span> Raumbeleuchtung & Wetter-Simulation
              <span class="badge" style="background:rgba(88,166,255,0.15);color:#58a6ff;font-size:11px;border:1px solid rgba(88,166,255,0.3);">Magic Home LAN</span>
            </h3>
            <p style="font-size:12px;color:#8b949e;margin-top:2px;">
              Direkte LAN-Steuerung deines Zengge RGB Controllers (Port 5577) für Tag/Nacht-Zyklen und Natur-Gewitter.
            </p>
          </div>
          <button id="btn-trigger-lightning-main" class="btn btn-estop" style="background:#58a6ff;border-color:#38bdf8;box-shadow:0 0 12px rgba(88,166,255,0.4);font-weight:700;">
            ⚡ Blitz testen (Test 1)
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 14px;">
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="ambient-enabled" ${cfg.enabled ? 'checked' : ''}>
              <span><strong>Raumlicht aktiv</strong></span>
            </label>
          </div>

          <div class="form-group">
            <label for="ambient-ip">Controller IP-Adresse:</label>
            <input type="text" id="ambient-ip" class="form-control" value="${cfg.ip || '192.168.1.50'}">
          </div>

          <div class="form-group">
            <label for="ambient-port">Port:</label>
            <input type="number" id="ambient-port" class="form-control" value="${cfg.port || 5577}">
          </div>
        </div>

        <!-- Modus-Auswahl -->
        <div style="margin-top: 16px;">
          <label style="font-size: 13px; font-weight: 600; color: #c9d1d9; display: block; margin-bottom: 8px;">Beleuchtungs-Modus:</label>
          <div class="segmented-pills">
            <button class="segmented-pill ${isCircadian ? 'active' : ''}" data-mode="CIRCADIAN">
              <span>🌙</span> Tag- & Nacht-Automatik
            </button>
            <button class="segmented-pill ${isWeather ? 'active' : ''}" data-mode="WEATHER">
              <span>⛈️</span> Dynamisches Wetter & Sturm
            </button>
            <button class="segmented-pill ${isManual ? 'active' : ''}" data-mode="MANUAL">
              <span>🎨</span> Manuelle Farbe
            </button>
            <button class="segmented-pill ${cfg.mode === 'OFF' ? 'active' : ''}" data-mode="OFF">
              <span>⚪</span> Aus
            </button>
          </div>
        </div>

        <!-- Panel 1: Tag/Nacht Optionen -->
        <div id="panel-circadian" style="display: ${isCircadian ? 'block' : 'none'}; margin-top: 16px; background: #0d1117; padding: 16px; border-radius: 8px; border: 1px solid #30363d;">
          <!-- Status & Start/Pause Leiste -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: rgba(22,27,34,0.8); padding: 10px 14px; border-radius: 6px; border: 1px solid #21262d; margin-bottom: 14px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span id="ambient-clock-display" style="font-size: 15px; font-weight: 700; color: #58a6ff;">
                ${icon} ${timeStr} Uhr <span style="font-size:12px;color:#8b949e;font-weight:400;">(${phase})</span>
              </span>
              <span id="ambient-status-badge">${statusBadgeHtml}</span>
            </div>

            <div style="display:flex;align-items:center;gap:8px;">
              <button id="btn-toggle-pause" class="btn" style="min-width: 105px; font-weight: 600; background: ${isPaused ? '#238636' : 'rgba(110,118,129,0.2)'}; border-color: ${isPaused ? '#2ea043' : '#30363d'}; color: #f0f6fc;">
                ${isPaused ? '▶ Starten' : '⏸ Pause'}
              </button>
            </div>
          </div>

          <!-- Schnellwahltasten für Tagesdauer -->
          <div style="margin-bottom: 14px;">
            <label style="font-size: 12px; font-weight: 600; color: #8b949e; display: block; margin-bottom: 6px;">
              Schnell-Einstellung Tagesdauer (Modelluhr-Geschwindigkeit):
            </label>
            <div class="segmented-pills">
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 1 ? 'active' : ''}" data-minutes="1" style="color:#58a6ff;font-weight:700;">
                ⚡ 1 Min (Turbo-Test)
              </button>
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 5 ? 'active' : ''}" data-minutes="5">
                5 Min
              </button>
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 15 ? 'active' : ''}" data-minutes="15">
                15 Min
              </button>
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 30 ? 'active' : ''}" data-minutes="30">
                30 Min
              </button>
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 60 ? 'active' : ''}" data-minutes="60">
                60 Min (1h)
              </button>
              <button class="segmented-pill btn-day-preset ${cfg.modelDayMinutes === 0 ? 'active' : ''}" data-minutes="0">
                24h (Echtzeit)
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            <div class="form-group">
              <label for="ambient-day-minutes">Dauer 1 Modelltag (in Realminuten):</label>
              <input type="number" id="ambient-day-minutes" class="form-control" value="${cfg.modelDayMinutes ?? 15}" min="1" max="1440">
              <small style="color:#8b949e;display:block;margin-top:4px;">1 Min = kompletter Tag/Nacht-Ablauf in 60 Sekunden (ideal zum Testen).</small>
            </div>

            <div class="form-group">
              <label for="ambient-hour-slider">Modellstunde manuell anspringen (0 - 24):</label>
              <input type="range" id="ambient-hour-slider" min="0" max="23.99" step="0.1" value="${cfg.currentModelHour || 14}" style="width:100%;">
              <div style="display:flex;justify-content:space-between;font-size:11px;color:#8b949e;margin-top:2px;">
                <span>00:00 (Nacht)</span>
                <span>06:00 (Morgen)</span>
                <span>12:00 (Mittag)</span>
                <span>18:00 (Abend)</span>
                <span>24:00</span>
              </div>
            </div>
          </div>

          <!-- Wetter-Einfluss im Automatik-Modus -->
          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #21262d;">
            <label style="font-size: 12px; font-weight: 600; color: #8b949e; display: block; margin-bottom: 6px;">
              Wetter-Einfluss auf die Tageskurve:
            </label>
            <div class="segmented-pills">
              <button class="segmented-pill ${cfg.weather === 'CLEAR' ? 'active' : ''}" data-weather="CLEAR">
                <span>☀️</span> Sonnig / Klar
              </button>
              <button class="segmented-pill ${cfg.weather === 'CLOUDY' ? 'active' : ''}" data-weather="CLOUDY">
                <span>☁️</span> Wolkig (gedämpft)
              </button>
              <button class="segmented-pill ${cfg.weather === 'STORM' ? 'active' : ''}" data-weather="STORM" style="${cfg.weather === 'STORM' ? 'border-color:#d2a8ff;color:#d2a8ff;background:rgba(188,140,255,0.15);' : ''}">
                <span>⛈️</span> Sommergewitter (mit Blitzen)
              </button>
            </div>
          </div>
        </div>

        <!-- Panel 2: Wetter Optionen -->
        <div id="panel-weather" style="display: ${isWeather ? 'block' : 'none'}; margin-top: 16px; background: #0d1117; padding: 14px; border-radius: 8px; border: 1px solid #30363d;">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 13px; font-weight: 600; color: #58a6ff; display: block; margin-bottom: 6px;">Aktuelle Wetterlage:</label>
            <div class="segmented-pills">
              <button class="segmented-pill ${cfg.weather === 'CLEAR' ? 'active' : ''}" data-weather="CLEAR">
                <span>☀️</span> Sonnig / Klar
              </button>
              <button class="segmented-pill ${cfg.weather === 'CLOUDY' ? 'active' : ''}" data-weather="CLOUDY">
                <span>☁️</span> Wolkig (gedämpft)
              </button>
              <button class="segmented-pill ${cfg.weather === 'STORM' ? 'active' : ''}" data-weather="STORM" style="${cfg.weather === 'STORM' ? 'border-color:#d2a8ff;color:#d2a8ff;background:rgba(188,140,255,0.15);' : ''}">
                <span>⛈️</span> Gewitter / Sturm
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 10px;">
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="ambient-sound-sync" ${cfg.soundSyncEnabled !== false ? 'checked' : ''}>
                <span><strong>Synchroner Donnerschlag</strong> (Browser Web Audio)</span>
              </label>
            </div>

            <div class="form-group">
              <label for="ambient-storm-freq">Blitz-Häufigkeit im Sturm:</label>
              <select id="ambient-storm-freq" class="form-control">
                <option value="15" ${cfg.lightningFrequencySec === 15 ? 'selected' : ''}>Sehr häufig (alle ~15s)</option>
                <option value="25" ${(!cfg.lightningFrequencySec || cfg.lightningFrequencySec === 25) ? 'selected' : ''}>Mittel (alle ~25s)</option>
                <option value="45" ${cfg.lightningFrequencySec === 45 ? 'selected' : ''}>Gelegentlich (alle ~45s)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Panel 3: Manuelle Farbe -->
        <div id="panel-manual" style="display: ${isManual ? 'block' : 'none'}; margin-top: 16px; background: #0d1117; padding: 14px; border-radius: 8px; border: 1px solid #30363d;">
          <label style="font-size: 13px; font-weight: 600; color: #58a6ff; display: block; margin-bottom: 8px;">Feste Farbe wählen:</label>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <input type="color" id="ambient-manual-color-picker" value="${this.rgbToHex(cfg.manualColor?.r || 255, cfg.manualColor?.g || 160, cfg.manualColor?.b || 60)}" style="width: 50px; height: 38px; border: 1px solid #30363d; border-radius: 6px; cursor: pointer; background: transparent;">
            <div class="segmented-pills">
              <button class="segmented-pill btn-quick-color" data-r="255" data-g="230" data-b="190">Warmweiß (Tag)</button>
              <button class="segmented-pill btn-quick-color" data-r="255" data-g="120" data-b="20">Goldorange (Abend)</button>
              <button class="segmented-pill btn-quick-color" data-r="10" data-g="25" data-b="140">Mondblau (Nacht)</button>
              <button class="segmented-pill btn-quick-color" data-r="220" data-g="40" data-b="15">Glutrot</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private updateLiveElements(cfg: AmbientLightingConfig): void {
    const h = cfg.currentModelHour ?? 14;
    const { timeStr, phase, icon } = this.formatTime(h);

    const clockDisplay = document.getElementById('ambient-clock-display');
    if (clockDisplay) {
      clockDisplay.innerHTML = `${icon} ${timeStr} Uhr <span style="font-size:12px;color:#8b949e;font-weight:400;">(${phase})</span>`;
    }

    const isPaused = !!cfg.isPaused;
    const statusBadge = document.getElementById('ambient-status-badge');
    if (statusBadge) {
      statusBadge.innerHTML = isPaused
        ? `<span class="badge" style="background:rgba(234,179,8,0.2);color:#eab308;border:1px solid rgba(234,179,8,0.4);font-size:12px;">⏸️ Pausiert</span>`
        : `<span class="badge" style="background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid rgba(34,197,94,0.4);font-size:12px;display:inline-flex;align-items:center;gap:6px;">
             <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;"></span>
             Automatik aktiv (${cfg.modelDayMinutes > 0 ? '1 Tag = ' + cfg.modelDayMinutes + ' Min' : 'Echtzeit'})
           </span>`;
    }

    const btnToggle = document.getElementById('btn-toggle-pause') as HTMLButtonElement | null;
    if (btnToggle) {
      btnToggle.innerHTML = isPaused ? '▶ Starten' : '⏸ Pause';
      btnToggle.style.background = isPaused ? '#238636' : 'rgba(110,118,129,0.2)';
      btnToggle.style.borderColor = isPaused ? '#2ea043' : '#30363d';
    }

    const slider = document.getElementById('ambient-hour-slider') as HTMLInputElement | null;
    if (slider && document.activeElement !== slider) {
      slider.value = h.toFixed(2);
    }

    // Preset Buttons hervorheben
    document.querySelectorAll<HTMLButtonElement>('.btn-day-preset').forEach((btn) => {
      const minutes = parseInt(btn.dataset.minutes || '-1', 10);
      btn.classList.toggle('active', minutes === cfg.modelDayMinutes);
    });
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  private bindEvents(): void {
    document.getElementById('btn-trigger-lightning-main')?.addEventListener('click', () => {
      this.triggerLightning();
    });

    document.getElementById('ambient-enabled')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.updateConfig({ enabled: checked });
    });

    document.getElementById('ambient-ip')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) this.updateConfig({ ip: val });
    });

    document.getElementById('ambient-port')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (val > 0) this.updateConfig({ port: val });
    });

    // Start / Pause Schalter
    document.getElementById('btn-toggle-pause')?.addEventListener('click', () => {
      const currentPaused = !!wsClient.settings.ambientLighting?.isPaused;
      this.updateConfig({ isPaused: !currentPaused });
    });

    // Preset Buttons für Tagesdauer
    document.querySelectorAll<HTMLButtonElement>('.btn-day-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const minutes = parseInt(btn.dataset.minutes || '15', 10);
        this.updateConfig({
          modelDayMinutes: minutes,
          mode: 'CIRCADIAN',
          isPaused: false
        });
      });
    });

    // Modus-Pills
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as LightingMode;
        if (mode) this.updateConfig({ mode });
      });
    });

    // Wetter-Pills
    document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const weather = btn.dataset.weather as WeatherType;
        if (weather) this.updateConfig({ weather });
      });
    });

    document.getElementById('ambient-day-minutes')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) this.updateConfig({ modelDayMinutes: val });
    });

    document.getElementById('ambient-hour-slider')?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (!isNaN(val)) this.updateConfig({ currentModelHour: val });
    });

    document.getElementById('ambient-storm-freq')?.addEventListener('change', (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10);
      if (!isNaN(val)) this.updateConfig({ lightningFrequencySec: val });
    });

    document.getElementById('ambient-sound-sync')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.updateConfig({ soundSyncEnabled: checked });
    });

    document.getElementById('ambient-manual-color-picker')?.addEventListener('input', (e) => {
      const hex = (e.target as HTMLInputElement).value;
      const rgb = this.hexToRgb(hex);
      this.updateConfig({ manualColor: rgb, mode: 'MANUAL' });
    });

    document.querySelectorAll<HTMLButtonElement>('.btn-quick-color').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = parseInt(btn.dataset.r || '255', 10);
        const g = parseInt(btn.dataset.g || '255', 10);
        const b = parseInt(btn.dataset.b || '255', 10);
        this.updateConfig({ manualColor: { r, g, b }, mode: 'MANUAL' });
      });
    });
  }

  private updateConfig(partial: Partial<AmbientLightingConfig>): void {
    wsClient.send({
      type: 'UPDATE_LIGHTING_CONFIG',
      payload: partial
    });
  }

  private triggerLightning(): void {
    wsClient.send({
      type: 'TRIGGER_LIGHTNING'
    });
  }
}
