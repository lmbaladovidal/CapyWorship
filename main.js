/**
 * ProPresenter AI Studio - Electron Main Process
 * Manages Native Windows, Multi-Monitor Projections & Desktop IPC
 */
const { app, BrowserWindow, ipcMain, dialog, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { PresentationImporter, SUPPORTED_EXTENSIONS } = require('./electron/presentation-importer');
const { LocalAudienceServer, loadAppSettings } = require('./electron/local-audience-server');

let presentationImporter = null;
function getPresentationImporter() {
  if (!presentationImporter) {
    presentationImporter = new PresentationImporter({
      assetsRoot: path.join(app.getPath('userData'), 'presentations'),
      makeThumbnail: async (srcPath, destPath) => {
        try {
          const img = nativeImage.createFromPath(srcPath);
          if (img.isEmpty()) return false;
          const resized = img.resize({ width: 420 });
          await fs.promises.writeFile(destPath, resized.toJPEG(82));
          return true;
        } catch {
          return false;
        }
      }
    });
  }
  return presentationImporter;
}

// Optimize Chromium GPU Hardware Acceleration & Video Decoding Performance
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');


let mainWindow = null;
let splashWindow = null;
let audienceWindow = null;
let stageWindow = null;
let videowallWindow = null;
let lastBroadcastState = null;
let localAudienceServer = null;
let appSettings = loadAppSettings(__dirname);
let splashShownAt = 0;
let isMainRevealed = false;
let splashFallbackTimer = null;

const isDev = process.env.NODE_ENV === 'development' || (!app.isPackaged && process.env.NODE_ENV !== 'production');
const DEV_PORT = process.env.PORT || 3000;
const DEV_URL = `http://localhost:${DEV_PORT}`;

function sendSplashStatus(message, progress) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-status', { message, progress });
  }
}

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return;

  splashWindow = new BrowserWindow({
    width: 600,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    icon: path.join(__dirname, 'Branding/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'electron/splash.html'), {
    query: { v: app.getVersion() }
  });

  splashWindow.once('ready-to-show', () => {
    splashShownAt = Date.now();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function revealMainWindow() {
  if (isMainRevealed) return;
  isMainRevealed = true;

  if (splashFallbackTimer) {
    clearTimeout(splashFallbackTimer);
    splashFallbackTimer = null;
  }

  const MIN_SPLASH_MS = 2000;
  const elapsed = splashShownAt ? Date.now() - splashShownAt : 0;
  const waitMs = Math.max(0, MIN_SPLASH_MS - elapsed);

  setTimeout(() => {
    sendSplashStatus('¡Sistema listo! Abriendo estudio...', 100);

    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('splash-fade-out');
      }

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.maximize();
          mainWindow.focus();
        }

        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
        }

        // Auto-launch Audience Window on secondary screen if multiple displays are connected
        const displays = screen.getAllDisplays();
        const primaryDisplay = screen.getPrimaryDisplay();
        const hasSecondaryDisplay = displays.some(d => d.id !== primaryDisplay.id);
        if (hasSecondaryDisplay) {
          openAudienceWindow();
        }
      }, 320);
    }, 480);
  }, waitMs);
}

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1366, width),
    height: Math.min(768, height),
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: "CapyWorship — Tech for the Kingdom",
    backgroundColor: '#121E36',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'Branding/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allows loading local file:// video paths directly
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    sendSplashStatus('Cargando interfaz de CapyWorship...', 28);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendSplashStatus('Inicializando módulos de proyección...', 48);
  });

  if (splashFallbackTimer) clearTimeout(splashFallbackTimer);
  splashFallbackTimer = setTimeout(() => {
    revealMainWindow();
  }, 12000);

  let usingLocalDist = !isDev;

  if (isDev) {
    mainWindow.loadURL(DEV_URL).catch(() => {
      usingLocalDist = true;
      mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const folderPath of physicalFolderWatchers.keys()) {
      unwatchPhysicalFolder(folderPath);
    }
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (audienceWindow && !audienceWindow.isDestroyed()) audienceWindow.close();
    if (stageWindow && !stageWindow.isDestroyed()) stageWindow.close();
    if (videowallWindow && !videowallWindow.isDestroyed()) videowallWindow.close();
  });
}

