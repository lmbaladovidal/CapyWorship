/**
 * ProPresenter AI Studio - Local HTTP + SSE Audience Server
 * Serves audience.html and static assets for OBS / Spout / Resolume Arena Mixed Mode
 * using only Node.js built-in modules (no external npm dependencies).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fileURLToPath } = require('url');

const DEFAULT_APP_SETTINGS = {
  AudienceServer: {
    Host: '127.0.0.1',
    Port: 3456
  },
  resolume: {
    enabled: false,
    host: '127.0.0.1',
    port: 8080
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function loadAppSettings(baseDir, extraPaths = []) {
  const candidates = Array.from(
    new Set(
      [
        baseDir ? path.join(baseDir, 'appsettings.json') : null,
        ...(Array.isArray(extraPaths) ? extraPaths : []),
        path.join(process.cwd(), 'appsettings.json')
      ].filter(Boolean)
    )
  );

  let parsed = {};
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          parsed = data;
          break;
        }
      }
    } catch (err) {
      console.warn(`[AudienceServer] No se pudo leer ${candidate}:`, err.message);
    }
  }

  return {
    ...parsed,
    AudienceServer: {
      ...DEFAULT_APP_SETTINGS.AudienceServer,
      ...(parsed.AudienceServer || {})
    },
    resolume: {
      ...DEFAULT_APP_SETTINGS.resolume,
      ...(parsed.resolume || {})
    }
  };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function fileUrlToLocalPath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('file:')) return null;
  try {
    return fileURLToPath(rawUrl);
  } catch {
    try {
      let decoded = decodeURIComponent(rawUrl.replace(/^file:\/{2,3}/i, ''));
      if (/^\/[a-zA-Z]:\//.test(decoded)) {
        decoded = decoded.slice(1);
      } else if (process.platform === 'win32' && !/^[a-zA-Z]:/.test(decoded) && !decoded.startsWith('/')) {
        decoded = '/' + decoded;
      }
      return path.normalize(decoded);
    } catch {
      return null;
    }
  }
}

class LocalAudienceServer {
  constructor({
    host = '127.0.0.1',
    port = 3456,
    rootDir = process.cwd(),
    fallbackRootDir = null,
    heartbeatIntervalMs = 25000
  } = {}) {
    const parsedPort = Number(port);
    this.host = host || '127.0.0.1';
    this.port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3456;
    this.actualPort = this.port;
    this.rootDir = path.resolve(rootDir);
    this.fallbackRootDir = fallbackRootDir ? path.resolve(fallbackRootDir) : null;
    this.heartbeatIntervalMs = heartbeatIntervalMs;

    this.sseClients = new Set();
    this.lastBroadcastState = null;
    this.localMediaPathToToken = new Map();
    this.localMediaTokenToPath = new Map();
    this.heartbeatTimer = null;
    this.server = null;
    this.isListening = false;
  }

  registerLocalMediaUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('file:')) {
      return rawUrl;
    }
    const localPath = fileUrlToLocalPath(rawUrl);
    if (!localPath) return rawUrl;

    let token = this.localMediaPathToToken.get(localPath);
    if (!token) {
      token = crypto.createHash('sha1').update(localPath).digest('hex').slice(0, 16);
      this.localMediaPathToToken.set(localPath, token);
      this.localMediaTokenToPath.set(token, localPath);
    }

    const fileName = encodeURIComponent(path.basename(localPath) || 'media');
    return `/local-media/${token}/${fileName}`;
  }

  prepareSseState(state) {
    if (!state || typeof state !== 'object') return state;

    const { mediaLibrary, mediaFolders, physicalMediaFolders, ...lightState } = state;

    if (typeof lightState.activeVideoUrl === 'string' && lightState.activeVideoUrl.startsWith('file:')) {
      lightState.activeVideoUrl = this.registerLocalMediaUrl(lightState.activeVideoUrl);
    }
    if (typeof lightState.liveSlideImage === 'string' && lightState.liveSlideImage.startsWith('file:')) {
      lightState.liveSlideImage = this.registerLocalMediaUrl(lightState.liveSlideImage);
    }
    if (typeof lightState.nextSlideImage === 'string' && lightState.nextSlideImage.startsWith('file:')) {
      lightState.nextSlideImage = this.registerLocalMediaUrl(lightState.nextSlideImage);
    }
    if (lightState.activeTemplate && typeof lightState.activeTemplate === 'object') {
      lightState.activeTemplate = { ...lightState.activeTemplate };
      if (typeof lightState.activeTemplate.bgImageUrl === 'string' && lightState.activeTemplate.bgImageUrl.startsWith('file:')) {
        lightState.activeTemplate.bgImageUrl = this.registerLocalMediaUrl(lightState.activeTemplate.bgImageUrl);
      }
    }
    if (Array.isArray(lightState.mediaQueue)) {
      lightState.mediaQueue = lightState.mediaQueue.map(entry => {
        if (!entry || typeof entry !== 'object') return entry;
        const { thumbnail, ...restEntry } = entry;
        if (typeof restEntry.url === 'string' && restEntry.url.startsWith('file:')) {
          restEntry.url = this.registerLocalMediaUrl(restEntry.url);
        }
        return restEntry;
      });
    }
    if (lightState.stageMedia && typeof lightState.stageMedia === 'object') {
      lightState.stageMedia = { ...lightState.stageMedia };
      if (lightState.stageMedia.mainVideo && typeof lightState.stageMedia.mainVideo === 'object') {
        lightState.stageMedia.mainVideo = { ...lightState.stageMedia.mainVideo };
        if (typeof lightState.stageMedia.mainVideo.src === 'string' && lightState.stageMedia.mainVideo.src.startsWith('file:')) {
          lightState.stageMedia.mainVideo.src = this.registerLocalMediaUrl(lightState.stageMedia.mainVideo.src);
        }
      }
      if (lightState.stageMedia.secondaryVideo && typeof lightState.stageMedia.secondaryVideo === 'object') {
        lightState.stageMedia.secondaryVideo = { ...lightState.stageMedia.secondaryVideo };
        if (typeof lightState.stageMedia.secondaryVideo.src === 'string' && lightState.stageMedia.secondaryVideo.src.startsWith('file:')) {
          lightState.stageMedia.secondaryVideo.src = this.registerLocalMediaUrl(lightState.stageMedia.secondaryVideo.src);
        }
      }
    }

    return lightState;
  }

  broadcastState(state) {
    const sseState = this.prepareSseState(state);
    this.lastBroadcastState = sseState;

    if (this.sseClients.size === 0) return;

    const payload = `data: ${JSON.stringify(sseState)}\n\n`;
    for (const res of Array.from(this.sseClients)) {
      try {
        if (res.destroyed || res.writableEnded) {
          this.sseClients.delete(res);
          continue;
        }
        res.write(payload);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  handleSseRequest(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    this.sseClients.add(res);

    const cleanup = () => {
      this.sseClients.delete(res);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    if (this.lastBroadcastState !== null) {
      try {
        res.write(`data: ${JSON.stringify(this.lastBroadcastState)}\n\n`);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  async handleLocalMediaRequest(req, res, pathname) {
    const match = pathname.match(/^\/local-media\/([a-f0-9]{16})(?:\/[^/]+)?$/i);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const token = match[1];
    const filePath = this.localMediaTokenToPath.get(token);
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const contentType = getMimeType(filePath);
    const totalSize = stat.size;
    const rangeHeader = req.headers.range;

    if (rangeHeader && /^bytes=/.test(rangeHeader)) {
      const rangeSpec = rangeHeader.replace(/^bytes=/, '').split(',')[0].trim();
      const [startStr, endStr] = rangeSpec.split('-');
      let start;
      let end;

      if (startStr === '') {
        const suffixLength = Number.parseInt(endStr, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
          res.end();
          return;
        }
        start = Math.max(0, totalSize - suffixLength);
        end = totalSize - 1;
      } else {
        start = Number.parseInt(startStr, 10);
        end = endStr ? Number.parseInt(endStr, 10) : totalSize - 1;
      }

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= totalSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }

      end = Math.min(end, totalSize - 1);
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': totalSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  }

  async resolveStaticFile(relFromUrl) {
    const roots = [this.rootDir, this.fallbackRootDir].filter(Boolean);
    for (const root of roots) {
      const candidate = path.resolve(root, relFromUrl);
      const rel = path.relative(root, candidate);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        continue;
      }
      try {
        const stat = await fs.promises.stat(candidate);
        if (stat.isFile()) {
          return { filePath: candidate, stat };
        }
      } catch {
        // Try fallbackRootDir if present
      }
    }
    return null;
  }

  async handleStaticRequest(req, res, pathname) {
    let targetPath = pathname === '/' ? '/audience.html' : pathname;
    const relFromUrl = targetPath.replace(/^\/+/, '');
    if (!relFromUrl || relFromUrl.split(/[\\/]/).includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const resolved = await this.resolveStaticFile(relFromUrl);
    if (!resolved) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const { filePath, stat } = resolved;
    const contentType = getMimeType(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*'
    };
    if (ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css') {
      headers['Cache-Control'] = 'no-cache';
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  }

  async handleRequest(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = req.url || '/';
    const rawPathPart = rawUrl.split('?')[0];
    let decodedRawPath;
    try {
      decodedRawPath = decodeURIComponent(rawPathPart);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (decodedRawPath.split(/[\\/]/).includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let pathname;
    try {
      const parsed = new URL(rawUrl, `http://${this.host}`);
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (pathname === '/events') {
      this.handleSseRequest(req, res);
      return;
    }

    if (pathname.startsWith('/local-media/')) {
      await this.handleLocalMediaRequest(req, res, pathname);
      return;
    }

    await this.handleStaticRequest(req, res, pathname);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    if (!this.heartbeatIntervalMs || this.heartbeatIntervalMs <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.sseClients.size === 0) return;
      for (const res of Array.from(this.sseClients)) {
        try {
          if (res.destroyed || res.writableEnded) {
            this.sseClients.delete(res);
            continue;
          }
          res.write(': keep-alive\n\n');
        } catch {
          this.sseClients.delete(res);
        }
      }
    }, this.heartbeatIntervalMs);

    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  start() {
    if (this.server && this.isListening) {
      return Promise.resolve({ listening: true, host: this.host, port: this.actualPort });
    }

    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        Promise.resolve(this.handleRequest(req, res)).catch((err) => {
          console.warn('[AudienceServer] Error procesando solicitud:', err?.message || err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          }
          try { res.end('Internal Server Error'); } catch {}
        });
      });

      this.server = server;
      let settled = false;

      server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          console.warn(`[AudienceServer] Puerto ${this.host}:${this.port} ya está en uso (EADDRINUSE). El servidor HTTP/SSE externo no se iniciará.`);
        } else {
          console.warn('[AudienceServer] Error en servidor HTTP:', err?.message || err);
        }
        this.isListening = false;
        if (!settled) {
          settled = true;
          try { server.close(); } catch {}
          this.server = null;
          resolve({ listening: false, host: this.host, port: this.port, error: err?.message || String(err), code: err?.code });
        }
      });

      server.listen(this.port, this.host, () => {
        const addr = server.address();
        this.actualPort = addr && typeof addr === 'object' ? addr.port : this.port;
        this.isListening = true;
        this.startHeartbeat();
        console.log(`[AudienceServer] Escuchando en http://${this.host}:${this.actualPort}/audience.html?transparent=1`);
        if (!settled) {
          settled = true;
          resolve({ listening: true, host: this.host, port: this.actualPort });
        }
      });
    });
  }

  stop() {
    this.stopHeartbeat();
    this.isListening = false;

    for (const res of Array.from(this.sseClients)) {
      try {
        res.end();
      } catch {}
    }
    this.sseClients.clear();

    if (!this.server) {
      return Promise.resolve();
    }

    const server = this.server;
    this.server = null;

    return new Promise((resolve) => {
      if (typeof server.closeAllConnections === 'function') {
        try { server.closeAllConnections(); } catch {}
      }
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  getInfo() {
    const port = this.actualPort || this.port;
    return {
      running: this.isListening,
      host: this.host,
      port,
      url: `http://${this.host}:${port}/audience.html?transparent=1`,
      forceUrl: `http://${this.host}:${port}/audience.html?transparent=force`
    };
  }
}

function createLocalAudienceServer(options) {
  return new LocalAudienceServer(options);
}

module.exports = {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  LocalAudienceServer,
  createLocalAudienceServer,
  getMimeType,
  fileUrlToLocalPath
};
