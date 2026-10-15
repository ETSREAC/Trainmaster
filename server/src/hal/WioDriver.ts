import dgram from 'dgram';
import net from 'net';
import os from 'os';
import { execSync } from 'child_process';
import { Signal, SignalAspect, WioNodeInfo, WioPacketInfo, DiscoveredEsp } from '../types.js';

export interface WioSensorEvent {
  id?: string;
  address?: number;
  unit?: number;
  pin?: number;
  state: boolean;
  rawPayload?: string;
  sourceIp?: string;
  /** CR-13: Zustandsabgleich nach (Wieder-)Verbindung statt Flankenereignis */
  snapshot?: boolean;
}

export interface WioDriverCallbacks {
  onSensorTriggered: (event: WioSensorEvent) => void;
  onNodeUpdated?: (node: WioNodeInfo) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

export class WioDriver {
  private udpSocket: dgram.Socket | null = null;
  private tcpServer: net.Server | null = null;
  private tcpClients: Map<string, net.Socket> = new Map();
  private port: number;
  private callbacks: WioDriverCallbacks;
  private isListening: boolean = false;

  private discoveredNodes: Map<string, WioNodeInfo> = new Map();
  public recentPackets: WioPacketInfo[] = [];
  public lastScanResults: DiscoveredEsp[] = [];

  public packetsReceived: number = 0;
  public lastPacketTime: number = 0;
  public lastSourceIp: string = '';

  private static readonly MAX_TCP_BUFFER = 64 * 1024;

  /** Prüft, ob ein ungerahmter Rest eine vollständige Nachricht ist (JSON muss parsebar sein). */
  private static isCompleteFrame(msg: string): boolean {
    if (msg.startsWith('{')) {
      try {
        JSON.parse(msg);
        return true;
      } catch {
        return false;
      }
    }
    if (msg.startsWith('<')) return msg.endsWith('>');
    return true;
  }

  constructor(port = 8051, callbacks: WioDriverCallbacks) {
    this.port = port;
    this.callbacks = callbacks;
  }

