/**
 * ProPresenter AI Studio - Electron Preload Script
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Hidratar automáticamente localStorage desde la base de datos persistente en disco antes de iniciar la app.
// Esto garantiza que al actualizar la versión, usar el instalador o abrir el ejecutable portable,
// jamás se pierdan canciones, biblias, plantillas, carpetas ni configuraciones previas.
function isMainOperatorView() {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const p = (window.location.pathname || '').toLowerCase();
    if (p.endsWith('splash.html') || p.endsWith('audience.html') || p.endsWith('videowall.html') || p.endsWith('stage.html')) {
      return false;
    }
    return true;
  } catch (_) {
    return true;
  }
}

function syncLocalStorageWithDiskOnBoot() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (!isMainOperatorView()) return;

    // Fast path: si localStorage ya está poblado con los decks del usuario, evitar lectura síncrona pesada de disco
    const hasCustomDecksInLocal = Boolean(window.localStorage.getItem('propresenter_decks'));
    if (hasCustomDecksInLocal) return;

    const diskStorage = ipcRenderer.sendSync('load-persistent-storage-sync');
    if (diskStorage && typeof diskStorage === 'object') {
      for (const [key, val] of Object.entries(diskStorage)) {
        if (typeof val !== 'string') continue;
        const currentVal = window.localStorage.getItem(key);
        if (currentVal === null || (!hasCustomDecksInLocal && key.startsWith('propresenter_'))) {
          window.localStorage.setItem(key, val);
        }
      }
    }
  } catch (err) {
    console.warn('[Preload] No se pudo hidratar almacenamiento persistente:', err);
  }
}

let snapshotDebounceTimer = null;

function pushLocalStorageSnapshotToDisk(immediate = false) {
  if (!isMainOperatorView()) return;
  if (!immediate) {
    if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
    snapshotDebounceTimer = setTimeout(() => {
      snapshotDebounceTimer = null;
      pushLocalStorageSnapshotToDisk(true);
    }, 1800);
    return;
  }
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const snapshot = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('propresenter_') || key.startsWith('freepresenter_') || key.startsWith('capyworship_'))) {
        snapshot[key] = window.localStorage.getItem(key);
      }
    }
    if (Object.keys(snapshot).length > 0) {
      ipcRenderer.send('save-persistent-storage', snapshot);
    }
  } catch (_) {}
}

syncLocalStorageWithDiskOnBoot();
if (typeof window !== 'undefined' && isMainOperatorView()) {
  window.addEventListener('DOMContentLoaded', () => {
    pushLocalStorageSnapshotToDisk(false);
  });
  window.addEventListener('beforeunload', () => {
    if (snapshotDebounceTimer) {
      clearTimeout(snapshotDebounceTimer);
      snapshotDebounceTimer = null;
    }
    pushLocalStorageSnapshotToDisk(true);
  });
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return file?.path || '';
  },
  openAudienceWindow: (displayId) => ipcRenderer.invoke('open-audience-window', displayId),
  closeAudienceWindow: () => ipcRenderer.invoke('close-audience-window'),
  openStageWindow: () => ipcRenderer.send('open-stage-window'),
  focusMainWindow: () => ipcRenderer.send('focus-main-window'),
  selectMediaFiles: () => ipcRenderer.invoke('select-media-files'),
  selectPhysicalFolder: () => ipcRenderer.invoke('select-physical-folder'),
  syncPhysicalFolders: (folderPaths) => ipcRenderer.invoke('sync-physical-folders', folderPaths),
  unwatchPhysicalFolder: (folderPath) => ipcRenderer.invoke('unwatch-physical-folder', folderPath),
  onPhysicalFolderUpdated: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('physical-folder-updated', handler);
    return () => ipcRenderer.removeListener('physical-folder-updated', handler);
  },
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  sendBroadcast: (state) => ipcRenderer.send('broadcast-update', state),
  onBroadcastUpdate: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('broadcast-update', handler);
    return () => ipcRenderer.removeListener('broadcast-update', handler);
  },
  sendMediaEnded: (url) => ipcRenderer.send('media-ended', url),
  onMediaEnded: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('media-ended', handler);
    return () => ipcRenderer.removeListener('media-ended', handler);
  },
  isAudienceOpen: () => ipcRenderer.invoke('is-audience-open'),
  onAudienceStatusChanged: (callback) => {
    const handler = (_event, isOpen) => callback(isOpen);
    ipcRenderer.on('audience-status-changed', handler);
    return () => ipcRenderer.removeListener('audience-status-changed', handler);
  },
  openVideowall: (displayId) => ipcRenderer.invoke('open-videowall', displayId),
  closeVideowall: () => ipcRenderer.invoke('close-videowall'),
  isVideowallOpen: () => ipcRenderer.invoke('is-videowall-open'),
  onVideowallStatusChanged: (callback) => {
    const handler = (_event, isOpen) => callback(isOpen);
    ipcRenderer.on('videowall-status-changed', handler);
    return () => ipcRenderer.removeListener('videowall-status-changed', handler);
  },
  // Importación de Presentaciones (PPTX / PPT / PPSX / ODP / PDF)
  selectPresentationFile: () => ipcRenderer.invoke('select-presentation-file'),
  getPresentationEngines: () => ipcRenderer.invoke('get-presentation-engines'),
  importPresentationFile: (filePath) => ipcRenderer.invoke('import-presentation-file', filePath),
  savePresentationSlideImage: (assetId, index, data) => ipcRenderer.invoke('save-presentation-slide-image', { assetId, index, data }),
  cancelPresentationImport: () => ipcRenderer.invoke('cancel-presentation-import'),
  deletePresentationAssets: (assetId) => ipcRenderer.invoke('delete-presentation-assets', assetId),
  onPresentationImportProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('presentation-import-progress', handler);
    return () => ipcRenderer.removeListener('presentation-import-progress', handler);
  },
  // Splash Banner Startup Lifecycle
  sendSplashStatus: (message, progress) => ipcRenderer.send('splash-status', { message, progress }),
  notifyAppReady: () => ipcRenderer.send('app-ready'),
  onSplashStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('splash-status', handler);
    return () => ipcRenderer.removeListener('splash-status', handler);
  },
  onSplashFadeOut: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('splash-fade-out', handler);
    return () => ipcRenderer.removeListener('splash-fade-out', handler);
  },
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  getAudienceServerInfo: () => ipcRenderer.invoke('get-audience-server-info'),
  savePersistentStorageSnapshot: () => pushLocalStorageSnapshotToDisk()
});

