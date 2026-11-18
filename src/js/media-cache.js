/**
 * ProPresenter AI Studio - Media Cache & Thumbnail Engine
 * Maneja el almacenamiento persistente de miniaturas y blobs multimedia mediante IndexedDB.
 */

const DB_NAME = 'FreePresenterMediaDB';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return resolve(null);
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        console.warn('Error abriendo IndexedDB para MediaCache:', err);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

export class MediaCache {
  static _thumbQueue = [];
  static _activeWorkers = 0;
  static _maxConcurrency = 2;
  static _inFlightIds = new Set();

  /**
   * Encola la generación de una miniatura con concurrencia limitada (máx. 2 decodificadores simultáneos)
   * y deduplicación de tareas en vuelo para no saturar WebMediaPlayer en Chromium.
   */
  static enqueueThumbnailGeneration(id, fileOrUrl, type = '') {
    if (!id || !fileOrUrl) return Promise.resolve(null);
    if (this._inFlightIds.has(id)) return Promise.resolve(null);
    this._inFlightIds.add(id);

    return new Promise((resolve) => {
      this._thumbQueue.push({ id, fileOrUrl, type, resolve });
      this._processThumbQueue();
    });
  }

  static _processThumbQueue() {
    while (this._activeWorkers < this._maxConcurrency && this._thumbQueue.length > 0) {
      const task = this._thumbQueue.shift();
      this._activeWorkers++;
      this.generateThumbnail(task.fileOrUrl, task.type)
        .then((res) => task.resolve(res))
        .catch(() => task.resolve(null))
        .finally(() => {
          this._inFlightIds.delete(task.id);
          this._activeWorkers--;
          this._processThumbQueue();
        });
    }
  }