  public async start(): Promise<boolean> {
    if (this.isListening) return true;

    // 1. Starte UDP Empfänger
    const udpPromise = new Promise<boolean>((resolve) => {
      try {
        this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.udpSocket.on('error', (err) => {
          this.callbacks.onLog?.(`[WIO] UDP Socket Fehler auf Port ${this.port}: ${err.message}`, 'error');
        });

        this.udpSocket.on('message', (msgBuffer, rinfo) => {
          this.handleIncomingDatagram(msgBuffer, rinfo.address);
        });

        this.udpSocket.on('listening', () => {
          const addr = this.udpSocket?.address();
          this.callbacks.onLog?.(
            `[WIO] 📡 ESP32 WIO UDP-Empfänger aktiv auf Port ${addr?.port || this.port}`,
            'info'
          );
          resolve(true);
        });

        this.udpSocket.bind(this.port);
      } catch (err: any) {
        this.callbacks.onLog?.(`[WIO] Konnte UDP-Empfänger auf Port ${this.port} nicht binden: ${err.message}`, 'error');
        resolve(false);
      }
    });

    // 2. Starte TCP Server (für Rocrail WIO Firmware)
    const tcpPromise = new Promise<boolean>((resolve) => {
      try {
        this.tcpServer = net.createServer((socket) => {
          const remoteRaw = socket.remoteAddress || '';
          const clientIp = remoteRaw.includes('::1') || remoteRaw === '127.0.0.1' ? '127.0.0.1' : remoteRaw.replace(/^.*:/, '');

          this.callbacks.onLog?.(`[WIO] 🟢 ESP32 TCP-Verbindung aufgebaut von ${clientIp}`, 'info');
          this.tcpClients.set(clientIp, socket);

          // CR-12: TCP ist ein Bytestrom -> pro Socket puffern und nur vollständige Zeilen verarbeiten
          let rxBuf = '';
          let flushTimer: NodeJS.Timeout | null = null;

          socket.on('data', (buf) => {
            // RocNet-Binärpakete (ohne Zeilenrahmung) unverändert durchreichen
            if (rxBuf.length === 0 && buf.length >= 8 && buf[0] === 0x00 && buf[5] === 0x01) {
              this.handleIncomingDatagram(buf, clientIp, socket);
              return;
            }

            rxBuf += buf.toString('utf-8');
            if (rxBuf.length > WioDriver.MAX_TCP_BUFFER) {
              this.callbacks.onLog?.(`[WIO] TCP-Empfangspuffer von ${clientIp} übergelaufen (> ${WioDriver.MAX_TCP_BUFFER} Bytes), verworfen.`, 'warn');
              rxBuf = '';
              return;
            }

            let nl: number;
            while ((nl = rxBuf.indexOf('\n')) !== -1) {
              const line = rxBuf.slice(0, nl).replace(/\r$/, '');
              rxBuf = rxBuf.slice(nl + 1);
              if (line.trim()) {
                this.handleIncomingDatagram(Buffer.from(line, 'utf-8'), clientIp, socket);
              }
            }

            // Gegenstellen ohne Zeilenende (ältere WIO-Firmware): Rest nach kurzer Ruhepause
            // verarbeiten, sofern er einen vollständigen Frame bildet
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = null;
            if (rxBuf.trim()) {
              flushTimer = setTimeout(() => {
                flushTimer = null;
                const rest = rxBuf.trim();
                if (rest && WioDriver.isCompleteFrame(rest)) {
                  rxBuf = '';
                  this.handleIncomingDatagram(Buffer.from(rest, 'utf-8'), clientIp, socket);
                }
              }, 100);
            }
          });

          socket.on('error', (err) => {
            this.callbacks.onLog?.(`[WIO] TCP-Fehler bei ${clientIp}: ${err.message}`, 'warn');
          });

          socket.on('close', () => {
            if (flushTimer) clearTimeout(flushTimer);
            this.tcpClients.delete(clientIp);
            this.callbacks.onLog?.(`[WIO] ESP32 TCP-Verbindung beendet (${clientIp})`, 'info');
          });
        });

        this.tcpServer.on('error', (err: any) => {
          this.callbacks.onLog?.(`[WIO] TCP Server Fehler auf Port ${this.port}: ${err.message}`, 'error');
          resolve(false);
        });

        this.tcpServer.listen(this.port, () => {
          this.callbacks.onLog?.(
            `[WIO] 🔌 ESP32 WIO TCP-Server lauscht auf Port ${this.port} (Rocrail WIO kompatibel)`,
            'info'
          );
          resolve(true);
        });
      } catch (err: any) {
        this.callbacks.onLog?.(`[WIO] Konnte TCP-Server auf Port ${this.port} nicht starten: ${err.message}`, 'error');
        resolve(false);
      }
    });

    const [udpOk, tcpOk] = await Promise.all([udpPromise, tcpPromise]);
    this.isListening = udpOk || tcpOk;
    return this.isListening;
  }

  public async stop(): Promise<void> {
    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }
    for (const [, sock] of this.tcpClients) {
      try {
        sock.destroy();
      } catch {}
    }
    this.tcpClients.clear();

    if (this.tcpServer) {
      await new Promise<void>((res) => this.tcpServer?.close(() => res()));
      this.tcpServer = null;
    }
    this.isListening = false;
    this.callbacks.onLog?.('[WIO] UDP & TCP WIO-Dienste gestoppt.', 'info');
  }

  public getStatus(): { active: boolean; port: number; packetsReceived: number; lastPacketTime: number; lastSourceIp: string; nodeCount: number; tcpClientsCount: number } {
    return {
      active: this.isListening,
      port: this.port,
      packetsReceived: this.packetsReceived,
      lastPacketTime: this.lastPacketTime,
      lastSourceIp: this.lastSourceIp,
      nodeCount: this.discoveredNodes.size,
      tcpClientsCount: this.tcpClients.size
    };
  }

  public getDiscoveredNodes(): WioNodeInfo[] {
    return Array.from(this.discoveredNodes.values());
  }

  public getRecentPackets(): WioPacketInfo[] {
    return this.recentPackets;
  }

  public getLastScanResults(): DiscoveredEsp[] {
    return this.lastScanResults;
  }

