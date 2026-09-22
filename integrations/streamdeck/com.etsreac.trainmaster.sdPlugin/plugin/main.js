// TrainMaster Elgato Stream Deck Plugin
// Full bi-directional WebSocket client for TrainMaster Command Station

let sdSocket = null;
let tmSocket = null;
let pluginUUID = null;

// Registry of visible keys on the Stream Deck: Map<context, { action, settings }>
const visibleKeys = new Map();

// Local TrainMaster State Cache
const tmState = {
  connected: false,
  trackPower: false,
  emergencyStop: false,
  automaticMode: false,
  locos: [],
  activeLocoId: null,
  turnouts: [],
  signals: [],
  sensors: [],
  blocks: [],
  layout: [],
  viewport: { cameraX: 0, cameraY: 0 }
};

// ==============================================================================
// 1. ELGATO STREAM DECK WEBSOCKET CONNECTION
// ==============================================================================

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo, inActionInfo) {
  pluginUUID = inPluginUUID;
  sdSocket = new WebSocket(`ws://127.0.0.1:${inPort}`);

  sdSocket.onopen = function () {
    const registerJson = {
      event: inRegisterEvent,
      uuid: inPluginUUID
    };
    sdSocket.send(JSON.stringify(registerJson));
    console.log("[StreamDeck] Registered successfully with Stream Deck host");

    // Connect to TrainMaster backend
    connectTrainMaster();
  };

  sdSocket.onmessage = function (evt) {
    try {
      const data = JSON.parse(evt.data);
      handleStreamDeckEvent(data);
    } catch (e) {
      console.error("[StreamDeck] Error parsing message:", e);
    }
  };

  sdSocket.onclose = function () {
    console.log("[StreamDeck] Stream Deck connection closed");
  };
}

function handleStreamDeckEvent(msg) {
  const event = msg.event;
  const context = msg.context;
  const action = msg.action;
  const payload = msg.payload || {};

  switch (event) {
    case "willAppear":
      visibleKeys.set(context, {
        action: action,
        settings: payload.settings || {},
        coordinates: payload.coordinates || { column: 0, row: 0 }
      });
      updateKey(context);
      break;

    case "willDisappear":
      visibleKeys.delete(context);
      break;

    case "didReceiveSettings":
      if (visibleKeys.has(context)) {
        const item = visibleKeys.get(context);
        item.settings = payload.settings || {};
        if (payload.coordinates) item.coordinates = payload.coordinates;
        updateKey(context);
      }
      break;

    case "keyDown":
      handleKeyDown(context, action, payload.settings || {});
      break;
  }
}

function sendToStreamDeck(event, context, payload = {}) {
  if (sdSocket && sdSocket.readyState === WebSocket.OPEN) {
    sdSocket.send(JSON.stringify({ event, context, payload }));
  }
}

function setKeyTitle(context, title) {
  sendToStreamDeck("setTitle", context, { title, target: 0 });
}

function setKeyImage(context, dataUrl) {
  sendToStreamDeck("setImage", context, { image: dataUrl, target: 0 });
}

// ==============================================================================
// 2. TRAINMASTER BACKEND WEBSOCKET CONNECTION
// ==============================================================================

function connectTrainMaster() {
  if (tmSocket) {
    try { tmSocket.close(); } catch (_) {}
  }

  console.log("[TrainMaster] Connecting to ws://localhost:3001 ...");
  tmSocket = new WebSocket("ws://localhost:3001");

  tmSocket.onopen = function () {
    console.log("[TrainMaster] Connected to TrainMaster backend!");
    tmState.connected = true;
    updateAllKeys();
  };

  tmSocket.onmessage = function (evt) {
    try {
      const msg = JSON.parse(evt.data);
      handleTrainMasterMessage(msg);
    } catch (e) {
      console.error("[TrainMaster] Parse error:", e);
    }
  };

  tmSocket.onclose = function () {
    console.log("[TrainMaster] Disconnected. Reconnecting in 3 seconds...");
    tmState.connected = false;
    updateAllKeys();
    setTimeout(connectTrainMaster, 3000);
  };

  tmSocket.onerror = function () {
    try { tmSocket.close(); } catch (_) {}
  };
}

function sendToTrainMaster(type, payload = {}) {
  if (tmSocket && tmSocket.readyState === WebSocket.OPEN) {
    tmSocket.send(JSON.stringify({ type, payload }));
  }
}