  /**
   * Genera una miniatura SVG estática ligera cuando un video remoto bloquea canvas por CORS
   * para evitar reintentos continuos en cada inicio.
   */
  static getFallbackVideoThumb() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#0f172a"/><circle cx="160" cy="90" r="26" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="2"/><polygon points="153,78 173,90 153,102" fill="#38bdf8"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  /**
   * Obtiene todas las miniaturas cacheadas en IndexedDB en una sola transacción (para inicio ultrarrápido).
   */
  static async getAllThumbnailsMap() {
    const map = new Map();
    try {
      const db = await getDB();
      if (!db) return map;
      return new Promise((resolve) => {
        const tx = db.transaction('thumbnails', 'readonly');
        const req = tx.objectStore('thumbnails').getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          rows.forEach(row => {
            if (row && row.id && row.dataUrl) {
              map.set(row.id, row.dataUrl);
            }
          });
          resolve(map);
        };
        req.onerror = () => resolve(map);
      });
    } catch (e) {
      return map;
    }
  }

  /**
   * Guarda una miniatura en IndexedDB (por ID y opcionalmente por clave estable filePath/url)
   */
  static async saveThumbnail(id, dataUrl) {
    if (!id || !dataUrl) return;
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction('thumbnails', 'readwrite');
      tx.objectStore('thumbnails').put({ id, dataUrl, updatedAt: Date.now() });
    } catch (e) {
      console.warn('Error guardando miniatura en IndexedDB:', e);
    }
  }

  static async saveThumbnailForItem(item, dataUrl) {
    if (!item || !dataUrl) return;
    const stableKey = item.filePath || item.url || '';
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction('thumbnails', 'readwrite');
      const store = tx.objectStore('thumbnails');
      if (item.id) store.put({ id: item.id, dataUrl, updatedAt: Date.now() });
      if (stableKey && stableKey !== item.id) {
        store.put({ id: stableKey, dataUrl, updatedAt: Date.now() });
      }
    } catch (e) {
      console.warn('Error guardando miniatura en IndexedDB:', e);
    }
  }

  /**
   * Obtiene una miniatura desde IndexedDB
   */
  static async getThumbnail(id, stableKey = '') {
    if (!id && !stableKey) return null;
    try {
      const db = await getDB();
      if (!db) return null;
      const lookup = (key) => new Promise((resolve) => {
        if (!key) return resolve(null);
        const tx = db.transaction('thumbnails', 'readonly');
        const req = tx.objectStore('thumbnails').get(key);
        req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
        req.onerror = () => resolve(null);
      });
      return (await lookup(id)) || (stableKey ? await lookup(stableKey) : null);
    } catch (e) {
      return null;
    }
  }

  /**
   * Guarda un archivo Blob completo en IndexedDB (para persistencia en modo web sin file:///)
   */
  static async saveBlob(id, fileOrBlob, name = '', type = '') {
    if (!id || !fileOrBlob) return;
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put({
        id,
        blob: fileOrBlob,
        name: name || fileOrBlob.name || '',
        type: type || fileOrBlob.type || '',
        updatedAt: Date.now()
      });
    } catch (e) {
      console.warn('Error guardando blob en IndexedDB:', e);
    }
  }

  /**
   * Obtiene un archivo Blob desde IndexedDB
   */
  static async getBlob(id) {
    if (!id) return null;
    try {
      const db = await getDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').get(id);
        req.onsuccess = () => resolve(req.result ? req.result.blob : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Elimina miniatura y blob de IndexedDB
   */
  static async deleteMedia(id) {
    if (!id) return;
    try {
      const db = await getDB();
      if (!db) return;
      const tx1 = db.transaction('thumbnails', 'readwrite');
      tx1.objectStore('thumbnails').delete(id);
      const tx2 = db.transaction('blobs', 'readwrite');
      tx2.objectStore('blobs').delete(id);
    } catch (e) {}
  }

  /**
   * Genera una miniatura ligera JPEG (320x180) a partir de una imagen o video
   */
  static generateThumbnail(fileOrUrl, type = '') {
    return new Promise((resolve) => {
      let url = '';
      let isTemporaryUrl = false;

      if (typeof fileOrUrl === 'string') {
        url = fileOrUrl;
      } else if (fileOrUrl instanceof Blob || fileOrUrl instanceof File) {
        url = URL.createObjectURL(fileOrUrl);
        isTemporaryUrl = true;
      } else {
        return resolve(null);
      }

      const isImg = (type && type.startsWith('image/')) || (url && url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)($|\?)/i));

      if (isImg) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        let finished = false;

        const cleanup = () => {
          if (!finished) {
            finished = true;
            if (isTemporaryUrl) URL.revokeObjectURL(url);
          }
        };

        const timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, 4000);

        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 320, 180);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            cleanup();
            resolve(dataUrl);
          } catch (err) {
            cleanup();
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          cleanup();
          resolve(null);
        };

        img.src = url;
      } else {
        // Video Thumbnail Generation
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';

        let finished = false;
        let seekFallbackTimer = null;
        const cleanup = () => {
          if (!finished) {
            finished = true;
            if (seekFallbackTimer) {
              clearTimeout(seekFallbackTimer);
              seekFallbackTimer = null;
            }
            video.pause();
            video.removeAttribute('src');
            video.load();
            if (isTemporaryUrl) URL.revokeObjectURL(url);
          }
        };

        const timer = setTimeout(() => {
          cleanup();
          resolve(null);
        }, 6000);

        const captureFrame = () => {
          if (finished) return;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 320, 180);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            clearTimeout(timer);
            cleanup();
            resolve(dataUrl);
          } catch (e) {
            clearTimeout(timer);
            cleanup();
            resolve(null);
          }
        };

        video.onloadeddata = () => {
          if (finished) return;
          try {
            const dur = video.duration;
            const canSeek = Number.isFinite(dur) && dur > 0.3 && (!video.seekable || video.seekable.length > 0);
            if (!canSeek) {
              captureFrame();
              return;
            }

            // Seek al 10% (máx 1s) en videos largos, o 25% (máx 0.15s) en clips muy cortos
            const seekTime = dur > 1.5 ? Math.min(1.0, dur * 0.1) : Math.min(0.15, dur * 0.25);
            if (seekTime <= 0.01) {
              captureFrame();
              return;
            }

            // Si onseeked no responde en 1.2s (común en MP4 sin tabla de seek), capturar el primer frame
            seekFallbackTimer = setTimeout(() => {
              captureFrame();
            }, 1200);

            video.currentTime = seekTime;
          } catch (e) {
            captureFrame();
          }
        };

        video.onseeked = () => {
          captureFrame();
        };

        video.onerror = () => {
          clearTimeout(timer);
          cleanup();
          resolve(null);
        };

        video.src = url;
      }
    });
  }
}