  /**
   * Sendet einen Signal-Stellbefehl an das zuständige ESP32 WIO Modul
   */
  public async sendSignalCommand(signal: Signal, aspect: SignalAspect): Promise<boolean> {
    const unit = signal.wioUnit || 33;
    let targetIp: string | null = null;

    // CR-11: Ausschließlich den Node mit exakt dieser Unit ansprechen, keine Ersatz-Geräte
    for (const node of this.discoveredNodes.values()) {
      if (node.unit === unit) {
        targetIp = node.ip;
        break;
      }
    }

    if (!targetIp) {
      this.callbacks.onLog?.(
        `[WIO] Signal "${signal.name}" nicht gesendet: Kein ESP32 mit Unit #${unit} bekannt/verbunden.`,
        'error'
      );
      return false;
    }

    // Berechne Pin-Zustände (Rot, Grün, Gelb, Weiß)
    const pins = signal.wioPins || {};
    const pinLevels: Record<number, boolean> = {};

    let redState = false;
    let greenState = false;
    let yellowState = false;
    let whiteState = false;

    switch (aspect) {
      case 'HP0':
      case 'SH0':
        redState = true;
        break;
      case 'HP1':
        greenState = true;
        break;
      case 'HP2':
        greenState = true;
        yellowState = true;
        break;
      case 'SH1':
        whiteState = true;
        break;
    }

    if (pins.red !== undefined) pinLevels[pins.red] = signal.inverted ? !redState : redState;
    if (pins.green !== undefined) pinLevels[pins.green] = signal.inverted ? !greenState : greenState;
    if (pins.yellow !== undefined) pinLevels[pins.yellow] = signal.inverted ? !yellowState : yellowState;
    if (pins.white !== undefined) pinLevels[pins.white] = signal.inverted ? !whiteState : whiteState;

    // JSON Payload
    const jsonPayload = JSON.stringify({
      cmd: 'signal',
      id: signal.id,
      name: signal.name,
      unit,
      aspect,
      pins: pinLevels,
      inverted: !!signal.inverted,
      ledIndex: signal.wioLedIndex
    });

    // 1. Per TCP senden (falls Client verbunden)
    const clientSocket = this.tcpClients.get(targetIp) || null;
    if (clientSocket && !clientSocket.destroyed) {
      try {
        for (const [pinStr, state] of Object.entries(pinLevels)) {
          const pin = parseInt(pinStr, 10);
          clientSocket.write(`<output unit="${unit}" port="${pin}" val="${state ? 1 : 0}"/>\n`);
        }
        clientSocket.write(`<aspect id="${signal.id}" unit="${unit}" aspect="${aspect.toLowerCase()}"/>\n`);
        clientSocket.write(jsonPayload + '\n');
      } catch (err: any) {
        this.callbacks.onLog?.(`[WIO] TCP Sende-Fehler an ${targetIp}: ${err.message}`, 'warn');
      }
    }

    // 2. Per UDP senden
    if (this.udpSocket && this.isListening) {
      try {
        const buf = Buffer.from(jsonPayload, 'utf-8');
        this.udpSocket.send(buf, 0, buf.length, this.port, targetIp);

        for (const [pinStr, state] of Object.entries(pinLevels)) {
          const pin = parseInt(pinStr, 10);
          const xmlOut = `<output unit="${unit}" port="${pin}" val="${state ? 1 : 0}"/>`;
          const xmlBuf = Buffer.from(xmlOut, 'utf-8');
          this.udpSocket.send(xmlBuf, 0, xmlBuf.length, this.port, targetIp);
        }

        const xmlAspect = `<aspect id="${signal.id}" unit="${unit}" aspect="${aspect.toLowerCase()}"/>`;
        const xmlAspectBuf = Buffer.from(xmlAspect, 'utf-8');
        this.udpSocket.send(xmlAspectBuf, 0, xmlAspectBuf.length, this.port, targetIp);
      } catch (err: any) {
        this.callbacks.onLog?.(`[WIO] Fehler beim UDP-Senden an ${targetIp}:${this.port}: ${err.message}`, 'error');
      }
    }

    // 3. HTTP POST Versuch (nur an gültige IP-Adressen)
    if (targetIp !== '127.0.0.1' && net.isIP(targetIp)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      fetch(`http://${targetIp}/api/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonPayload,
        signal: controller.signal
      }).catch(() => {
        // Ignoriere Netzwerkfehler
      }).finally(() => clearTimeout(timer));
    }

    // 4. Im Packet-Log aufnehmen
    const logText = `TX [${targetIp}] Signal "${signal.name}" (Unit ${unit}) -> ${aspect} ${JSON.stringify(pinLevels)}`;
    this.recentPackets.unshift({
      timestamp: Date.now(),
      ip: `${targetIp} (TX)`,
      payload: logText
    });
    if (this.recentPackets.length > 30) this.recentPackets.pop();

    this.callbacks.onLog?.(`[WIO] 🚦 Signal "${signal.name}" geschaltet auf ${aspect} -> ESP32 (${targetIp})`, 'info');

    const nodeKey = `${targetIp}_${unit}`;
    const node = this.discoveredNodes.get(nodeKey);
    if (node) {
      this.callbacks.onNodeUpdated?.(node);
    }

    return true;
  }

  private isLocalServerIp(ip: string): boolean {
    if (ip === '127.0.0.1' || ip === '::1') return true;
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const netIf of ifaces[name] || []) {
        if (netIf.address === ip) return true;
      }
    }
    return false;
  }

  public recordNodeActivity(
    sourceIp: string,
    unit?: number,
    pin?: number,
    state?: boolean,
    payload?: string,
    meta?: Partial<WioNodeInfo>
  ): void {
    if (!net.isIP(sourceIp) || this.isLocalServerIp(sourceIp)) {
      return;
    }

    const unitNum = unit !== undefined && !isNaN(unit) ? unit : 33;
    const key = `${sourceIp}_${unitNum}`;
    let node = this.discoveredNodes.get(key);

    const isNew = !node;
    if (!node) {
      const initialPins: Record<number, boolean> = {};
      const espAllPins = [1, 2, 3, 4, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39];
      for (const p of espAllPins) initialPins[p] = false;
      node = {
        unit: unitNum,
        ip: sourceIp,
        lastSeen: Date.now(),
        packetsReceived: 0,
        lastPayload: payload || '',
        pinStates: initialPins,
        ...meta
      };
      this.discoveredNodes.set(key, node);
      this.callbacks.onLog?.(
        `[WIO] 🌟 ESP32 WIO-Modul erkannt! IP: ${sourceIp}, Baugruppe/Unit: ${unitNum}${meta?.name ? ` ("${meta.name}")` : ''}`,
        'info'
      );
    } else if (meta) {
      Object.assign(node, meta);
    }

    node.lastSeen = Date.now();
    node.packetsReceived++;
    if (payload) {
      node.lastPayload = payload;
      this.recentPackets.unshift({
        timestamp: Date.now(),
        ip: sourceIp,
        payload
      });
      if (this.recentPackets.length > 30) this.recentPackets.pop();
    }
    if (pin !== undefined && state !== undefined) {
      node.pinStates[pin] = state;
    }

    this.callbacks.onNodeUpdated?.(node);
  }

  /**
   * Universeller Parser für ankommende Daten (UDP, TCP oder HTTP)
   */
  public handleIncomingDatagram(buffer: Buffer, sourceIp: string, socket?: net.Socket): void {
    this.packetsReceived++;
    this.lastPacketTime = Date.now();
    this.lastSourceIp = sourceIp;

    const rawStr = buffer.toString('utf-8').trim();

    // Log in recent packets buffer
    this.recentPackets.unshift({
      timestamp: Date.now(),
      ip: sourceIp,
      payload: rawStr.length > 120 ? rawStr.slice(0, 120) + '...' : rawStr
    });
    if (this.recentPackets.length > 30) this.recentPackets.pop();

    // Ignoriere ausgehende Signal- und Ausgabebefehle
    if (rawStr.startsWith('<output') || rawStr.startsWith('<aspect') || rawStr.includes('"cmd":"signal"')) {
      return;
    }

    // Wenn ein Datagramm aus mehreren zusammenhängenden Blöcken besteht (z. B. <xmlh> gefolgt von $1C...)
    if (rawStr.includes('</xmlh>') && rawStr.indexOf('</xmlh>') < rawStr.length - 7) {
      const splitIdx = rawStr.indexOf('</xmlh>') + 7;
      const part1 = rawStr.substring(0, splitIdx);
      const part2 = rawStr.substring(splitIdx).trim();
      this.processMessageString(part1, sourceIp, socket);
      if (part2) this.processMessageString(part2, sourceIp, socket);
      return;
    }

    this.processMessageString(rawStr, sourceIp, socket, buffer);
  }

  private processMessageString(msg: string, sourceIp: string, socket?: net.Socket, rawBuf?: Buffer): void {
    // 1. Rocrail WIO Handshake Header: <xmlh><wio type="..." id="33" nodename="ESP32Sig" clientver="1280" rr="0"/></xmlh>
    if (msg.includes('<xmlh') && msg.includes('<wio')) {
      this.parseWioXmlHeader(msg, sourceIp, socket);
      return;
    }

    // 2. Standard XML Prüfung: <fb id="..." addr="..." bus="1" pin="2" state="true|false"/>
    if (msg.startsWith('<') && msg.endsWith('>')) {
      this.parseXmlPacket(msg, sourceIp);
      return;
    }

    // 3. Hex-Pakete im Rocrail / RocNet Stil ($1C..., $28...)
    if (msg.startsWith('$')) {
      this.parseHexPacket(msg, sourceIp);
      return;
    }

    // 4. JSON Prüfung (z.B. {"unit": 1, "pin": 3, "state": true})
    if (msg.startsWith('{') && msg.endsWith('}')) {
      try {
        const json = JSON.parse(msg);
        this.parseJsonPacket(json, msg, sourceIp);
        return;
      } catch {}
    }

    // 5. RocNet Binärpaket
    if (rawBuf && rawBuf.length >= 8 && rawBuf[0] === 0x00 && rawBuf[5] === 0x01) {
      this.parseRocNetBinary(rawBuf, sourceIp);
      return;
    }

    // 6. Kompakte Textnachrichten: "WIO:unit:pin:state" oder "SENSOR:addr:state" oder "Q addr state"
    this.parseTextPacket(msg, sourceIp);
  }

  private parseWioXmlHeader(xml: string, sourceIp: string, socket?: net.Socket): void {
    const getAttr = (name: string): string | null => {
      const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(xml);
      return match ? match[1] : null;
    };

    const idStr = getAttr('id');
    const unit = idStr ? parseInt(idStr, 10) : 33;
    const nodename = getAttr('nodename') || 'ESP32Sig';
    const type = getAttr('type') || 'i2cio16';
    const clientver = getAttr('clientver') || '';

    this.recordNodeActivity(sourceIp, unit, undefined, undefined, xml, {
      name: nodename,
      type,
      clientver,
      connectionType: 'TCP'
    });

    this.callbacks.onLog?.(
      `[WIO] 🎛️ ESP32 "${nodename}" (Unit #${unit}, Typ: ${type}, Firmware v${clientver}) angedockt. IP: ${sourceIp}`,
      'info'
    );

    // Bestätigung senden, um die Verbindung stabil zu halten
    if (socket && !socket.destroyed) {
      try {
        socket.write('<wio resp="ok"/>\n');
      } catch {}
    }
  }

  private parseHexPacket(hexStr: string, sourceIp: string): void {
    // Beispiel:
    // - $280021FEF6FFC00000006400000000000000000096 -> Telemetrie (Gruppe 00: RSSI, Uptime, Heap)
    // - $1C11210B00050618191A1B1C1D1E1F -> Pin-Mapping-Deklaration (Gruppe 11)
    // - $<len>0121... -> Echter Sensor-Event (Gruppe 01 = RN_GROUP_SENSOR)
    if (hexStr.length >= 7) {
      const groupHex = hexStr.slice(3, 5);
      const group = parseInt(groupHex, 16);
      const nodeHex = hexStr.slice(5, 7);
      const unit = parseInt(nodeHex, 16);

      if (!isNaN(unit) && unit > 0) {
        this.recordNodeActivity(sourceIp, unit, undefined, undefined, hexStr);

        // Gruppe 0 = System/Telemetrie (RSSI, WiFi, Uptime). KEINESFALLS als Sensoren interpretieren!
        if (group === 0) {
          return;
        }

        // Gruppe 1 = Sensor Event (RN_GROUP_SENSOR)
        // Format: $<len><group:01><node><code:01><port><state>...
        if (group === 1 && hexStr.length >= 13) {
          const port = parseInt(hexStr.slice(9, 11), 16);
          const state = parseInt(hexStr.slice(11, 13), 16) > 0;
          if (!isNaN(port) && port >= 1 && port <= 64) {
            this.recordPinChange(sourceIp, unit, port, state);
          }
        }
        return;
      }
    }
    this.recordNodeActivity(sourceIp, 33, undefined, undefined, hexStr);
  }

  private recordPinChange(sourceIp: string, unit: number, pin: number, state: boolean): void {
    const key = `${sourceIp}_${unit}`;
    const node = this.discoveredNodes.get(key);
    if (node) {
      const prevState = node.pinStates[pin];
      if (prevState !== state) {
        node.pinStates[pin] = state;
        this.callbacks.onNodeUpdated?.(node);
        this.callbacks.onSensorTriggered({
          unit,
          pin,
          address: unit * 100 + pin,
          state,
          sourceIp
        });
      }
    }
  }

  private parseXmlPacket(xml: string, sourceIp: string): void {
    const getAttr = (name: string): string | null => {
      const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(xml);
      return match ? match[1] : null;
    };

    const id = getAttr('id') || undefined;
    const addrStr = getAttr('addr') || getAttr('address');
    const busStr = getAttr('bus') || getAttr('unit') || getAttr('node');
    const pinStr = getAttr('pin') || getAttr('port');
    const stateStr = getAttr('state') || getAttr('val') || getAttr('cmd');

    let state = false;
    if (stateStr) {
      state = stateStr.toLowerCase() === 'true' || stateStr === '1' || stateStr.toLowerCase() === 'on';
    }

    const unit = busStr ? parseInt(busStr, 10) : 33;
    const pin = pinStr ? parseInt(pinStr, 10) : undefined;

    this.recordNodeActivity(sourceIp, unit, pin, state, xml);

    const event: WioSensorEvent = {
      id,
      address: addrStr ? parseInt(addrStr, 10) : (unit && pin ? unit * 100 + pin : undefined),
      unit,
      pin,
      state,
      rawPayload: xml,
      sourceIp
    };

    this.callbacks.onSensorTriggered(event);
  }

  public parseJsonPacket(json: any, rawPayload: string, sourceIp: string): void {
    // 1. TrainMasterNode Connect/Registrierung
    if (json.event === 'connect' || json.cmd === 'register') {
      const unit = json.unit ? Number(json.unit) : 33;
      const name = json.nodename || 'TrainMasterNode';
      const version = json.version || '';
      this.recordNodeActivity(sourceIp, unit, undefined, undefined, rawPayload, {
        name,
        type: 'TrainMasterNode',
        clientver: version,
        connectionType: 'TCP'
      });
      this.callbacks.onLog?.(`[WIO] 🚂 TrainMasterNode "${name}" (Unit #${unit}, v${version}) erfolgreich verbunden!`, 'info');
      return;
    }

    // 2. TrainMasterNode Heartbeat
    if (json.event === 'heartbeat') {
      const unit = json.unit ? Number(json.unit) : 33;
      this.recordNodeActivity(sourceIp, unit, undefined, undefined, rawPayload);
      return;
    }

    // 3. Sensor Event
    const state =
      json.state === true ||
      json.state === 1 ||
      json.state === 'true' ||
      json.state === 'on' ||
      json.val === 1 ||
      json.val === true;

    const unit = json.unit !== undefined ? Number(json.unit) : json.bus !== undefined ? Number(json.bus) : json.node !== undefined ? Number(json.node) : 33;
    const pin = json.pin !== undefined ? Number(json.pin) : json.port !== undefined ? Number(json.port) : undefined;

    this.recordNodeActivity(sourceIp, unit, pin, state, rawPayload);

    const event: WioSensorEvent = {
      id: json.id ? String(json.id) : undefined,
      address: json.address !== undefined ? Number(json.address) : json.addr !== undefined ? Number(json.addr) : (unit && pin ? unit * 100 + pin : undefined),
      unit,
      pin,
      state,
      rawPayload,
      sourceIp,
      snapshot: json.snapshot === true
    };

    this.callbacks.onSensorTriggered(event);
  }

  private parseRocNetBinary(buffer: Buffer, sourceIp: string): void {
    const unit = (buffer[3] << 8) | buffer[4];
    const pin = buffer[8];
    const state = buffer[9] > 0;
    const rawPayload = `[RocNet Binär] Unit:${unit} Pin:${pin} State:${state ? 1 : 0}`;

    this.recordNodeActivity(sourceIp, unit, pin, state, rawPayload);

    const event: WioSensorEvent = {
      unit,
      pin,
      state,
      rawPayload,
      sourceIp
    };

    this.callbacks.onSensorTriggered(event);
  }

  private parseTextPacket(text: string, sourceIp: string): void {
    // Format WIO:unit:pin:state
    if (text.toUpperCase().startsWith('WIO:')) {
      const parts = text.split(':');
      if (parts.length >= 4) {
        const unit = parseInt(parts[1], 10);
        const pin = parseInt(parts[2], 10);
        const state = parts[3] === '1' || parts[3].toLowerCase() === 'true';
        this.recordNodeActivity(sourceIp, unit, pin, state, text);
        this.callbacks.onSensorTriggered({ unit, pin, state, rawPayload: text, sourceIp });
        return;
      }
    }

    // Format SENSOR:addr:state
    if (text.toUpperCase().startsWith('SENSOR:')) {
      const parts = text.split(':');
      if (parts.length >= 3) {
        const address = parseInt(parts[1], 10);
        const state = parts[2] === '1' || parts[2].toLowerCase() === 'true';
        this.recordNodeActivity(sourceIp, undefined, undefined, state, text);
        this.callbacks.onSensorTriggered({ address, state, rawPayload: text, sourceIp });
        return;
      }
    }

    // Format Q <addr> <state>
    if (text.toUpperCase().startsWith('Q ') || text.toUpperCase().startsWith('Q:')) {
      const parts = text.replace(':', ' ').split(/\s+/);
      if (parts.length >= 3) {
        const address = parseInt(parts[1], 10);
        const state = parts[2] === '1' || parts[2].toLowerCase() === 'true';
        this.recordNodeActivity(sourceIp, undefined, undefined, state, text);
        this.callbacks.onSensorTriggered({ address, state, rawPayload: text, sourceIp });
        return;
      }
    }

    this.recordNodeActivity(sourceIp, 33, undefined, undefined, text);
  }

  /**
   * Führt einen aktiven Netzwerk-Scan nach ESP32 / WIO Geräten im lokalen Subnetz durch
   */
  public async scanNetwork(): Promise<DiscoveredEsp[]> {
    this.callbacks.onLog?.('[WIO] 🔍 Starte aktiven Netzwerk-Scan nach ESP32 & WIO-Geräten...', 'info');

    // 1. Lokales Subnetz ermitteln
    const ifaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(ifaces)) {
      for (const netIf of ifaces[name] || []) {
        if (netIf.family === 'IPv4' && !netIf.internal) {
          localIp = netIf.address;
        }
      }
    }
    const subnetPrefix = localIp.substring(0, localIp.lastIndexOf('.'));

    // 2. ARP-Tabelle auslesen
    const arpMap = new Map<string, string>();
    try {
      const arpOutput = execSync('arp -a', { encoding: 'utf-8', timeout: 3000 });
      for (const line of arpOutput.split('\n')) {
        const match = line.trim().match(/^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]+)\s+(\w+)/);
        if (match) {
          const ip = match[1];
          const mac = match[2].toLowerCase();
          if (ip.startsWith(subnetPrefix) && ip !== localIp && !ip.endsWith('.255')) {
            arpMap.set(ip, mac);
          }
        }
      }
    } catch (e: any) {
      this.callbacks.onLog?.(`[WIO] Warnung beim Auslesen der ARP-Tabelle: ${e.message}`, 'warn');
    }