function resolveAudienceTargetDisplay(displayId) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  if (displayId !== undefined && displayId !== null && displayId !== '') {
    const byId = displays.find(d => String(d.id) === String(displayId));
    if (byId) return byId;

    const parsedIndex = Number(displayId);
    if (Number.isInteger(parsedIndex) && parsedIndex >= 1 && parsedIndex <= displays.length) {
      return displays[parsedIndex - 1];
    }
  }

  return displays.find(d => d.id !== primaryDisplay.id) || displays[0];
}

function openAudienceWindow(displayId) {
  const targetDisplay = resolveAudienceTargetDisplay(displayId);

  if (audienceWindow && !audienceWindow.isDestroyed()) {
    if (targetDisplay && displayId !== undefined && displayId !== null && displayId !== '') {
      try {
        audienceWindow.setFullScreen(false);
        audienceWindow.setBounds({
          x: targetDisplay.bounds.x,
          y: targetDisplay.bounds.y,
          width: targetDisplay.bounds.width,
          height: targetDisplay.bounds.height
        });
        audienceWindow.setFullScreen(true);
      } catch (e) {}
    }
    audienceWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audience-status-changed', true);
    }
    return true;
  }

  const displays = screen.getAllDisplays();

  audienceWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: displays.length > 1 || Boolean(displayId),
    frame: false,
    autoHideMenuBar: true,
    title: "CapyWorship - Salida Audiencia (OBS / Proyector)",
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  audienceWindow.maximize();

  audienceWindow.webContents.on('did-finish-load', () => {
    if (lastBroadcastState && audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.webContents.send('broadcast-update', lastBroadcastState);
    }
  });

  if (isDev) {
    audienceWindow.loadURL(`${DEV_URL}/audience.html`).catch(() => {
      if (audienceWindow && !audienceWindow.isDestroyed()) {
        audienceWindow.loadFile(path.join(__dirname, 'dist/audience.html'));
      }
    });
  } else {
    audienceWindow.loadFile(path.join(__dirname, 'dist/audience.html'));
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audience-status-changed', true);
  }

  audienceWindow.on('closed', () => {
    audienceWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('audience-status-changed', false);
    }
  });

  return true;
}

function closeAudienceWindow() {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.close();
  }
  audienceWindow = null;
  return false;
}


function openStageWindow() {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  // Target display 3 if available, otherwise display 2 or 1
  const targetDisplay = displays[2] || displays[1] || displays[0];

  stageWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: displays.length > 2,
    frame: false,
    autoHideMenuBar: true,
    title: "CapyWorship - Stage Display (Monitor Orador)",
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  if (isDev) {
    stageWindow.loadURL(`${DEV_URL}/stage.html`).catch(() => {
      stageWindow.loadFile(path.join(__dirname, 'dist/stage.html'));
    });
  } else {
    stageWindow.loadFile(path.join(__dirname, 'dist/stage.html'));
  }

  stageWindow.on('closed', () => {
    stageWindow = null;
  });
}

function resolveTargetDisplay(displayId) {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  if (displayId !== undefined && displayId !== null && displayId !== '') {
    const byId = displays.find(d => String(d.id) === String(displayId));
    if (byId) return byId;

    const parsedIndex = Number(displayId);
    if (Number.isInteger(parsedIndex) && parsedIndex >= 1 && parsedIndex <= displays.length) {
      return displays[parsedIndex - 1];
    }
  }

  // Fallback: Monitor 3 si existe, sino Monitor secundario, sino Monitor principal
  const secondaryDisplays = displays.filter(d => d.id !== primaryDisplay.id);
  return secondaryDisplays[1] || secondaryDisplays[0] || displays[0];
}