function handleTrainMasterMessage(msg) {
  switch (msg.type) {
    // Initialer Zustand beim Verbinden
    case "INITIAL_STATE":
    case "SYNC_STATE":
      if (msg.payload) {
        if (msg.payload.status) {
          tmState.trackPower = !!msg.payload.status.trackPower;
          tmState.emergencyStop = !!msg.payload.status.emergencyStop;
          tmState.automaticMode = !!msg.payload.status.automaticMode;
        }
        tmState.locos = msg.payload.locos || [];
        tmState.turnouts = msg.payload.turnouts || [];
        tmState.signals = msg.payload.signals || [];
        tmState.sensors = msg.payload.sensors || [];
        tmState.blocks = msg.payload.blocks || [];
        tmState.layout = msg.payload.layout || [];
        if (!tmState.activeLocoId && tmState.locos.length > 0) {
          tmState.activeLocoId = tmState.locos[0].id;
        }
      }
      updateAllKeys();
      break;

    // Status-Änderungen (Gleisstrom, Not-Aus, Automatik)
    case "STATUS_UPDATE":
      if (msg.payload) {
        if (msg.payload.trackPower !== undefined) {
          tmState.trackPower = !!msg.payload.trackPower;
        }
        if (msg.payload.emergencyStop !== undefined) {
          tmState.emergencyStop = !!msg.payload.emergencyStop;
        }
        if (msg.payload.automaticMode !== undefined) {
          tmState.automaticMode = !!msg.payload.automaticMode;
        }
      }
      updateKeysByAction("com.etsreac.trainmaster.power");
      updateKeysByAction("com.etsreac.trainmaster.estop");
      updateKeysByAction("com.etsreac.trainmaster.automode");
      break;

    // Lokomotiven-Änderungen
    case "LOCO_UPDATED":
      if (msg.payload && msg.payload.id) {
        const idx = tmState.locos.findIndex(l => l.id === msg.payload.id);
        if (idx >= 0) tmState.locos[idx] = msg.payload;
        else tmState.locos.push(msg.payload);

        if (!tmState.activeLocoId) {
          tmState.activeLocoId = msg.payload.id;
        }
      }
      updateKeysByAction("com.etsreac.trainmaster.locoselect");
      updateKeysByAction("com.etsreac.trainmaster.locodir");
      updateKeysByAction("com.etsreac.trainmaster.locofunc");
      updateKeysByAction("com.etsreac.trainmaster.speedup");
      updateKeysByAction("com.etsreac.trainmaster.speeddown");
      updateKeysByAction("com.etsreac.trainmaster.speedstop");
      updateKeysByAction("com.etsreac.trainmaster.speedpreset");
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    case "LOCO_DELETED":
      if (msg.payload && msg.payload.locoId) {
        tmState.locos = tmState.locos.filter(l => l.id !== msg.payload.locoId);
        if (tmState.activeLocoId === msg.payload.locoId) {
          tmState.activeLocoId = tmState.locos.length > 0 ? tmState.locos[0].id : null;
        }
      }
      updateAllKeys();
      break;

    // Weichen-Änderungen
    case "TURNOUT_UPDATED":
      if (msg.payload && msg.payload.id) {
        const idx = tmState.turnouts.findIndex(t => t.id === msg.payload.id);
        if (idx >= 0) tmState.turnouts[idx] = msg.payload;
        else tmState.turnouts.push(msg.payload);
      }
      updateKeysByAction("com.etsreac.trainmaster.turnout");
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    case "TURNOUT_DELETED":
      if (msg.payload && msg.payload.turnoutId) {
        tmState.turnouts = tmState.turnouts.filter(t => t.id !== msg.payload.turnoutId);
      }
      updateKeysByAction("com.etsreac.trainmaster.turnout");
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    // Gleisplan-, Signal-, Sensor- & Block-Änderungen
    case "LAYOUT_UPDATED":
      if (msg.payload) {
        tmState.layout = msg.payload.elements || msg.payload.layout || [];
      }
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    case "SIGNAL_UPDATED":
      if (msg.payload && msg.payload.id) {
        const idx = tmState.signals.findIndex(s => s.id === msg.payload.id);
        if (idx >= 0) tmState.signals[idx] = msg.payload;
        else tmState.signals.push(msg.payload);
      }
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    case "SENSOR_UPDATED":
      if (msg.payload && msg.payload.id) {
        const idx = tmState.sensors.findIndex(s => s.id === msg.payload.id);
        if (idx >= 0) tmState.sensors[idx] = msg.payload;
        else tmState.sensors.push(msg.payload);
      }
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;

    case "BLOCK_UPDATED":
      if (msg.payload && msg.payload.id) {
        const idx = tmState.blocks.findIndex(b => b.id === msg.payload.id);
        if (idx >= 0) tmState.blocks[idx] = msg.payload;
        else tmState.blocks.push(msg.payload);
      }
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;
  }
}

// ==============================================================================
// 3. KEY PRESS HANDLERS (STREAM DECK -> TRAINMASTER)
// ==============================================================================

function getActiveLoco() {
  if (tmState.locos.length === 0) return null;
  const found = tmState.locos.find(l => l.id === tmState.activeLocoId);
  return found || tmState.locos[0];
}