    // 3. WIO UDP Discovery Broadcast senden
    if (this.udpSocket && this.isListening) {
      try {
        const discoveryMsg = Buffer.from('<query unit="0"/>', 'utf-8');
        this.udpSocket.send(discoveryMsg, 0, discoveryMsg.length, this.port, `${subnetPrefix}.255`);
      } catch {}
    }

    // 4. Bekannte ESP32 MAC OUI-Präfixe (Espressif Inc.)
    const isEspressifMac = (mac: string): boolean => {
      const cleanMac = mac.replace(/[:-]/g, '').toLowerCase();
      const espPrefixes = [
        '1cc3ab', '240ac4', '2462ab', '246f28', '24d7eb', '24dcc3',
        '2c3ae8', '2cf432', '30aea4', '3c6105', '3c71bf', '4022d8',
        '409151', '4827e2', '483fda', '485519', '4c11ae', '4c7525',
        '500291', '5443b2', '545aa6', '58bf25', '600194', '6055f9',
        '68b6b3', '68c63a', '70039f', '70b8f6', '782184', '7c87ce',
        '7c9ebd', '7c9eaf', '7cdfa1', '807d3a', '840d8e', '84cca8',
        '84f703', '8c4b14', '8caab5', '8cce4e', '9097d5', '943cc6',
        '94b555', '94b97e', '98cdac', '98f4ab', 'a020a6', 'a0764e',
        'a47b9d', 'a4cf12', 'a4e57c', 'a842e3', 'a848fa', 'ac67b2',
        'b0a732', 'b4e62d', 'bcddc2', 'c049ef', 'c44f33', 'c4dd57',
        'c82e18', 'c8c9a3', 'cc50e3', 'd8a01d', 'd8bc38', 'dc4f22',
        'dc5475', 'e09806', 'e831cd', 'e868e7', 'e89f6d', 'e8db84',
        'ec6260', 'ec64c9', 'f008d1', 'f4cfa2'
      ];
      return espPrefixes.some((p) => cleanMac.startsWith(p));
    };