function openVideowallWindow(displayId) {
  const targetDisplay = resolveTargetDisplay(displayId);

  if (videowallWindow && !videowallWindow.isDestroyed()) {
    if (targetDisplay && displayId !== undefined && displayId !== null && displayId !== '') {
      try {
        videowallWindow.setFullScreen(false);
        videowallWindow.setBounds({
          x: targetDisplay.bounds.x,
          y: targetDisplay.bounds.y,
          width: targetDisplay.bounds.width,
          height: targetDisplay.bounds.height
        });
        videowallWindow.setFullScreen(true);
      } catch (e) {}
    }
    videowallWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('videowall-status-changed', true);
    }
    return true;
  }

  videowallWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    title: "CapyWorship - Salida Videowall (Solo Videos)",
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  videowallWindow.webContents.on('did-finish-load', () => {
    if (lastBroadcastState && videowallWindow && !videowallWindow.isDestroyed()) {
      videowallWindow.webContents.send('broadcast-update', lastBroadcastState);
    }
  });

  if (isDev) {
    videowallWindow.loadURL(`${DEV_URL}/videowall.html`).catch(() => {
      if (videowallWindow && !videowallWindow.isDestroyed()) {
        videowallWindow.loadFile(path.join(__dirname, 'dist/videowall.html'));
      }
    });
  } else {
    videowallWindow.loadFile(path.join(__dirname, 'dist/videowall.html'));
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('videowall-status-changed', true);
  }

  videowallWindow.on('closed', () => {
    videowallWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('videowall-status-changed', false);
    }
  });

  return true;
}

function closeVideowallWindow() {
  if (videowallWindow && !videowallWindow.isDestroyed()) {
    videowallWindow.close();
  }
  videowallWindow = null;
  return false;
}

// Electron IPC Events Handling
ipcMain.on('open-audience-window', (_event, displayId) => openAudienceWindow(displayId));
ipcMain.handle('open-audience-window', (_event, displayId) => openAudienceWindow(displayId));
ipcMain.on('close-audience-window', () => closeAudienceWindow());
ipcMain.handle('close-audience-window', () => closeAudienceWindow());
ipcMain.on('open-stage-window', () => openStageWindow());
ipcMain.handle('is-audience-open', () => !!(audienceWindow && !audienceWindow.isDestroyed()));

ipcMain.on('open-videowall', (_event, displayId) => openVideowallWindow(displayId));
ipcMain.handle('open-videowall', (_event, displayId) => openVideowallWindow(displayId));
ipcMain.on('close-videowall', () => closeVideowallWindow());
ipcMain.handle('close-videowall', () => closeVideowallWindow());
ipcMain.handle('is-videowall-open', () => !!(videowallWindow && !videowallWindow.isDestroyed()));

ipcMain.on('focus-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => app.quit());

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d, index) => ({
    id: d.id,
    index: index + 1,
    bounds: d.bounds,
    isPrimary: d.id === screen.getPrimaryDisplay().id
  }));
});

// Native Windows File Selector Dialog
ipcMain.handle('select-media-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleccionar Archivos de Video o Imágenes",
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Archivos Multimedia', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav'] },
      { name: 'Todos los Archivos', extensions: ['*'] }
    ]
  });

  if (result.canceled) return [];
  return result.filePaths.map(filePath => {
    const name = path.basename(filePath);
    return {
      name,
      filePath,
      url: `file:///${filePath.replace(/\\/g, '/')}`
    };
  });
});

// Physical Disk Folders Real-Time Watching & Synchronization
const MEDIA_EXT_REGEX = /\.(mp4|webm|mov|avi|mkv|png|jpg|jpeg|gif|webp|svg|bmp)$/i;
const IMAGE_EXT_REGEX = /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i;
const physicalFolderWatchers = new Map();