function handleKeyDown(context, action, settings) {
  if (!tmState.connected) {
    sendToStreamDeck("showAlert", context);
    return;
  }

  const activeLoco = getActiveLoco();

  switch (action) {
    case "com.etsreac.trainmaster.power": {
      // Optimistischer Wechsel für sofortiges Feedback
      const nextPower = !tmState.trackPower;
      tmState.trackPower = nextPower;
      updateKeysByAction("com.etsreac.trainmaster.power");
      sendToTrainMaster("SET_POWER", { active: nextPower });
      break;
    }

    case "com.etsreac.trainmaster.estop": {
      const nextStop = !tmState.emergencyStop;
      tmState.emergencyStop = nextStop;
      updateKeysByAction("com.etsreac.trainmaster.estop");
      if (nextStop) {
        sendToTrainMaster("EMERGENCY_STOP");
      } else {
        sendToTrainMaster("RESUME_STOP");
      }
      break;
    }

    case "com.etsreac.trainmaster.automode": {
      const nextAuto = !tmState.automaticMode;
      tmState.automaticMode = nextAuto;
      updateKeysByAction("com.etsreac.trainmaster.automode");
      sendToTrainMaster("TOGGLE_AUTOMATIC_MODE", { active: nextAuto });
      break;
    }

    case "com.etsreac.trainmaster.locoselect": {
      if (settings.locoId) {
        tmState.activeLocoId = settings.locoId;
      } else if (tmState.locos.length > 0) {
        // Durch alle Loks durchwechseln
        const curIdx = tmState.locos.findIndex(l => l.id === tmState.activeLocoId);
        const nextIdx = (curIdx + 1) % tmState.locos.length;
        tmState.activeLocoId = tmState.locos[nextIdx].id;
      }
      updateAllKeys();
      break;
    }

    case "com.etsreac.trainmaster.locodir": {
      if (activeLoco) {
        const newDir = activeLoco.direction === "FWD" ? "REV" : "FWD";
        activeLoco.direction = newDir;
        updateKeysByAction("com.etsreac.trainmaster.locodir");
        updateKeysByAction("com.etsreac.trainmaster.locoselect");
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: activeLoco.speed,
          direction: newDir
        });
      }
      break;
    }

    case "com.etsreac.trainmaster.locofunc": {
      if (activeLoco) {
        const funcIdx = parseInt(settings.funcIndex !== undefined ? settings.funcIndex : 0, 10);
        activeLoco.functions = activeLoco.functions || {};
        const cur = !!activeLoco.functions[funcIdx];
        activeLoco.functions[funcIdx] = !cur;
        updateKeysByAction("com.etsreac.trainmaster.locofunc");
        sendToTrainMaster("SET_LOCO_FUNCTION", {
          locoId: activeLoco.id,
          functionIndex: funcIdx,
          active: !cur
        });
      }
      break;
    }

    case "com.etsreac.trainmaster.turnout": {
      if (settings.turnoutId) {
        const t = tmState.turnouts.find(item => item.id === settings.turnoutId);
        const isCurrentStraight = !t || t.state === "STRAIGHT";
        const newState = isCurrentStraight ? "DIVERGENT" : "STRAIGHT";
        if (t) t.state = newState;
        updateKeysByAction("com.etsreac.trainmaster.turnout");
        updateKeysByAction("com.etsreac.trainmaster.tracktile");
        sendToTrainMaster("SET_TURNOUT", {
          turnoutId: settings.turnoutId,
          state: newState
        });
      }
      break;
    }

    case "com.etsreac.trainmaster.speedup": {
      if (activeLoco) {
        const step = parseInt(settings.step !== undefined ? settings.step : 5, 10);
        const curSpeed = activeLoco.speed || 0;
        const newSpeed = Math.min(128, curSpeed + step);
        activeLoco.speed = newSpeed;
        updateKeysByAction("com.etsreac.trainmaster.speedup");
        updateKeysByAction("com.etsreac.trainmaster.speeddown");
        updateKeysByAction("com.etsreac.trainmaster.speedstop");
        updateKeysByAction("com.etsreac.trainmaster.speedpreset");
        updateKeysByAction("com.etsreac.trainmaster.locoselect");
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: newSpeed,
          direction: activeLoco.direction || "FWD"
        });
      } else {
        sendToStreamDeck("showAlert", context);
      }
      break;
    }

    case "com.etsreac.trainmaster.speeddown": {
      if (activeLoco) {
        const step = parseInt(settings.step !== undefined ? settings.step : 5, 10);
        const curSpeed = activeLoco.speed || 0;
        const newSpeed = Math.max(0, curSpeed - step);
        activeLoco.speed = newSpeed;
        updateKeysByAction("com.etsreac.trainmaster.speedup");
        updateKeysByAction("com.etsreac.trainmaster.speeddown");
        updateKeysByAction("com.etsreac.trainmaster.speedstop");
        updateKeysByAction("com.etsreac.trainmaster.speedpreset");
        updateKeysByAction("com.etsreac.trainmaster.locoselect");
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: newSpeed,
          direction: activeLoco.direction || "FWD"
        });
      } else {
        sendToStreamDeck("showAlert", context);
      }
      break;
    }

    case "com.etsreac.trainmaster.speedstop": {
      if (activeLoco) {
        activeLoco.speed = 0;
        updateKeysByAction("com.etsreac.trainmaster.speedup");
        updateKeysByAction("com.etsreac.trainmaster.speeddown");
        updateKeysByAction("com.etsreac.trainmaster.speedstop");
        updateKeysByAction("com.etsreac.trainmaster.speedpreset");
        updateKeysByAction("com.etsreac.trainmaster.locoselect");
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: 0,
          direction: activeLoco.direction || "FWD"
        });
      } else {
        sendToStreamDeck("showAlert", context);
      }
      break;
    }

    case "com.etsreac.trainmaster.speedpreset": {
      if (activeLoco) {
        const presetKey = settings.preset || "vmid";
        let targetSpeed = 60;
        if (presetKey === "vmin") {
          targetSpeed = activeLoco.vMin || 20;
        } else if (presetKey === "vmid") {
          targetSpeed = activeLoco.vMid || 60;
        } else if (presetKey === "vmax") {
          targetSpeed = activeLoco.vMax || 100;
        } else {
          targetSpeed = parseInt(presetKey, 10);
          if (isNaN(targetSpeed)) targetSpeed = 60;
        }
        targetSpeed = Math.max(0, Math.min(128, targetSpeed));
        activeLoco.speed = targetSpeed;
        updateKeysByAction("com.etsreac.trainmaster.speedup");
        updateKeysByAction("com.etsreac.trainmaster.speeddown");
        updateKeysByAction("com.etsreac.trainmaster.speedstop");
        updateKeysByAction("com.etsreac.trainmaster.speedpreset");
        updateKeysByAction("com.etsreac.trainmaster.locoselect");
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: targetSpeed,
          direction: activeLoco.direction || "FWD"
        });
      } else {
        sendToStreamDeck("showAlert", context);
      }
      break;
    }

    case "com.etsreac.trainmaster.tracknav": {
      const keyData = visibleKeys.get(context) || { settings, coordinates: { column: 0, row: 0 } };
      const dir = getNavDirection(keyData);
      const step = parseInt(settings.step, 10) || 1;

      switch (dir) {
        case "UP":
          tmState.viewport.cameraY = Math.max(0, tmState.viewport.cameraY - step);
          break;
        case "DOWN":
          tmState.viewport.cameraY += step;
          break;
        case "LEFT":
          tmState.viewport.cameraX = Math.max(0, tmState.viewport.cameraX - step);
          break;
        case "RIGHT":
          tmState.viewport.cameraX += step;
          break;
        case "HOME":
          tmState.viewport.cameraX = 0;
          tmState.viewport.cameraY = 0;
          break;
      }
      updateKeysByAction("com.etsreac.trainmaster.tracknav");
      updateKeysByAction("com.etsreac.trainmaster.tracktile");
      break;
    }

    case "com.etsreac.trainmaster.tracktile": {
      const keyData = visibleKeys.get(context) || { settings, coordinates: { column: 0, row: 0 } };
      const worldPos = getTileWorldCoordinates(keyData);
      const elem = tmState.layout.find(e => e.x === worldPos.x && e.y === worldPos.y);
      if (!elem) {
        sendToStreamDeck("showAlert", context);
        break;
      }

      if (elem.type === "TURNOUT_LEFT" || elem.type === "TURNOUT_RIGHT" || elem.type === "TURNOUT") {
        const t = tmState.turnouts.find(item => item.id === elem.linkedId || item.id === elem.id);
        if (t) {
          const isCurrentStraight = t.state === "STRAIGHT";
          const newState = isCurrentStraight ? "DIVERGENT" : "STRAIGHT";
          t.state = newState;
          updateKeysByAction("com.etsreac.trainmaster.turnout");
          updateKeysByAction("com.etsreac.trainmaster.tracktile");
          sendToTrainMaster("SET_TURNOUT", {
            turnoutId: t.id,
            state: newState
          });
        }
      } else if (elem.type === "SIGNAL") {
        const s = tmState.signals.find(item => item.id === elem.linkedId || item.id === elem.id);
        if (s) {
          let aspects = ["HP0", "HP1", "HP2"];
          if (s.kind === "BLOCK") {
            aspects = ["HP0", "HP1"];
          } else if (s.kind === "SHUNTING") {
            aspects = ["SH0", "SH1"];
          }
          const curIdx = aspects.indexOf(s.aspect);
          const nextAspect = curIdx >= 0 ? aspects[(curIdx + 1) % aspects.length] : aspects[0];
          s.aspect = nextAspect;
          updateKeysByAction("com.etsreac.trainmaster.tracktile");
          sendToTrainMaster("SET_SIGNAL", {
            signalId: s.id,
            aspect: nextAspect
          });
        }
      } else if (elem.type === "SENSOR") {
        const sensor = tmState.sensors.find(item => item.id === elem.linkedId || item.id === elem.id);
        if (sensor) {
          const nextActive = !sensor.active;
          sensor.active = nextActive;
          updateKeysByAction("com.etsreac.trainmaster.tracktile");
          sendToTrainMaster("TRIGGER_SENSOR", {
            sensorId: sensor.id,
            state: nextActive,
            active: nextActive
          });
        }
      } else if (elem.type === "BLOCK") {
        const b = tmState.blocks.find(item => item.id === elem.linkedId || item.id === elem.id);
        if (b && b.currentLocoId) {
          tmState.activeLocoId = b.currentLocoId;
          updateAllKeys();
        }
      }
      break;
    }
  }
}