    // 5. Parallel auf Port 80 abfragen (ausschließlich echte, validierte IP-Adressen)
    const candidates = Array.from(arpMap.keys()).filter((ip) => ip !== localIp && ip !== '127.0.0.1' && Boolean(net.isIP(ip)));
    // Stelle sicher, dass bereits verbundene echte Nodes in der Liste sind
    for (const node of this.discoveredNodes.values()) {
      if (node.ip !== localIp && node.ip !== '127.0.0.1' && Boolean(net.isIP(node.ip)) && !candidates.includes(node.ip)) {
        candidates.push(node.ip);
      }
    }

    const discovered: DiscoveredEsp[] = [];

    const probePromises = candidates.map(async (ip) => {
      const mac = arpMap.get(ip) || '';
      const isEspMac = isEspressifMac(mac);

      let title = '';
      let isHttpOpen = false;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 900);
        const res = await fetch(`http://${ip}/`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok || res.status === 200 || res.status === 401) {
          isHttpOpen = true;
          const html = await res.text().catch(() => '');
          const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (match) {
            title = match[1].trim();
          }
        }
      } catch {}

      const hasTcpConnected = this.tcpClients.has(ip);
      const isWio =
        title.toLowerCase().includes('wio') ||
        title.toLowerCase().includes('rocrail') ||
        hasTcpConnected ||
        Array.from(this.discoveredNodes.values()).some((n) => n.ip === ip);

