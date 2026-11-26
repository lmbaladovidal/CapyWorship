/**
 * ProPresenter AI Studio - Multi-Display Sync Engine via BroadcastChannel
 */

const CHANNEL_NAME = "propresenter_studio_sync_v1";

export class BroadcastSync {
  constructor(isOperator = false) {
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.isOperator = isOperator;
    this.listeners = [];
    this.audienceListeners = [];
    this.mediaEndedListeners = [];
    this.mediaCommandListeners = [];
    this.stateProvider = null;
    this.eventSource = null;
    this.lastReceivedState = null;

    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (!event.data) return;
        if (event.data.type === "STATE_UPDATE") {
          this.lastReceivedState = event.data.payload;
          this.listeners.forEach(fn => fn(event.data.payload));
        } else if (event.data.type === "REQUEST_STATE" && this.isOperator && this.stateProvider) {
          this.sendUpdate(this.stateProvider());
        } else if (event.data.type === "AUDIENCE_PRESENCE") {
          this.audienceListeners.forEach(fn => fn(!!event.data.active));
        } else if (event.data.type === "MEDIA_ENDED" && this.isOperator) {
          this.mediaEndedListeners.forEach(fn => fn(event.data.url));
        } else if (event.data.type === "MEDIA_COMMAND") {
          this.mediaCommandListeners.forEach(fn => fn(event.data.command));
        }
      };
    }

    // Electron native IPC listener
    if (typeof window !== "undefined" && window.electronAPI && window.electronAPI.onBroadcastUpdate) {
      this._unsubscribeIpc = window.electronAPI.onBroadcastUpdate((state) => {
        this.lastReceivedState = state;
        this.listeners.forEach(fn => fn(state));
      });
    }
    if (this.isOperator && typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.onMediaEnded === "function") {
      this._unsubscribeMediaEndedIpc = window.electronAPI.onMediaEnded((url) => {
        this.mediaEndedListeners.forEach(fn => fn(url));
      });
    } else if (!this.isOperator && typeof window !== "undefined" && !window.electronAPI && typeof EventSource !== "undefined") {
      // Fallback to SSE when running outside Electron (e.g. OBS Browser Source / Chrome / Edge)
      const protocol = window.location?.protocol || "http:";
      if (protocol === "http:" || protocol === "https:") {
        try {
          this.eventSource = new EventSource("/events");
          this.eventSource.onmessage = (event) => {
            if (!event || !event.data) return;
            try {
              const state = JSON.parse(event.data);
              this.lastReceivedState = state;
              this.listeners.forEach(fn => fn(state));
            } catch (err) {
              console.warn("[BroadcastSync] Error parseando evento SSE:", err?.message || err);
            }
          };
          this.eventSource.onerror = (err) => {
            console.warn("[BroadcastSync] Conexión SSE interrumpida; reconectando automáticamente...", err?.type || "");
          };
        } catch (err) {
          console.warn("[BroadcastSync] No se pudo inicializar EventSource('/events'):", err?.message || err);
        }
      }
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("beforeunload", () => this.close(), { once: true });
    }
  }

  close() {
    if (typeof this._unsubscribeIpc === "function") {
      this._unsubscribeIpc();
      this._unsubscribeIpc = null;
    }
    if (typeof this._unsubscribeMediaEndedIpc === "function") {
      this._unsubscribeMediaEndedIpc();
      this._unsubscribeMediaEndedIpc = null;
    }
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (e) {}
      this.eventSource = null;
    }
    if (this.channel) {
      try { this.channel.close(); } catch (e) {}
    }
  }

  setStateProvider(providerFn) {
    this.stateProvider = providerFn;
  }

  onAudiencePresence(callback) {
    this.audienceListeners.push(callback);
  }

  onMediaEnded(callback) {
    this.mediaEndedListeners.push(callback);
  }

  notifyMediaEnded(url = "") {
    try {
      this.channel?.postMessage({ type: "MEDIA_ENDED", url, timestamp: Date.now() });
    } catch (e) {}
    try {
      if (typeof window !== "undefined" && window.electronAPI && typeof window.electronAPI.sendMediaEnded === "function") {
        window.electronAPI.sendMediaEnded(url);
      }
    } catch (e) {}
  }

  onMediaCommand(callback) {
    this.mediaCommandListeners.push(callback);
  }

  sendMediaCommand(command) {
    try {
      this.channel?.postMessage({ type: "MEDIA_COMMAND", command, timestamp: Date.now() });
    } catch (e) {}
  }


  // Operator sends state updates to all open displays
  sendUpdate(state) {
    try {
      this.channel?.postMessage({
        type: "STATE_UPDATE",
        payload: state,
        timestamp: Date.now()
      });
    } catch (e) {}

    if (typeof window !== "undefined" && window.electronAPI && window.electronAPI.sendBroadcast) {
      window.electronAPI.sendBroadcast(state);
    }
  }

  // Audience or Stage displays listen for state updates
  onUpdate(callback) {
    this.listeners.push(callback);
    if (this.eventSource && this.lastReceivedState !== null) {
      try {
        callback(this.lastReceivedState);
      } catch (e) {}
    }
  }

  // Request latest state on window load
  requestState() {
    try {
      this.channel?.postMessage({ type: "REQUEST_STATE" });
    } catch (e) {}
  }
}

export const sync = new BroadcastSync(true);