// ==============================================================================
// 4. DYNAMIC KEY RENDERING & SVG ICON GENERATION
// ==============================================================================

function updateAllKeys() {
  for (const [context] of visibleKeys) {
    updateKey(context);
  }
}

function updateKeysByAction(targetAction) {
  for (const [context, data] of visibleKeys) {
    if (data.action === targetAction) {
      updateKey(context);
    }
  }
}

function updateKey(context) {
  const data = visibleKeys.get(context);
  if (!data) return;

  const action = data.action;
  const settings = data.settings || {};
  const activeLoco = getActiveLoco();

  switch (action) {
    case "com.etsreac.trainmaster.power": {
      const on = tmState.trackPower;
      const title = on ? "STROM\nAN" : "STROM\nAUS";
      const bg = on ? "#15803d" : "#334155";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, on ? "#fde047" : "#94a3b8", "⚡"));
      break;
    }

    case "com.etsreac.trainmaster.estop": {
      const active = tmState.emergencyStop;
      const title = active ? "HALT\nAKTIV!" : "NOT-AUS";
      const bg = active ? "#dc2626" : "#7f1d1d";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#ffffff", "🛑"));
      break;
    }

    case "com.etsreac.trainmaster.automode": {
      const on = tmState.automaticMode;
      const title = on ? "AUTO\nAKTIV" : "AUTO\nAUS";
      const bg = on ? "#4338ca" : "#334155";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, on ? "#a5b4fc" : "#94a3b8", "🤖"));
      break;
    }

    case "com.etsreac.trainmaster.locoselect": {
      const targetLoco = settings.locoId 
        ? tmState.locos.find(l => l.id === settings.locoId) 
        : activeLoco;

      if (!targetLoco) {
        setKeyTitle(context, "Keine Lok\nim Depot");
        setKeyImage(context, createSvgIcon("#1e293b", "#64748b", "🚂"));
        return;
      }

      const isSelected = activeLoco && activeLoco.id === targetLoco.id;
      const dirArrow = targetLoco.direction === "FWD" ? "▲" : "▼";
      const title = `${targetLoco.name}\n${dirArrow} ${targetLoco.speed}\n#${targetLoco.dccAddress}`;
      const bg = isSelected ? "#1d4ed8" : "#1e293b";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, isSelected ? "#93c5fd" : "#94a3b8", "🚂", isSelected));
      break;
    }

    case "com.etsreac.trainmaster.locodir": {
      const dir = activeLoco ? activeLoco.direction : "FWD";
      const title = dir === "FWD" ? "▲ VOR" : "▼ ZURÜCK";
      const bg = dir === "FWD" ? "#1e40af" : "#9a3412";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#ffffff", dir === "FWD" ? "▲" : "▼"));
      break;
    }

    case "com.etsreac.trainmaster.locofunc": {
      const funcIdx = parseInt(settings.funcIndex !== undefined ? settings.funcIndex : 0, 10);
      const funcName = settings.funcName || (funcIdx === 0 ? "Licht" : funcIdx === 1 ? "Sound" : funcIdx === 2 ? "Horn" : `F${funcIdx}`);
      const on = !!activeLoco?.functions?.[funcIdx];
      const title = `F${funcIdx}: ${funcName}\n[${on ? "AN" : "AUS"}]`;
      const bg = on ? "#b45309" : "#334155";
      const symbol = funcIdx === 0 ? "💡" : funcIdx === 1 ? "🔊" : funcIdx === 2 ? "📢" : "⚡";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, on ? "#fde047" : "#94a3b8", symbol));
      break;
    }

    case "com.etsreac.trainmaster.turnout": {
      const t = tmState.turnouts.find(item => item.id === settings.turnoutId);
      const name = t ? (t.name || t.id) : (settings.turnoutId || "Weiche");
      const state = t ? t.state : "STRAIGHT";
      const title = `${name}\n[${state === "STRAIGHT" ? "Gerade" : "Abzweig"}]`;
      const bg = state === "STRAIGHT" ? "#334155" : "#7c2d12";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#ffffff", "🔀"));
      break;
    }

    case "com.etsreac.trainmaster.speedup": {
      const step = parseInt(settings.step !== undefined ? settings.step : 5, 10);
      const curSpeed = activeLoco ? (activeLoco.speed || 0) : 0;
      const title = `+${step}\n[${curSpeed}]`;
      const bg = "#065f46";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#34d399", "➕"));
      break;
    }

    case "com.etsreac.trainmaster.speeddown": {
      const step = parseInt(settings.step !== undefined ? settings.step : 5, 10);
      const curSpeed = activeLoco ? (activeLoco.speed || 0) : 0;
      const title = `-${step}\n[${curSpeed}]`;
      const bg = "#831843";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#f472b6", "➖"));
      break;
    }

    case "com.etsreac.trainmaster.speedstop": {
      const curSpeed = activeLoco ? (activeLoco.speed || 0) : 0;
      const isStopped = curSpeed === 0;
      const title = isStopped ? "HALT\n[0]" : `STOPP!\n[${curSpeed}]`;
      const bg = isStopped ? "#334155" : "#dc2626";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, isStopped ? "#94a3b8" : "#ffffff", "⏹️"));
      break;
    }

    case "com.etsreac.trainmaster.speedpreset": {
      const presetKey = settings.preset || "vmid";
      let presetLabel = "vMid";
      let targetVal = 60;
      if (activeLoco) {
        if (presetKey === "vmin") {
          presetLabel = "vMin";
          targetVal = activeLoco.vMin || 20;
        } else if (presetKey === "vmid") {
          presetLabel = "vMid";
          targetVal = activeLoco.vMid || 60;
        } else if (presetKey === "vmax") {
          presetLabel = "vMax";
          targetVal = activeLoco.vMax || 100;
        } else {
          targetVal = parseInt(presetKey, 10) || 60;
          presetLabel = `v${targetVal}`;
        }
      } else {
        presetLabel = presetKey.toUpperCase();
      }
      const curSpeed = activeLoco ? (activeLoco.speed || 0) : 0;
      const isAtPreset = curSpeed === targetVal;
      const title = `${presetLabel} (${targetVal})\n[${curSpeed}]`;
      const bg = isAtPreset ? "#1d4ed8" : "#1e293b";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, isAtPreset ? "#60a5fa" : "#38bdf8", "🚀", isAtPreset));
      break;
    }

    case "com.etsreac.trainmaster.tracknav": {
      const dir = getNavDirection(data);
      const iconData = createTrackNavSvg(dir, tmState.viewport.cameraX, tmState.viewport.cameraY);
      setKeyTitle(context, "");
      setKeyImage(context, iconData);
      break;
    }

    case "com.etsreac.trainmaster.tracktile": {
      const worldPos = getTileWorldCoordinates(data);
      const tileData = createTrackTileSvg(worldPos.x, worldPos.y);
      setKeyTitle(context, "");
      setKeyImage(context, tileData);
      break;
    }
  }
}