async function scanPhysicalFolder(folderPath) {
  try {
    if (!folderPath) return [];
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (entry.isFile() && MEDIA_EXT_REGEX.test(entry.name)) {
        const fullPath = path.join(folderPath, entry.name);
        const isImg = IMAGE_EXT_REGEX.test(entry.name);
        files.push({
          name: entry.name,
          filePath: fullPath,
          url: `file:///${fullPath.replace(/\\/g, '/')}`,
          type: isImg ? 'image/png' : 'video/mp4'
        });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return files;
  } catch (err) {
    console.warn('[PhysicalFolder] Error scanning folder:', folderPath, err.message);
    return [];
  }
}

function unwatchPhysicalFolder(folderPath) {
  const existing = physicalFolderWatchers.get(folderPath);
  if (existing) {
    if (existing.watcher) {
      try { existing.watcher.close(); } catch (e) { }
    }
    if (existing.debounceTimer) {
      clearTimeout(existing.debounceTimer);
    }
    if (existing.pollInterval) {
      clearInterval(existing.pollInterval);
    }
    physicalFolderWatchers.delete(folderPath);
  }
}

async function watchPhysicalFolder(folderPath) {
  if (!folderPath) return [];
  try {
    await fs.promises.access(folderPath);
  } catch {
    return [];
  }
  unwatchPhysicalFolder(folderPath);

  const folderName = path.basename(folderPath) || folderPath;
  let lastFilesSignature = '';
  let isScanning = false;

  const emitIfChanged = async (force = false) => {
    if (isScanning) return [];
    isScanning = true;
    try {
      const files = await scanPhysicalFolder(folderPath);
      const sig = files.map(f => f.name).join('|');
      if (force || sig !== lastFilesSignature) {
        lastFilesSignature = sig;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('physical-folder-updated', {
            path: folderPath,
            name: folderName,
            folderPath,
            folderName,
            files
          });
        }
      }
      return files;
    } finally {
      isScanning = false;
    }
  };

  const initialFiles = await scanPhysicalFolder(folderPath);
  lastFilesSignature = initialFiles.map(f => f.name).join('|');

  let watcher = null;
  const record = { watcher: null, debounceTimer: null, pollInterval: null };

  try {
    watcher = fs.watch(folderPath, { persistent: false }, () => {
      if (record.debounceTimer) clearTimeout(record.debounceTimer);
      record.debounceTimer = setTimeout(() => {
        emitIfChanged(false);
      }, 280);
    });
    watcher.on('error', () => { });
    record.watcher = watcher;
  } catch (e) {
    console.warn('[PhysicalFolder] fs.watch fallback to polling for:', folderPath);
  }

  // Lightweight polling backup so external drives / bulk copy operations never miss an update
  record.pollInterval = setInterval(() => {
    emitIfChanged(false);
  }, 3000);

  physicalFolderWatchers.set(folderPath, record);
  return initialFiles;
}

ipcMain.handle('select-physical-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Vincular Carpeta Física de Medios (Actualización en Tiempo Real)",
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  const folderName = path.basename(folderPath) || folderPath;
  const files = await watchPhysicalFolder(folderPath);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }

  return {
    path: folderPath,
    name: folderName,
    folderPath,
    folderName,
    files
  };
});

ipcMain.handle('sync-physical-folders', async (event, folderPaths) => {
  if (!Array.isArray(folderPaths)) return [];
  const synced = [];
  for (const rawPath of folderPaths) {
    if (!rawPath || typeof rawPath !== 'string') continue;
    let exists = false;
    try {
      await fs.promises.access(rawPath);
      exists = true;
    } catch {
      exists = false;
    }
    const folderName = path.basename(rawPath) || rawPath;
    const files = exists ? await watchPhysicalFolder(rawPath) : [];
    synced.push({
      path: rawPath,
      name: folderName,
      folderPath: rawPath,
      folderName,
      exists,
      files
    });
  }
  return synced;
});

ipcMain.handle('unwatch-physical-folder', async (event, folderPath) => {
  if (folderPath) {
    unwatchPhysicalFolder(folderPath);
  }
  return true;
});

