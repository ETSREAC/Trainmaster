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
  turnouts: []
};

// ==============================================================================
// 1. ELGATO STREAM DECK WEBSOCKET CONNECTION
// ==============================================================================

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo, inActionInfo) {
  pluginUUID = inPluginUUID;
  sdSocket = new WebSocket(`ws://127.0.0.1:${inPort}`);

  sdSocket.onopen = function () {
    // Register plugin with Stream Deck
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
        settings: payload.settings || {}
      });
      updateKey(context);
      break;

    case "willDisappear":
      visibleKeys.delete(context);
      break;

    case "didReceiveSettings":
      if (visibleKeys.has(context)) {
        visibleKeys.get(context).settings = payload.settings || {};
        updateKey(context);
      }
      break;

    case "keyDown":
      handleKeyDown(context, action, payload.settings || {});
      break;
  }
}

// Helper to send events back to Stream Deck host
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
    case "SYNC_STATE":
      if (msg.payload) {
        tmState.trackPower = !!msg.payload.status?.trackPower;
        tmState.emergencyStop = !!msg.payload.status?.emergencyStop;
        tmState.automaticMode = !!msg.payload.status?.automaticMode;
        tmState.locos = msg.payload.locos || [];
        tmState.turnouts = msg.payload.turnouts || [];
        if (!tmState.activeLocoId && tmState.locos.length > 0) {
          tmState.activeLocoId = tmState.locos[0].id;
        }
      }
      updateAllKeys();
      break;

    case "POWER_CHANGED":
      tmState.trackPower = !!msg.payload?.active;
      updateKeysByAction("com.etsreac.trainmaster.power");
      break;

    case "EMERGENCY_STOP_TRIGGERED":
      tmState.emergencyStop = true;
      updateKeysByAction("com.etsreac.trainmaster.estop");
      break;

    case "RESUME_STOP_TRIGGERED":
      tmState.emergencyStop = false;
      updateKeysByAction("com.etsreac.trainmaster.estop");
      break;

    case "AUTOMATIC_MODE_CHANGED":
      tmState.automaticMode = !!msg.payload?.active;
      updateKeysByAction("com.etsreac.trainmaster.automode");
      break;

    case "LOCO_SPEED_CHANGED":
      if (msg.payload && msg.payload.locoId) {
        const loco = tmState.locos.find(l => l.id === msg.payload.locoId);
        if (loco) {
          if (msg.payload.speed !== undefined) loco.speed = msg.payload.speed;
          if (msg.payload.direction) loco.direction = msg.payload.direction;
        }
      }
      updateKeysByAction("com.etsreac.trainmaster.locoselect");
      updateKeysByAction("com.etsreac.trainmaster.locodir");
      break;

    case "LOCO_FUNCTION_CHANGED":
      if (msg.payload && msg.payload.locoId) {
        const loco = tmState.locos.find(l => l.id === msg.payload.locoId);
        if (loco) {
          loco.functions = loco.functions || {};
          loco.functions[msg.payload.functionIndex] = msg.payload.active;
        }
      }
      updateKeysByAction("com.etsreac.trainmaster.locofunc");
      break;

    case "TURNOUT_CHANGED":
      if (msg.payload && msg.payload.turnoutId) {
        const t = tmState.turnouts.find(item => item.id === msg.payload.turnoutId);
        if (t) t.state = msg.payload.state;
      }
      updateKeysByAction("com.etsreac.trainmaster.turnout");
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
    case "com.etsreac.trainmaster.power":
      sendToTrainMaster("SET_POWER", { active: !tmState.trackPower });
      break;

    case "com.etsreac.trainmaster.estop":
      if (tmState.emergencyStop) {
        sendToTrainMaster("RESUME_STOP");
      } else {
        sendToTrainMaster("EMERGENCY_STOP");
      }
      break;

    case "com.etsreac.trainmaster.automode":
      sendToTrainMaster("TOGGLE_AUTOMATIC_MODE", { active: !tmState.automaticMode });
      break;

    case "com.etsreac.trainmaster.locoselect":
      if (settings.locoId) {
        tmState.activeLocoId = settings.locoId;
      } else if (tmState.locos.length > 0) {
        // Cycle through locomotives
        const idx = tmState.locos.findIndex(l => l.id === tmState.activeLocoId);
        const nextIdx = (idx + 1) % tmState.locos.length;
        tmState.activeLocoId = tmState.locos[nextIdx].id;
      }
      updateAllKeys();
      break;

    case "com.etsreac.trainmaster.locodir":
      if (activeLoco) {
        const newDir = activeLoco.direction === "FWD" ? "REV" : "FWD";
        sendToTrainMaster("SET_LOCO_SPEED", {
          locoId: activeLoco.id,
          speed: activeLoco.speed,
          direction: newDir
        });
      }
      break;

    case "com.etsreac.trainmaster.locofunc":
      if (activeLoco) {
        const funcIdx = parseInt(settings.funcIndex !== undefined ? settings.funcIndex : 0, 10);
        const cur = !!activeLoco.functions?.[funcIdx];
        sendToTrainMaster("SET_LOCO_FUNCTION", {
          locoId: activeLoco.id,
          functionIndex: funcIdx,
          active: !cur
        });
      }
      break;

    case "com.etsreac.trainmaster.turnout":
      if (settings.turnoutId) {
        const t = tmState.turnouts.find(item => item.id === settings.turnoutId);
        const newState = (t && t.state === "STRAIGHT") ? "TURNOUT" : "STRAIGHT";
        sendToTrainMaster("SET_TURNOUT", {
          turnoutId: settings.turnoutId,
          state: newState
        });
      }
      break;
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
      const title = on ? "⚡ STROM\nAN" : "⚡ STROM\nAUS";
      const bg = on ? "#15803d" : "#334155";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, on ? "#fde047" : "#94a3b8", "⚡"));
      break;
    }

    case "com.etsreac.trainmaster.estop": {
      const active = tmState.emergencyStop;
      const title = active ? "🛑 NOT-AUS\nAKTIV!" : "🛑 NOT-AUS";
      const bg = active ? "#dc2626" : "#7f1d1d";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#ffffff", "🛑"));
      break;
    }

    case "com.etsreac.trainmaster.automode": {
      const on = tmState.automaticMode;
      const title = on ? "🤖 AUTO\nAKTIV" : "🤖 AUTO\nAUS";
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
        setKeyTitle(context, "Keine Lok");
        return;
      }

      const isSelected = activeLoco && activeLoco.id === targetLoco.id;
      const dirArrow = targetLoco.direction === "FWD" ? "▲" : "▼";
      const title = `${targetLoco.name}\n${dirArrow} ${targetLoco.speed}\nDCC #${targetLoco.dccAddress}`;
      const bg = isSelected ? "#1e3a8a" : "#1e293b";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, isSelected ? "#60a5fa" : "#94a3b8", "🚂", isSelected));
      break;
    }

    case "com.etsreac.trainmaster.locodir": {
      const dir = activeLoco ? activeLoco.direction : "FWD";
      const title = dir === "FWD" ? "▲ VORWÄRTS" : "▼ RÜCKWÄRTS";
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
      const name = t ? t.name : (settings.turnoutId || "Weiche");
      const state = t ? t.state : "STRAIGHT";
      const title = `${name}\n[${state === "STRAIGHT" ? "Gerade" : "Abzweig"}]`;
      const bg = state === "STRAIGHT" ? "#334155" : "#7c2d12";
      setKeyTitle(context, title);
      setKeyImage(context, createSvgIcon(bg, "#ffffff", "🔀"));
      break;
    }
  }
}

// Generate an SVG Data-URL for crisp Stream Deck key backgrounds
function createSvgIcon(bgColor, fgColor, iconChar, isBordered = false) {
  const borderSvg = isBordered ? `<rect x="4" y="4" width="136" height="136" rx="24" fill="none" stroke="#60a5fa" stroke-width="8"/>` : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect x="2" y="2" width="140" height="140" rx="26" fill="${bgColor}"/>
      ${borderSvg}
      <text x="72" y="86" font-size="52" text-anchor="middle" dominant-baseline="central">${iconChar}</text>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}