      const isEsp = isEspMac || isWio || title.toLowerCase().includes('esp');

      if (isEsp || isWio) {
        // Ermittle Name und Unit
        let unit: number | undefined = undefined;
        let name = 'ESP32 Device';

        // Aus Titel oder XML-Attributen
        const unitMatch = title.match(/WIO(\d+)/i);
        if (unitMatch) {
          unit = parseInt(unitMatch[1], 10);
        }

        // Falls wir den Node schon in discoveredNodes haben
        for (const n of this.discoveredNodes.values()) {
          if (n.ip === ip) {
            unit = n.unit;
            if (n.name) name = n.name;
          }
        }

        if (title.includes('ESP32Sig')) name = 'ESP32Sig';

        discovered.push({
          ip,
          mac: mac || undefined,
          name: name || `WIO-${unit || 'ESP'}`,
          title: title || (isWio ? `Rocrail WIO${unit || 33}` : 'ESP32 Device'),
          isWio,
          unit,
          webUrl: `http://${ip}/`,
          tcpConnected: hasTcpConnected,
          status: hasTcpConnected ? 'CONNECTED' : isHttpOpen ? 'ONLINE' : 'DISCOVERED'
        });
      }
    });

    await Promise.allSettled(probePromises);

    // Sortiere: Verbundene und WIO-Geräte zuerst
    discovered.sort((a, b) => {
      if (a.tcpConnected && !b.tcpConnected) return -1;
      if (!a.tcpConnected && b.tcpConnected) return 1;
      if (a.isWio && !b.isWio) return -1;
      if (!a.isWio && b.isWio) return 1;
      return a.ip.localeCompare(b.ip);
    });

    this.lastScanResults = discovered;
    this.callbacks.onLog?.(
      `[WIO] 🏁 Scan abgeschlossen: ${discovered.length} ESP-Gerät(e) gefunden.`,
      'info'
    );

    return discovered;
  }
}