function getNavDirection(keyData) {
  const settings = keyData.settings || {};
  if (settings.direction && settings.direction !== "AUTO") {
    return settings.direction;
  }
  const row = keyData.coordinates ? keyData.coordinates.row : 0;
  switch (row) {
    case 0: return "UP";
    case 1: return "DOWN";
    case 2: return "LEFT";
    case 3: return "RIGHT";
    default: return "HOME";
  }
}

function getTileWorldCoordinates(keyData) {
  const coords = keyData.coordinates || { column: 0, row: 0 };
  const settings = keyData.settings || {};

  if (settings.manualX !== undefined && settings.manualY !== undefined) {
    return { x: parseInt(settings.manualX, 10), y: parseInt(settings.manualY, 10) };
  }

  // Prüfen, ob Spalte 0 als Navigationsspalte genutzt wird
  let navAtCol0 = false;
  for (const [_, k] of visibleKeys) {
    if (k.action === "com.etsreac.trainmaster.tracknav" && k.coordinates && k.coordinates.column === 0) {
      navAtCol0 = true;
      break;
    }
  }

  const startCol = navAtCol0 ? 1 : 0;
  const colOffset = Math.max(0, coords.column - startCol);
  const rowOffset = coords.row || 0;

  const worldX = (tmState.viewport.cameraX || 0) + colOffset;
  const worldY = (tmState.viewport.cameraY || 0) + rowOffset;
  return { x: worldX, y: worldY };
}

