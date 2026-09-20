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
      break;

    case "TURNOUT_DELETED":
      if (msg.payload && msg.payload.turnoutId) {
        tmState.turnouts = tmState.turnouts.filter(t => t.id !== msg.payload.turnoutId);
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
        const newState = (t && t.state === "STRAIGHT") ? "TURNOUT" : "STRAIGHT";
        if (t) t.state = newState;
        updateKeysByAction("com.etsreac.trainmaster.turnout");
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
  }
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