// =========================================================================
// IMPORTACIÓN NATIVA DE PRESENTACIONES (PPTX / PPT / PPSX / ODP / PDF)
// =========================================================================
ipcMain.handle('select-presentation-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar Presentación (PowerPoint / Impress / PDF)',
    properties: ['openFile'],
    filters: [
      { name: 'Presentaciones y PDF', extensions: SUPPORTED_EXTENSIONS },
      { name: 'PowerPoint / Impress', extensions: ['pptx', 'ppt', 'ppsx', 'pps', 'pptm', 'potx', 'odp'] },
      { name: 'Documento PDF', extensions: ['pdf'] }
    ]
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    name: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath))
  };
});

ipcMain.handle('get-presentation-engines', async () => {
  try {
    return await getPresentationImporter().getEngines();
  } catch {
    return { powerpoint: false, libreoffice: false, pdf: true };
  }
});

ipcMain.handle('import-presentation-file', async (_event, filePath) => {
  try {
    const importer = getPresentationImporter();
    const res = await importer.importFile(filePath, {
      onProgress: (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('presentation-import-progress', payload);
        }
      }
    });
    return { ok: true, ...res };
  } catch (err) {
    return {
      ok: false,
      code: err?.code || 'IMPORT_ERROR',
      error: err?.message || 'Error al importar la presentación.'
    };
  }
});

ipcMain.handle('save-presentation-slide-image', async (_event, { assetId, index, data } = {}) => {
  try {
    const saved = await getPresentationImporter().saveSlideImage(assetId, index, data);
    return { ok: true, ...saved };
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo guardar la imagen de la diapositiva.' };
  }
});

ipcMain.handle('cancel-presentation-import', () => {
  try {
    return getPresentationImporter().cancel();
  } catch {
    return false;
  }
});

ipcMain.handle('delete-presentation-assets', async (_event, assetId) => {
  try {
    return await getPresentationImporter().deleteAssets(assetId);
  } catch {
    return false;
  }
});

// Real-Time High Performance Local IPC Broadcast Synchronization
ipcMain.on('broadcast-update', (event, state) => {
  lastBroadcastState = state;
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('broadcast-update', state);
  }
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.webContents.send('broadcast-update', state);
  }
  if (videowallWindow && !videowallWindow.isDestroyed()) {
    videowallWindow.webContents.send('broadcast-update', state);
  }
  if (localAudienceServer) {
    localAudienceServer.broadcastState(state);
  }
});

ipcMain.handle('get-app-settings', () => appSettings);
ipcMain.handle('get-audience-server-info', () => (localAudienceServer ? localAudienceServer.getInfo() : null));

// Splash Banner Startup IPC
ipcMain.on('splash-status', (_event, payload) => {
  if (payload && payload.message) {
    sendSplashStatus(payload.message, payload.progress);
  }
});

ipcMain.on('app-ready', () => {
  revealMainWindow();
});

app.whenReady().then(() => {
  const extraSettingsPaths = [
    process.resourcesPath ? path.join(process.resourcesPath, 'appsettings.json') : null,
    path.join(app.getPath('userData'), 'appsettings.json')
  ].filter(Boolean);
  appSettings = loadAppSettings(__dirname, extraSettingsPaths);

  const rawPort = appSettings?.AudienceServer?.Port ?? appSettings?.audienceServer?.port ?? appSettings?.httpPort;
  const parsedPort = Number.parseInt(rawPort, 10);
  const audienceServerPort = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 3456;
  const audienceServerHost = appSettings?.AudienceServer?.Host || '127.0.0.1';

  const distDir = path.join(__dirname, 'dist');
  const preferDist = !isDev || app.isPackaged || !fs.existsSync(path.join(__dirname, 'audience.html'));
  const staticRootDir = preferDist && fs.existsSync(distDir) ? distDir : __dirname;
  const staticFallbackDir = staticRootDir === distDir ? __dirname : (fs.existsSync(distDir) ? distDir : null);

  localAudienceServer = new LocalAudienceServer({
    host: audienceServerHost,
    port: audienceServerPort,
    rootDir: staticRootDir,
    fallbackRootDir: staticFallbackDir
  });
  localAudienceServer.start();

  isMainRevealed = false;
  createSplashWindow();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      isMainRevealed = false;
      createSplashWindow();
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  if (localAudienceServer) {
    localAudienceServer.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