function createTrackNavSvg(dir, cameraX, cameraY) {
  let arrow = "▲";
  let label = "HOCH";
  let coordText = `Y: ${cameraY}`;
  let arrowY = 54;

  switch (dir) {
    case "UP":
      arrow = "▲";
      label = "HOCH";
      coordText = `Y: ${cameraY}`;
      break;
    case "DOWN":
      arrow = "▼";
      label = "RUNTER";
      coordText = `Y: ${cameraY}`;
      break;
    case "LEFT":
      arrow = "◀";
      label = "LINKS";
      coordText = `X: ${cameraX}`;
      break;
    case "RIGHT":
      arrow = "▶";
      label = "RECHTS";
      coordText = `[${cameraX},${cameraY}]`;
      break;
    case "HOME":
      arrow = "🏠";
      label = "HOME";
      coordText = "[0,0]";
      break;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect x="3" y="3" width="138" height="138" rx="24" fill="#161b22" stroke="#388bfd" stroke-width="4"/>
      <text x="72" y="${arrowY}" font-size="44" fill="#58a6ff" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${arrow}</text>
      <text x="72" y="98" font-size="18" font-weight="bold" fill="#ffffff" font-family="sans-serif" text-anchor="middle">${label}</text>
      <text x="72" y="122" font-size="13" font-weight="bold" fill="#8b949e" font-family="monospace" text-anchor="middle">${coordText}</text>
    </svg>
  `.trim();

  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

function createTrackTileSvg(worldX, worldY) {
  const elem = tmState.layout.find(e => e.x === worldX && e.y === worldY);

  if (!elem) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" rx="20" fill="#0b0e14"/>
        <line x1="68" y1="72" x2="76" y2="72" stroke="#21262d" stroke-width="2"/>
        <line x1="72" y1="68" x2="72" y2="76" stroke="#21262d" stroke-width="2"/>
        <text x="12" y="24" font-size="14" fill="#21262d" font-family="monospace" font-weight="bold">${worldX},${worldY}</text>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
  }

  const rot = elem.rotation || 0;
  let trackBody = "";
  let badgeSvg = "";

  switch (elem.type) {
    case "STRAIGHT": {
      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-54" y1="-18" x2="-54" y2="18" stroke="#30363d" stroke-width="4"/>
        <line x1="-27" y1="-18" x2="-27" y2="18" stroke="#30363d" stroke-width="4"/>
        <line x1="0" y1="-18" x2="0" y2="18" stroke="#30363d" stroke-width="4"/>
        <line x1="27" y1="-18" x2="27" y2="18" stroke="#30363d" stroke-width="4"/>
        <line x1="54" y1="-18" x2="54" y2="18" stroke="#30363d" stroke-width="4"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
      `;
      break;
    }

    case "CURVE": {
      trackBody = `
        <path d="M -72 0 A 72 72 0 0 1 0 72" fill="none" stroke="#161b22" stroke-width="44"/>
        <path d="M -72 -10 A 82 82 0 0 1 10 72" fill="none" stroke="#8b949e" stroke-width="5"/>
        <path d="M -72 10 A 62 62 0 0 1 -10 72" fill="none" stroke="#8b949e" stroke-width="5"/>
      `;
      break;
    }

    case "TURNOUT_LEFT":
    case "TURNOUT_RIGHT":
    case "TURNOUT": {
      const t = tmState.turnouts.find(item => item.id === elem.linkedId || item.id === elem.id);
      const isStraight = !t || t.state === "STRAIGHT";
      const isLeft = elem.type === "TURNOUT_LEFT";

      const strStroke = isStraight ? "#388bfd" : "#484f58";
      const strW = isStraight ? "7" : "4";
      const crvStroke = isStraight ? "#484f58" : "#2ea043";
      const crvW = isStraight ? "4" : "7";

      const crvPath1 = isLeft ? "M -72 -10 A 62 62 0 0 0 -10 -72" : "M -72 -10 A 82 82 0 0 1 10 72";
      const crvPath2 = isLeft ? "M -72 10 A 82 82 0 0 0 10 -72" : "M -72 10 A 62 62 0 0 1 -10 72";

      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="${strStroke}" stroke-width="${strW}"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="${strStroke}" stroke-width="${strW}"/>
        <path d="${crvPath1}" fill="none" stroke="${crvStroke}" stroke-width="${crvW}"/>
        <path d="${crvPath2}" fill="none" stroke="${crvStroke}" stroke-width="${crvW}"/>
      `;

      const tName = t ? (t.name || t.id) : "W";
      const stateLabel = isStraight ? "GERADE" : "ABZWEIG";
      const pillBg = isStraight ? "rgba(56,139,253,0.3)" : "rgba(46,160,67,0.35)";
      const pillBorder = isStraight ? "#388bfd" : "#2ea043";

      badgeSvg = `
        <rect x="8" y="106" width="128" height="28" rx="6" fill="${pillBg}" stroke="${pillBorder}" stroke-width="1.5"/>
        <text x="72" y="124" font-size="12" fill="#ffffff" font-family="sans-serif" font-weight="bold" text-anchor="middle">${tName} • ${stateLabel}</text>
      `;
      break;
    }

    case "SIGNAL": {
      const sig = tmState.signals.find(s => s.id === elem.linkedId || s.id === elem.id);
      const aspect = sig ? sig.aspect : "HP0";
      let lampColor = "#f85149";
      let lampText = "HP0";
      if (aspect === "HP1") { lampColor = "#2ea043"; lampText = "HP1"; }
      else if (aspect === "HP2") { lampColor = "#d29922"; lampText = "HP2"; }
      else if (aspect === "SH1") { lampColor = "#f0f6fc"; lampText = "SH1"; }

      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
        <line x1="0" y1="-10" x2="0" y2="-32" stroke="#8b949e" stroke-width="4"/>
        <circle cx="0" cy="-36" r="14" fill="${lampColor}" stroke="#ffffff" stroke-width="3"/>
      `;

      badgeSvg = `
        <rect x="12" y="106" width="120" height="26" rx="6" fill="rgba(0,0,0,0.6)" stroke="${lampColor}" stroke-width="2"/>
        <text x="72" y="123" font-size="12" fill="#ffffff" font-family="sans-serif" font-weight="bold" text-anchor="middle">${sig?.name || 'Sig'}: ${lampText}</text>
      `;
      break;
    }

    case "SENSOR": {
      const s = tmState.sensors.find(item => item.id === elem.linkedId || item.id === elem.id);
      const isActive = !!(s && s.active);
      const sensorColor = isActive ? "#f85149" : "#30363d";
      const sensorBorder = isActive ? "#ffffff" : "#8b949e";

      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="#8b949e" stroke-width="5" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="${isActive ? '15' : '9'}" fill="${sensorColor}" stroke="${sensorBorder}" stroke-width="3"/>
      `;

      badgeSvg = `
        <rect x="10" y="106" width="124" height="26" rx="6" fill="${isActive ? 'rgba(248,81,73,0.3)' : 'rgba(0,0,0,0.5)'}" stroke="${isActive ? '#f85149' : '#484f58'}" stroke-width="1.5"/>
        <text x="72" y="123" font-size="12" fill="#ffffff" font-family="sans-serif" font-weight="bold" text-anchor="middle">${s?.name || 'Sensor'} ${isActive ? '🔴 BELEGT' : '⚪ FREI'}</text>
      `;
      break;
    }

    case "BLOCK": {
      const b = tmState.blocks.find(item => item.id === elem.linkedId || item.id === elem.id);
      const bState = b ? b.state : "FREE";
      const loco = b && b.currentLocoId ? tmState.locos.find(l => l.id === b.currentLocoId) : null;

      let bFill = "#161b22";
      let bStroke = "#388bfd";
      let bRail = "#8b949e";
      if (bState === "OCCUPIED") {
        bFill = "#450a0a";
        bStroke = "#ef4444";
        bRail = "#f85149";
      } else if (bState === "RESERVED") {
        bFill = "#422006";
        bStroke = "#f59e0b";
        bRail = "#fbbf24";
      } else if (bState === "GHOST") {
        bFill = "#7f1d1d";
        bStroke = "#dc2626";
        bRail = "#ef4444";
      }

      trackBody = `
        <rect x="-72" y="-24" width="144" height="48" rx="6" fill="${bFill}" stroke="${bStroke}" stroke-width="2.5"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="${bRail}" stroke-width="6"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="${bRail}" stroke-width="6"/>
      `;

      const label = loco ? `🚂 ${loco.name}` : (b ? b.name : "Block");
      badgeSvg = `
        <rect x="6" y="104" width="132" height="30" rx="6" fill="${bFill}" stroke="${bStroke}" stroke-width="2"/>
        <text x="72" y="123" font-size="13" fill="#ffffff" font-family="sans-serif" font-weight="bold" text-anchor="middle">${label}</text>
      `;
      break;
    }

    case "CROSSING": {
      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <rect x="-22" y="-72" width="44" height="144" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="#8b949e" stroke-width="5"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="#8b949e" stroke-width="5"/>
        <line x1="-10" y1="-72" x2="-10" y2="72" stroke="#8b949e" stroke-width="5"/>
        <line x1="10" y1="-72" x2="10" y2="72" stroke="#8b949e" stroke-width="5"/>
      `;
      break;
    }

    case "BUFFER": {
      trackBody = `
        <rect x="-72" y="-22" width="90" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="0" y2="-10" stroke="#8b949e" stroke-width="5"/>
        <line x1="-72" y1="10" x2="0" y2="10" stroke="#8b949e" stroke-width="5"/>
        <rect x="-4" y="-22" width="10" height="44" rx="2" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
      `;
      break;
    }

    default: {
      trackBody = `
        <rect x="-72" y="-22" width="144" height="44" rx="4" fill="#161b22" stroke="#21262d" stroke-width="2"/>
        <line x1="-72" y1="-10" x2="72" y2="-10" stroke="#8b949e" stroke-width="5"/>
        <line x1="-72" y1="10" x2="72" y2="10" stroke="#8b949e" stroke-width="5"/>
      `;
      break;
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect width="144" height="144" rx="20" fill="#0d1117"/>
      <g transform="translate(72, 72) rotate(${rot})">
        ${trackBody}
      </g>
      <text x="12" y="24" font-size="13" fill="#484f58" font-family="monospace">${worldX},${worldY}</text>
      ${badgeSvg}
    </svg>
  `.trim();

  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

function createSvgIcon(bgColor, fgColor, iconChar, isBordered = false) {
  const borderSvg = isBordered ? `<rect x="4" y="4" width="136" height="136" rx="24" fill="none" stroke="#60a5fa" stroke-width="8"/>` : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect x="2" y="2" width="140" height="140" rx="26" fill="${bgColor}"/>
      ${borderSvg}
      <text x="72" y="66" font-size="52" fill="${fgColor || '#ffffff'}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${iconChar}</text>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}
