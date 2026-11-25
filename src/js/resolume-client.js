/**
 * ProPresenter AI Studio / FreePresenter
 * Lightweight REST API client for Resolume Arena (Phase 2)
 */

const STORAGE_KEY = 'propresenter_resolume_config';

const DEFAULT_CONFIG = {
  enabled: false,
  host: '127.0.0.1',
  port: 8080,
  timeoutMs: 1500
};

function sanitizeConfig(raw = {}) {
  const parsedPort = Number.parseInt(raw.port, 10);
  const parsedTimeout = Number.parseInt(raw.timeoutMs, 10);
  return {
    enabled: Boolean(raw.enabled),
    host: typeof raw.host === 'string' && raw.host.trim() ? raw.host.trim() : DEFAULT_CONFIG.host,
    port: Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : DEFAULT_CONFIG.port,
    timeoutMs: Number.isInteger(parsedTimeout) && parsedTimeout >= 200 && parsedTimeout <= 10000 ? parsedTimeout : DEFAULT_CONFIG.timeoutMs
  };
}

export class ResolumeClient {
  constructor(initialConfig = {}) {
    this.config = sanitizeConfig({ ...DEFAULT_CONFIG, ...initialConfig });
    this.loadSavedConfig();
  }

  loadSavedConfig() {
    if (typeof localStorage === 'undefined') return this.config;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          this.config = sanitizeConfig({ ...this.config, ...parsed });
        }
      }
    } catch (_) {}
    return this.config;
  }

  loadConfig(appSettings = {}) {
    const fileConfig = appSettings?.resolume && typeof appSettings.resolume === 'object'
      ? appSettings.resolume
      : {};
    let savedOverrides = {};
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) savedOverrides = JSON.parse(raw) || {};
      } catch (_) {}
    }
    this.config = sanitizeConfig({ ...DEFAULT_CONFIG, ...fileConfig, ...savedOverrides });
    return { ...this.config };
  }

  configure(partialConfig = {}, persist = true) {
    this.config = sanitizeConfig({ ...this.config, ...partialConfig });
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          enabled: this.config.enabled,
          host: this.config.host,
          port: this.config.port
        }));
      } catch (_) {}
    }
    return { ...this.config };
  }

  getConfig() {
    return { ...this.config };
  }

  async triggerColumn(columnIndex, options = {}) {
    const col = Number.parseInt(columnIndex, 10);
    if (!Number.isInteger(col) || col < 1) {
      return { ok: false, skipped: true, reason: 'invalid_column' };
    }

    const force = Boolean(options.force);
    if (!this.config.enabled && !force) {
      return { ok: false, skipped: true, reason: 'disabled', columnIndex: col };
    }

    if (typeof fetch !== 'function') {
      return { ok: false, skipped: true, reason: 'fetch_unavailable', columnIndex: col };
    }

    const host = options.host || this.config.host;
    const port = options.port || this.config.port;
    const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : this.config.timeoutMs;
    const url = `http://${host}:${port}/api/v1/composition/columns/${col}/connect`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timerId = controller
      ? setTimeout(() => {
          try { controller.abort(); } catch (_) {}
        }, timeoutMs)
      : null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller ? controller.signal : undefined
      });
      return {
        ok: Boolean(response && response.ok),
        status: response ? response.status : 0,
        columnIndex: col
      };
    } catch (err) {
      return {
        ok: false,
        columnIndex: col,
        error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network_error')
      };
    } finally {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
    }
  }
}

export const resolumeClient = new ResolumeClient();

export function triggerColumn(columnIndex, options = {}) {
  return resolumeClient.triggerColumn(columnIndex, options);
}
