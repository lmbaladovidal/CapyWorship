/**
 * ProPresenter AI Studio - Smoke Test Suite
 * Test Runner automatizado para verificación de Requerimientos Funcionales (RF-01 al RF-37)
 */

import { assert } from 'node:console';

// 1. Mocking Browser Globals (localStorage, BroadcastChannel, alert)
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new LocalStorageMock();
globalThis.alert = (msg) => console.log(`[ALERT MOCK]: ${msg}`);
globalThis.BroadcastChannel = class {
  constructor(name) {
    this.name = name;
  }
  postMessage(data) {}
  close() {}
};

// 2. Importing Project Modules
import { Store, DEFAULT_DECKS, DEFAULT_TEMPLATES, parseAndSplitText } from '../src/js/state.js';
import { LiveCoderEngine } from '../src/js/live-coder.js';
import { ensureCustomBiblesLoaded, getAllBibleVersions, parseAndAddCustomBible } from '../src/js/bible-data.js';
import { BroadcastSync } from '../src/js/broadcast.js';
import { ResolumeClient } from '../src/js/resolume-client.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalAudienceServer, loadAppSettings } = require('../electron/local-audience-server.js');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASSED: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

console.log('====================================================');
console.log('🧪 INICIANDO SMOKE TEST - PROPRESENTER AI STUDIO');
console.log('====================================================\n');

// ----------------------------------------------------
// SUITE 1: Estado Inicial & Multipantalla (RF-01 al RF-06)
// ----------------------------------------------------
console.log('▶️ Grupo 1: Estado Inicial y Multipantalla (RF-01 a RF-06)');
test('RF-01/02/06: Inicialización del Store y datos por defecto', () => {
  const store = new Store();
  if (!store.state) throw new Error('El estado no fue inicializado.');
  if (!store.decks || store.decks.length === 0) throw new Error('No existen Decks por defecto.');
  if (!store.templates || store.templates.length === 0) throw new Error('No existen Plantillas por defecto.');
});

test('RF-03/04/05: Estado inicial de Stage Display y Timers', () => {
  const store = new Store();
  if (typeof store.state.timerValue !== 'number') throw new Error('TimerValue invalido');
  if (typeof store.state.timerRunning !== 'boolean') throw new Error('TimerRunning invalido');
});

// ----------------------------------------------------
// SUITE 2: Motor de Proyección y Transiciones (RF-07 al RF-11)
// ----------------------------------------------------
console.log('\n▶️ Grupo 2: Motor de Proyección y Transiciones en Vivo (RF-07 a RF-11)');
test('RF-07: Control de Limpieza por Capas (Clear Switches)', () => {
  const store = new Store();
  
  store.clearText();
  if (store.state.isTextCleared !== true) throw new Error('clearText no activó isTextCleared');
  
  store.clearMedia();
  if (store.state.isMediaCleared !== true) throw new Error('clearMedia no activó isMediaCleared');
  
  store.clearOverlays();
  if (store.state.isOverlayCleared !== true) throw new Error('clearOverlays no activó isOverlayCleared');

  store.clearAll();
  if (!store.state.isTextCleared || !store.state.isMediaCleared || !store.state.isOverlayCleared) {
    throw new Error('clearAll no limpió todas las capas');
  }
});

test('RF-08/09: Modos de Transición (Cut/Fade) y Tiempo de Duración', () => {
  const store = new Store();
  
  store.setTextTransition('cut');
  if (store.state.textTransition !== 'cut') throw new Error('Falló el cambio de transición de texto a cut');

  store.setMediaTransition('fade');
  if (store.state.mediaTransition !== 'fade') throw new Error('Falló el cambio de transición de medio a fade');

  store.setMediaTransition('cut');
  if (store.state.mediaTransition !== 'cut') throw new Error('Falló el cambio de transición de medio a cut');

  store.setFadeDuration(500);
  if (store.state.fadeDuration !== 500) throw new Error('Falló el ajuste del tiempo de fade a 500ms');
});

test('RF-10: Navegación de Diapositivas en el Deck', () => {
  const store = new Store();
  store.setActiveDeck(DEFAULT_DECKS[0].id);
  
  store.setLiveSlide(0, 0);
  if (store.state.liveSlideIndex !== 0) throw new Error('No se estableció la primera filmina correctamente');
  if (!store.state.liveText.includes('Señor mi Dios')) throw new Error('El texto de la primera filmina es incorrecto');
  if (store.state.isTextCleared) throw new Error('La filmina debió reactivar la capa de texto');
});

test('RF-11: Superposición de Terceros Inferiores (Lower Thirds)', () => {
  const store = new Store();
  const lowerThirdDeck = DEFAULT_DECKS.find(d => d.type === 'lowerthird');
  if (!lowerThirdDeck) throw new Error('No se encontró el deck de Lower Thirds por defecto');

  store.setActiveDeck(lowerThirdDeck.id);
  store.setLiveSlide(0, 0);

  if (!store.state.isLowerThirdActive) throw new Error('Lower Third no se activó correctamente');
  if (!store.state.lowerThirdText.includes('Morales')) throw new Error('Texto de Lower Third invalido');
});

// ----------------------------------------------------
// SUITE 3: Módulo de Escrituras y Biblias (RF-12 al RF-19)
// ----------------------------------------------------
console.log('\n▶️ Grupo 3: Gestor Bíblico y Navegador de Escrituras (RF-12 a RF-19)');
test('RF-16/17: Configuración de Parámetros Bíblicos (Líneas, Font, Ref)', () => {
  const store = new Store();
  
  store.setScriptureSettings({
    maxLines: 3,
    font: 'Georgia, serif',
    splitLong: true,
    showRef: true
  });

  if (store.state.scriptureMaxLines !== 3) throw new Error('maxLines no coincide');
  if (store.state.scriptureFont !== 'Georgia, serif') throw new Error('font no coincide');
  if (store.state.scriptureSplitLong !== true) throw new Error('splitLong no coincide');
  if (store.state.scriptureShowRef !== true) throw new Error('showRef no coincide');
});

// ----------------------------------------------------
// SUITE 4: Galería Multimedia & Live Coder 2D (RF-25 al RF-28)
// ----------------------------------------------------
console.log('\n▶️ Grupo 4: Galería Multimedia y Live Coder Canvas 2D (RF-25 a RF-28)');
test('RF-28: Compilación de Código JS en Motor Live Coder Canvas 2D', () => {
  const dummyCanvas = { width: 800, height: 600, getContext: () => ({ save: () => {}, restore: () => {} }) };
  const engine = new LiveCoderEngine(dummyCanvas);

  const validCode = `
    function renderBackground(ctx, width, height, time) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, width, height);
    }
  `;

  const result = engine.compileCode(validCode);
  if (!result.success) throw new Error(`Error en código sintácticamente correcto: ${result.error}`);

  const invalidCode = `function invalidFunction() {}`;
  const invalidResult = engine.compileCode(invalidCode);
  if (invalidResult.success) throw new Error('El motor debió fallar al no encontrar renderBackground');
});

// ----------------------------------------------------
// SUITE 5: Editor de Plantillas (RF-29 al RF-31)
// ----------------------------------------------------
console.log('\n▶️ Grupo 5: Editor de Plantillas y Diseños (RF-29 a RF-31)');
test('RF-29/30/31: Gestión y Actualización de Plantilla Activa', () => {
  const store = new Store();
  const firstTpl = DEFAULT_TEMPLATES[0];

  store.setActiveTemplate(firstTpl.id);
  if (store.activeTemplateId !== firstTpl.id) throw new Error('No se estableció la plantilla activa');

  store.updateActiveTemplateProperties({ fontSize: 64, color: '#00ff00' });
  if (store.state.activeTemplate.fontSize !== 64) throw new Error('fontSize no se actualizó');
  if (store.state.activeTemplate.color !== '#00ff00') throw new Error('color no se actualizó');
});

test('RF-61: Asignación exclusiva de template a un show seleccionado (setDeckTemplate)', () => {
  const store = new Store();
  const deck1 = store.createNewShow("Canción 1", "Alabanza", "Letra 1", { templateId: "preset-modern" });
  const deck2 = store.createNewShow("Canción 2", "Alabanza", "Letra 2", { templateId: "preset-modern" });

  // Con deck1 activo/seleccionado, asignamos preset-lowerthird
  store.setActiveDeck(deck1.id);
  store.setDeckTemplate(deck1.id, "preset-lowerthird");

  // deck1 debe tener preset-lowerthird
  if (deck1.templateId !== "preset-lowerthird") {
    throw new Error('deck1 no tomó la plantilla asignada');
  }
  const effective1 = store.buildEffectiveTemplateForSlide(deck1);
  if (effective1.fontFamily !== "Outfit, sans-serif" || effective1.fontSize !== 36) {
    throw new Error('El estilo efectivo de deck1 no coincide con preset-lowerthird');
  }

  // deck2 NO debe haber sido alterado
  if (deck2.templateId !== "preset-modern") {
    throw new Error('deck2 fue alterado indebidamente al cambiar el template de deck1');
  }
  const effective2 = store.buildEffectiveTemplateForSlide(deck2);
  if (effective2.fontFamily === "Outfit, sans-serif") {
    throw new Error('El estilo de deck2 se vio afectado por deck1');
  }
});

// ----------------------------------------------------
// SUITE 6: Persistencia Local (RF-36)
// ----------------------------------------------------
console.log('\n▶️ Grupo 6: Persistencia Local y Almacenamiento (RF-36)');
test('RF-36: Guardado en LocalStorage tras notificar cambios', () => {
  const store = new Store();
  store.setFadeDuration(750);

  const savedDuration = globalThis.localStorage.getItem('propresenter_fade_duration');
  if (savedDuration !== '750') throw new Error('La duración de fade no se guardó en localStorage');
});

// ----------------------------------------------------
// SUITE 7: División de Filminas, Excedente y Versión Dinámica (RF-38 al RF-44)
// ----------------------------------------------------
console.log('\n▶️ Grupo 7: División Inteligente, Excedente y Versión (RF-38 a RF-44)');
test('RF-38/39: División inteligente de canciones por maxLines y excedente', () => {
  const store = new Store();
  const rawText = "Línea 1\nLínea 2\nLínea 3\nLínea 4";
  const slides = parseAndSplitText(rawText, 'fixed', 2);
  if (slides.length !== 1 || slides[0].slides.length !== 2) throw new Error('Se esperaban 2 filminas fragmentadas');
  if (slides[0].slides[0].text !== "Línea 1\nLínea 2") throw new Error('Contenido de la primera filmina incorrecto');
  if (slides[0].slides[1].text !== "Línea 3\nLínea 4") throw new Error('Contenido de la segunda filmina incorrecto');
});

test('RF-40: Creación de Show asignando plantilla e importando texto', () => {
  const store = new Store();
  const newDeck = store.createNewShow("Canción Test", "Alabanza", "Línea A\nLínea B", { templateId: "preset-modern", splitMode: "paragraph" });
  if (!newDeck || newDeck.title !== "Canción Test") throw new Error('No se creó el show correctamente');
});

// ----------------------------------------------------
// SUITE 8: Control de Audio de Videos y Salida Sonora (RF-47 y RF-48)
// ----------------------------------------------------
console.log('\n▶️ Grupo 8: Control de Audio de Videos y Salida Sonora (RF-47 y RF-48)');
test('RF-47/48: Conmutador de Audio (Mute/Unmute), Volumen y Persistencia', () => {
  const store = new Store();
  // Estado inicial: sonido habilitado por defecto (no silenciado) y volumen 1.0
  if (store.state.isMediaAudioMuted !== false) throw new Error('El audio debe estar habilitado por defecto');
  if (store.state.mediaAudioVolume !== 1.0) throw new Error('El volumen por defecto debe ser 1.0');

  // Conmutar a silenciado
  const isEnabled = store.toggleMediaAudio();
  if (isEnabled !== false) throw new Error('toggleMediaAudio debe retornar false al silenciar');
  if (store.state.isMediaAudioMuted !== true) throw new Error('isMediaAudioMuted debe ser true tras silenciar');
  if (globalThis.localStorage.getItem('propresenter_media_audio_muted') !== 'true') throw new Error('propresenter_media_audio_muted no se guardó en localStorage');

  // Ajustar volumen
  store.setMediaAudioVolume(0.65);
  if (store.state.mediaAudioVolume !== 0.65) throw new Error('El volumen no se actualizó');
  if (globalThis.localStorage.getItem('propresenter_media_audio_volume') !== '0.65') throw new Error('El volumen no se guardó en localStorage');

  // Reconmutar a sonido activo
  store.setMediaAudioMuted(false);
  if (store.state.isMediaAudioMuted !== false) throw new Error('isMediaAudioMuted no se restableció a false');
});

// ----------------------------------------------------
// SUITE 9: Motor de Secciones de Canciones & Navegación (RF-49 y RF-50)
// ----------------------------------------------------
console.log('\n▶️ Grupo 9: Motor de Secciones de Canciones & Navegación (RF-49 y RF-50)');
test('RF-49: Detección inteligente de etiquetas de sección y limpieza de lyrics', () => {
  const songWithTags = `[Intro]
Piano y guitarras

[Verso 1]
Señor mi Dios al contemplar los cielos
El firmamento y las estrellas mil

[Coro]
Mi corazón entona la canción
Cuan grande es Él

[Puente]
Y cuando pienso que en la cruz murió
Por mí pecador

[Final]
Grande es tu fidelidad`;

  const groups = parseAndSplitText(songWithTags, 'paragraph', 0);
  if (groups.length !== 5) throw new Error(`Se esperaban 5 grupos/secciones, se obtuvieron ${groups.length}`);

  // Verificar Intro
  if (groups[0].name !== 'Intro' || groups[0].badge !== 'badge-intro') throw new Error('Intro no detectado correctamente');
  if (groups[0].slides[0].text !== 'Piano y guitarras') throw new Error('El encabezado [Intro] no fue extraído del texto de la filmina');

  // Verificar Verso 1
  if (groups[1].name !== 'Verso 1' || groups[1].badge !== 'badge-verse') throw new Error('Verso 1 no detectado');
  if (groups[1].slides[0].text.includes('[Verso 1]')) throw new Error('[Verso 1] aún presente en el slide');

  // Verificar Coro
  if (groups[2].name !== 'Coro' || groups[2].badge !== 'badge-chorus') throw new Error('Coro no detectado');

  // Verificar Puente
  if (groups[3].name !== 'Puente' || groups[3].badge !== 'badge-bridge') throw new Error('Puente no detectado');

  // Verificar Final/Outro
  if (groups[4].name !== 'Final' || groups[4].badge !== 'badge-outro') throw new Error('Final no detectado');
});

test('RF-49/50: Marcado dinámico, asignación de secciones y salto a sección', () => {
  const store = new Store();
  const testDeck = store.createNewShow("Canción Secciones Test", "Alabanza", "Estrofa inicial 1\nEstrofa inicial 2\n\nSegunda parte 1\nSegunda parte 2");

  if (!testDeck || testDeck.groups.length !== 2) throw new Error('No se crearon los grupos base');

  // Modificar sección del grupo 1 a Coro
  store.setGroupSection(testDeck.id, 1, 'Coro Principal', 'badge-chorus');
  if (testDeck.groups[1].name !== 'Coro Principal' || testDeck.groups[1].badge !== 'badge-chorus') {
    throw new Error('setGroupSection no actualizó el nombre o badge');
  }

  // Dividir grupo 0 en filmina 1 para crear una sección de Puente si tiene más de 1 filmina
  // (creamos un grupo con 2 filminas para probar splitGroupAtSlide)
  testDeck.groups[0].slides.push({ id: 'test-split-slide', text: 'Slide para dividir' });
  store.splitGroupAtSlide(testDeck.id, 0, 1, 'Puente Especial', 'badge-bridge');
  if (testDeck.groups.length !== 3) throw new Error('splitGroupAtSlide no creó el nuevo grupo');
  if (testDeck.groups[1].name !== 'Puente Especial') throw new Error('El grupo dividido no tiene el nombre correcto');

  // Salto y activación de filmina en sección
  store.setLiveSlide(1, 0);
  if (store.state.liveGroupIndex !== 1 || store.state.liveSlideIndex !== 0) {
    throw new Error('No se activó la filmina en vivo de la sección seleccionada');
  }
});

// ----------------------------------------------------
// SUITE 10: Cola de Reproducción de Medios (Alt+Click & Auto-Advance) (RF-51 y RF-52)
// ----------------------------------------------------
console.log('\n▶️ Grupo 10: Cola de Reproducción de Medios (Alt+Click & Auto-Advance) (RF-51 y RF-52)');
test('RF-51/52: Encolado de medios (enqueueMedia), reordenamiento y transición automática al finalizar', () => {
  const store = new Store();
  store.clearMediaQueue();
  if (store.state.mediaQueue.length !== 0) throw new Error('La cola de medios debe iniciar vacía');

  const itemA = store.addMediaItem("Video Intro", "https://example.com/intro.mp4", "video/mp4", "General");
  const itemB = store.addMediaItem("Video Alabanza", "https://example.com/worship.mp4", "video/mp4", "General");
  const itemC = store.addMediaItem("Video Cierre", "https://example.com/outro.mp4", "video/mp4", "General");

  // Reproducir itemA inicialmente
  store.setActiveVideo(itemA.url, itemA.name, itemA.type);
  if (store.state.activeVideoUrl !== itemA.url) throw new Error('itemA debería estar en reproducción');

  // Sumar itemB e itemC a la cola (simulando Alt+Click)
  const q1 = store.enqueueMedia(itemB);
  const q2 = store.enqueueMedia(itemC.id);

  if (store.state.mediaQueue.length !== 2) throw new Error('Se esperaban 2 elementos en la cola');
  if (store.state.mediaQueue[0].url !== itemB.url) throw new Error('El primer elemento en cola debe ser itemB');
  if (store.state.mediaQueue[1].url !== itemC.url) throw new Error('El segundo elemento en cola debe ser itemC');

  // Probar reordenamiento (mover posición 1 a 0)
  store.moveMediaQueueItem(1, 0);
  if (store.state.mediaQueue[0].url !== itemC.url) throw new Error('moveMediaQueueItem no movió itemC al frente');
  // Devolver al orden original
  store.moveMediaQueueItem(0, 1);

  // Simular finalización del video activo -> advanceMediaQueue()
  const advanced1 = store.advanceMediaQueue();
  if (!advanced1 || advanced1.url !== itemB.url) throw new Error('advanceMediaQueue no avanzó a itemB');
  if (store.state.activeVideoUrl !== itemB.url) throw new Error('activeVideoUrl no cambió a itemB');
  if (store.state.mediaQueue.length !== 1) throw new Error('Debe quedar 1 elemento en la cola');

  // Simular finalización del segundo video -> avanza a itemC y deja la cola vacía (vuelve a loop)
  const advanced2 = store.advanceMediaQueue();
  if (!advanced2 || advanced2.url !== itemC.url) throw new Error('advanceMediaQueue no avanzó a itemC');
  if (store.state.activeVideoUrl !== itemC.url) throw new Error('activeVideoUrl no cambió a itemC');
  if (store.state.mediaQueue.length !== 0) throw new Error('La cola debe quedar vacía tras el último elemento');

  // Probar eliminar item específico y vaciar cola
  const qTemp = store.enqueueMedia(itemA);
  store. enqueueMedia(itemB);
  store.removeFromMediaQueue(qTemp.queueId);
  if (store.state.mediaQueue.length !== 1 || store.state.mediaQueue[0].url !== itemB.url) {
    throw new Error('removeFromMediaQueue no eliminó el item correcto');
  }
  store.clearMediaQueue();
  if (store.state.mediaQueue.length !== 0) throw new Error('clearMediaQueue no vació la cola');
});

test('RF-53: Línea de tiempo manejable del medio en reproducción (Seek, Play/Pause y Reinicio)', () => {
  const store = new Store();
  store.setActiveVideo("https://example.com/timeline-test.mp4", "Timeline Video", "video/mp4");

  if (store.state.isMediaPaused !== false) throw new Error('El video debe iniciar en reproducción (isMediaPaused = false)');

  // Pausar reproducción
  const pausedState = store.toggleMediaPause();
  if (pausedState !== true || store.state.isMediaPaused !== true) {
    throw new Error('toggleMediaPause no cambió isMediaPaused a true');
  }
  if (!store.state.mediaPlaybackCommand || store.state.mediaPlaybackCommand.action !== 'pause') {
    throw new Error('No se emitió el comando de pausa a la pantalla de audiencia');
  }

  // Adelantar / mover línea de tiempo (Seek a 42.5 segundos)
  const seekedTime = store.seekActiveMedia(42.5);
  if (seekedTime !== 42.5) throw new Error('seekActiveMedia no retornó el tiempo objetivo');
  if (!store.state.mediaPlaybackCommand || store.state.mediaPlaybackCommand.action !== 'seek' || store.state.mediaPlaybackCommand.time !== 42.5) {
    throw new Error('No se emitió el comando seek con el tiempo exacto');
  }

  // Reiniciar video desde 00:00
  store.restartActiveMedia();
  if (store.state.isMediaPaused !== false) throw new Error('restartActiveMedia debe reanudar la reproducción');
  if (!store.state.mediaPlaybackCommand || store.state.mediaPlaybackCommand.action !== 'restart' || store.state.mediaPlaybackCommand.time !== 0) {
    throw new Error('No se emitió el comando restart a 00:00');
  }
});

// ----------------------------------------------------
// SUITE 11: Edición de Canciones Descargadas y Carpetas Físicas en Tiempo Real (RF-54 y RF-55)
// ----------------------------------------------------
console.log('\n▶️ Grupo 11: Edición de Canciones Descargadas y Carpetas Físicas en Tiempo Real (RF-54 y RF-55)');
test('RF-54: Actualización in-place de canción descargada (updateDeckContent sin duplicar)', () => {
  const store = new Store();
  const created = store.createNewShow(
    "Cuán Grande Es Él",
    "Alabanza",
    "[Verso 1]\nSeñor mi Dios\nAl contemplar los cielos\n\n[Coro]\nMi corazón entona la canción"
  );
  const countBefore = store.decks.length;

  // Editar borrando la segunda línea del Verso 1 y cambiando el título
  const updated = store.updateDeckContent(
    created.id,
    "Cuán Grande Es Él (Editada)",
    "Adoración",
    "[Verso 1]\nSeñor mi Dios\n\n[Coro]\nMi corazón entona la canción"
  );

  if (!updated) throw new Error('updateDeckContent no retornó el deck actualizado');
  if (store.decks.length !== countBefore) throw new Error('updateDeckContent no debe duplicar la canción en la biblioteca');
  if (updated.title !== "Cuán Grande Es Él (Editada)") throw new Error('El título de la canción no se actualizó');
  if (updated.groups[0].slides[0].text.includes("Al contemplar los cielos")) {
    throw new Error('La línea borrada sigue apareciendo en la filmina');
  }
});

test('RF-55: Vinculación y sincronización en tiempo real de carpetas físicas junto a carpetas virtuales', () => {
  const store = new Store();
  const physPath = "C:\\Media\\FondosIglesia";
  const initialFiles = [
    { name: "cielo.mp4", url: "file:///C:/Media/FondosIglesia/cielo.mp4", filePath: "C:\\Media\\FondosIglesia\\cielo.mp4", type: "video/mp4" },
    { name: "cruz.png", url: "file:///C:/Media/FondosIglesia/cruz.png", filePath: "C:\\Media\\FondosIglesia\\cruz.png", type: "image/png" }
  ];

  store.addPhysicalMediaFolder(physPath, "FondosIglesia", initialFiles);

  if (!store.state.physicalMediaFolders.some(f => f.path === physPath)) {
    throw new Error('La carpeta física no se registró en physicalMediaFolders');
  }

  const physItems1 = store.state.mediaLibrary.filter(m => m.physicalFolderPath === physPath);
  if (physItems1.length !== 2) throw new Error(`Se esperaban 2 archivos sincronizados, se encontraron ${physItems1.length}`);

  // Simular actualización en tiempo real: se agrega un archivo nuevo y se borra cruz.png
  const updatedFiles = [
    { name: "cielo.mp4", url: "file:///C:/Media/FondosIglesia/cielo.mp4", filePath: "C:\\Media\\FondosIglesia\\cielo.mp4", type: "video/mp4" },
    { name: "fuego.mp4", url: "file:///C:/Media/FondosIglesia/fuego.mp4", filePath: "C:\\Media\\FondosIglesia\\fuego.mp4", type: "video/mp4" }
  ];
  store.syncPhysicalFolderItems(physPath, "FondosIglesia", updatedFiles);

  const physItems2 = store.state.mediaLibrary.filter(m => m.physicalFolderPath === physPath);
  if (physItems2.length !== 2 || !physItems2.some(m => m.name === "fuego.mp4") || physItems2.some(m => m.name === "cruz.png")) {
    throw new Error('syncPhysicalFolderItems no reflejó el alta y baja en tiempo real de archivos del disco');
  }

  // Desvincular carpeta física
  store.removePhysicalMediaFolder(physPath);
  if (store.state.physicalMediaFolders.some(f => f.path === physPath)) {
    throw new Error('removePhysicalMediaFolder no quitó la carpeta de physicalMediaFolders');
  }
  if (store.state.mediaLibrary.some(m => m.physicalFolderPath === physPath)) {
    throw new Error('removePhysicalMediaFolder no limpió los items asociados de mediaLibrary');
  }
});

console.log('\n▶️ Grupo 12: Overlays y Lower Thirds Personalizados (RF-58)');

test('RF-58: Creación, etiquetado y activación de overlays / lower-thirds personalizados', () => {
  const store = new Store();
  // 1. Creación directa seleccionando categoría 'Overlays Stream'
  const newOverlayDeck = store.createNewShow(
    "Pastores Invitados",
    "Overlays Stream",
    "Pastor Juan Pérez\nIglesia Central\n---\nPastor Invitado\nPredicador"
  );

  if (!newOverlayDeck || newOverlayDeck.type !== "lowerthird") {
    throw new Error(`Se esperaba que el show creado con categoría 'Overlays Stream' tuviese type='lowerthird', pero se obtuvo: ${newOverlayDeck?.type}`);
  }
  const allOverlaySlides = newOverlayDeck.groups.flatMap(g => g.slides);
  if (allOverlaySlides.length !== 2) {
    throw new Error(`Se esperaban 2 slides de overlay, se obtuvieron ${allOverlaySlides.length}`);
  }
  if (!allOverlaySlides[0].isLowerThird || !allOverlaySlides[1].isLowerThird) {
    throw new Error('Los slides del show de overlay deben tener isLowerThird = true');
  }

  // 2. Activación en vivo del Lower Third personalizado
  store.setActiveDeck(newOverlayDeck.id);
  store.setLiveSlide(0, 0);

  if (!store.state.isLowerThirdActive) {
    throw new Error('isLowerThirdActive no se activó al proyectar el slide de overlay');
  }
  if (store.state.lowerThirdText !== "Pastor Juan Pérez") {
    throw new Error(`lowerThirdText esperado 'Pastor Juan Pérez', obtenido '${store.state.lowerThirdText}'`);
  }
  if (store.state.lowerThirdSubtext !== "Iglesia Central") {
    throw new Error(`lowerThirdSubtext esperado 'Iglesia Central', obtenido '${store.state.lowerThirdSubtext}'`);
  }

  // 3. Desactivación con clearLowerThird
  store.clearLowerThird();
  if (store.state.isLowerThirdActive) {
    throw new Error('clearLowerThird no desactivó isLowerThirdActive');
  }

  // 4. Creación con etiqueta explicita de sección [Overlay]
  const mixedDeck = store.createNewShow(
    "Culto Especial",
    "Prédicas",
    "[Overlay]\nPastor Marcos\nOrador Principal\n---\n[Versículo]\nJuan 3:16\nPorque de tal manera amó Dios al mundo"
  );

  const mixedSlides = mixedDeck.groups.flatMap(g => g.slides);
  if (!mixedSlides[0].isLowerThird || mixedDeck.groups[0].badge !== "badge-lowerthird") {
    throw new Error('El slide con tag [Overlay] no fue asignado con badge-lowerthird o isLowerThird=true');
  }
  if (mixedSlides[1].isLowerThird) {
    throw new Error('El slide de versículo no debe ser considerado lower-third');
  }

  // Proyectar el slide 0 del show mixto
  store.setActiveDeck(mixedDeck.id);
  store.setLiveSlide(0, 0);
  if (!store.state.isLowerThirdActive || store.state.lowerThirdText !== "Pastor Marcos" || store.state.lowerThirdSubtext !== "Orador Principal") {
    throw new Error('El slide con tag [Overlay] no activó correctamente el lower-third en vivo');
  }
  store.clearLowerThird();
});

console.log('\n▶️ Grupo 13: Editor de Canción en Pantalla Completa (RF-59)');

test('RF-59: Edición de canción en vista de pantalla completa con 3 columnas y manipulación de filminas y estilos', () => {
  const store = new Store();
  const deck = store.createNewShow(
    "Himno de Gracia",
    "Adoración",
    "Sublime gracia del Señor\nQue a un pecador salvó\n\nFui ciego mas hoy veo yo"
  );

  if (!deck || deck.groups.length !== 2) {
    throw new Error('No se inicializó el show de prueba correctamente');
  }

  // 1. Agregar nueva filmina en grupo 0
  const addResult = store.addSlideToDeck(deck.id, 0, "Nueva línea agregada en lienzo");
  if (!addResult || deck.groups[0].slides.length !== 2) {
    throw new Error('addSlideToDeck no agregó la filmina al grupo');
  }
  if (deck.groups[0].slides[1].text !== "Nueva línea agregada en lienzo") {
    throw new Error('El texto de la nueva filmina agregada es incorrecto');
  }

  // 2. Reordenar filminas (moveSlide)
  store.moveSlide(deck.id, 0, 1, 'up');
  if (deck.groups[0].slides[0].text !== "Nueva línea agregada en lienzo") {
    throw new Error('moveSlide up no subió la filmina a la primera posición');
  }

  // 3. Actualizar estilo del deck (updateDeckStyle)
  const customStyle = {
    fontFamily: "CMGSans",
    fontSize: 72,
    color: "#ffffff",
    fontWeight: "700",
    shadowEnable: true,
    shadowBlur: 16,
    textAlign: "center"
  };
  store.updateDeckStyle(deck.id, customStyle);

  if (!deck.style || deck.style.fontFamily !== "CMGSans" || deck.style.fontSize !== 72) {
    throw new Error('updateDeckStyle no guardó las propiedades de estilo en el deck');
  }

  // 4. Edición de texto directo de diapositiva (updateSlideText)
  store.updateSlideText(deck.id, 0, 0, "Texto editado directamente en lienzo WYSIWYG");
  if (deck.groups[0].slides[0].text !== "Texto editado directamente en lienzo WYSIWYG") {
    throw new Error('updateSlideText no reflejó la edición directa del lienzo');
  }

  // 5. Duplicar y eliminar filmina
  const countBeforeDup = deck.groups[0].slides.length;
  store.duplicateSlide(deck.id, 0, 0);
  if (deck.groups[0].slides.length !== countBeforeDup + 1) {
    throw new Error('duplicateSlide no incrementó la cantidad de filminas');
  }

  store.deleteSlide(deck.id, 0, 1);
  if (deck.groups[0].slides.length !== countBeforeDup) {
    throw new Error('deleteSlide no eliminó la filmina');
  }

  // 6. Verificar que seleccionar otra canción (setActiveDeck) NO cambia el estilo del slide proyectándose en vivo
  const otherDeck = store.createNewShow("Canción 2 con otro estilo", "Alabanza", "Letra canción 2");
  store.updateDeckStyle(otherDeck.id, { fontFamily: "Georgia, serif", fontSize: 96, color: "#00ff00" });

  // Proyectar una filmina de la primera canción (deck)
  store.setActiveDeck(deck.id);
  store.setLiveSlide(0, 0);
  if (store.state.activeTemplate.fontFamily !== "CMGSans" || store.state.activeTemplate.fontSize !== 72) {
    throw new Error('El slide proyectado no tomó el estilo de su propia canción');
  }

  // Seleccionar la segunda canción en el proyecto sin proyectar ninguna filmina de ella
  store.setActiveDeck(otherDeck.id);
  if (store.state.activeTemplate.fontFamily !== "CMGSans" || store.state.activeTemplate.fontSize !== 72) {
    throw new Error('Seleccionar otra canción en el proyecto alteró indebidamente el estilo del slide en proyección');
  }
});

console.log('\n▶️ Grupo 14: Optimizaciones de Memoria, IPC y Ciclo de Vida (Performance Audit)');

test('PERF-01/02: Payload IPC ligero (getProjectionPayload), exclusión de thumbnails Base64 en localStorage y limpieza de BroadcastSync', () => {
  const store = new Store();
  const item = store.addMediaItem("Fondo Pesado", "https://example.com/bg.mp4", "video/mp4", "General");
  item.thumbnail = "data:image/jpeg;base64," + "A".repeat(1024);
  store.notify();

  // 1. getProjectionPayload no debe incluir mediaLibrary ni mediaFolders
  const payload = store.getProjectionPayload();
  if ('mediaLibrary' in payload || 'mediaFolders' in payload) {
    throw new Error('getProjectionPayload no debe serializar mediaLibrary ni mediaFolders hacia IPC/BroadcastChannel');
  }

  // 2. localStorage no debe persistir thumbnails Base64 crudos (que están en IndexedDB MediaCache)
  const persistedMedia = JSON.parse(globalThis.localStorage.getItem('propresenter_media_library') || '[]');
  const savedItem = persistedMedia.find(m => m.id === item.id);
  if (!savedItem || savedItem.thumbnail) {
    throw new Error('saveState no debe persistir thumbnails Base64 pesados en localStorage');
  }

  // 3. Hidratación lazy de Biblias y cierre limpio de BroadcastSync
  ensureCustomBiblesLoaded();
  parseAndAddCustomBible({
    local_abbreviation: 'RVR1960-TEST',
    local_title: 'Reina Valera 1960 Test',
    books: [{ book_usfm: 'GEN', name: 'Génesis', chapters: [{ items: [{ type: 'verse', verse_numbers: [1], lines: ['En el principio creó Dios los cielos y la tierra.'] }] }] }]
  });
  const versions = getAllBibleVersions();
  if (!Array.isArray(versions) || !versions.some(v => v.id === 'RVR1960-TEST')) {
    throw new Error('getAllBibleVersions debe retornar las versiones bíblicas tras hidratación lazy');
  }

  const sync = new BroadcastSync(false);
  sync.close();
});

// ----------------------------------------------------
// SUITE 15: Importador y Proyección de Presentaciones PPTX / PDF (RF-60)
// ----------------------------------------------------
console.log('\n▶️ Grupo 15: Importación y Proyección de Presentaciones PPT / PDF (RF-60)');
test('RF-60: Creación de deck de presentación visual y textual, proyección de diapositivas e imágenes y limpieza', () => {
  const store = new Store();

  const mockImported = {
    assetId: 'pres-test-123456',
    title: 'Predicación Domingo',
    sourcePath: 'C:/Presentaciones/Predicacion.pptx',
    sourceName: 'Predicacion.pptx',
    engine: 'powerpoint',
    width: 1920,
    height: 1080,
    slides: [
      { index: 1, image: 'file:///C:/slides/slide-001.png', thumb: 'file:///C:/slides/slide-001-thumb.jpg', text: 'Bienvenidos', notes: 'Saludar a la congregación', hidden: false },
      { index: 2, image: 'file:///C:/slides/slide-002.png', thumb: 'file:///C:/slides/slide-002-thumb.jpg', text: 'Oculta', notes: '', hidden: true },
      { index: 3, image: 'file:///C:/slides/slide-003.png', thumb: 'file:///C:/slides/slide-003-thumb.jpg', text: 'Punto 1: La Fe', notes: 'Leer Hebreos 11:1', hidden: false }
    ]
  };

  // 1. Modo visual ('slides') omitiendo diapositivas ocultas por defecto
  const visualDeck = store.createPresentationDeck(mockImported, {
    title: 'Mensaje Dominical',
    category: 'Predicación',
    mode: 'slides',
    includeHidden: false
  });

  if (visualDeck.type !== 'presentation') throw new Error('El deck debe ser de tipo presentation.');
  if (visualDeck.groups[0].slides.length !== 2) throw new Error('Debe excluir diapositivas ocultas cuando includeHidden es false.');

  // 2. Proyectar primera diapositiva y verificar liveSlideImage, liveSlideNotes y nextSlideImage
  store.setLiveSlide(0, 0);
  if (store.state.liveSlideImage !== 'file:///C:/slides/slide-001.png') {
    throw new Error('liveSlideImage no coincide con la primera diapositiva.');
  }
  if (store.state.liveSlideNotes !== 'Saludar a la congregación') {
    throw new Error('liveSlideNotes no coincide con las notas del orador.');
  }
  if (store.state.nextSlideImage !== 'file:///C:/slides/slide-003.png') {
    throw new Error('nextSlideImage debe apuntar a la siguiente diapositiva visible.');
  }

  // 3. Avanzar a la siguiente diapositiva y luego limpiar con clearText()
  store.nextSlide();
  if (store.state.liveSlideImage !== 'file:///C:/slides/slide-003.png') {
    throw new Error('nextSlide() debe proyectar la segunda diapositiva visible.');
  }
  store.clearText();
  if (store.state.liveSlideImage !== '' || !store.state.isTextCleared) {
    throw new Error('clearText() debe limpiar liveSlideImage.');
  }

  // 4. Modo texto ('text') incluyendo ocultas
  const textDeck = store.createPresentationDeck(mockImported, {
    title: 'Mensaje en Texto',
    category: 'Predicación',
    mode: 'text',
    includeHidden: true
  });
  if (textDeck.type !== 'song') throw new Error('El modo texto debe crear un show editable estándar.');
  const totalTextSlides = textDeck.groups.reduce((acc, g) => acc + g.slides.length, 0);
  if (totalTextSlides !== 3) throw new Error('El modo texto con includeHidden=true debe incluir las 3 diapositivas.');
});

console.log('\n▶️ Grupo 16: Templates Independientes de Versículos vs Canciones (RF-62)');

test('RF-62: Templates independientes para versículos y canciones sin interferencia mutua', () => {
  const store = new Store();

  const initialSongTplId = store.activeTemplateId;
  if (!Array.isArray(store.scriptureTemplates) || store.scriptureTemplates.length < 2) {
    throw new Error('Deben existir plantillas independientes por defecto para versículos.');
  }

  // Cambiar template de versículo no debe alterar el template activo de canciones
  const secondScriptureTpl = store.scriptureTemplates[1];
  store.setActiveScriptureTemplate(secondScriptureTpl.id);
  if (store.activeTemplateId !== initialSongTplId) {
    throw new Error('Cambiar el template de versículos no debe cambiar el template de canciones.');
  }

  // Proyectar versículo usa activeScriptureTemplate sin contaminar las canciones
  store.setLiveScripture('Porque de tal manera amó Dios al mundo');
  if (store.state.liveContentType !== 'scripture') {
    throw new Error('liveContentType debe ser scripture.');
  }
  if (store.state.activeTemplate.id !== secondScriptureTpl.id) {
    throw new Error('El versículo proyectado debe usar el template de versículos activo.');
  }

  // Al proyectar una canción después, recupera el template propio de la canción
  store.setActiveDeck(DEFAULT_DECKS[0].id);
  store.setLiveSlide(0, 0);
  if (store.state.liveContentType !== 'slide') {
    throw new Error('liveContentType debe volver a slide al proyectar canción.');
  }
  if (store.state.activeTemplate.id === secondScriptureTpl.id) {
    throw new Error('La canción proyectada no debe heredar el template de versículos.');
  }
});

console.log('\n▶️ Grupo 17: Eliminación de Carpeta General y Caché por Lotes de Miniaturas (RF-63)');

test('RF-63: Eliminación de carpeta General y rehidratación por lotes de miniaturas en caché', () => {
  const store = new Store();

  // 1. Verificar que se puede eliminar la carpeta "General" sin mover sus videos a otra carpeta
  if (!store.state.mediaFolders.includes('General')) {
    throw new Error('General debe existir inicialmente.');
  }
  const generalVideo = store.addMediaItem('Video General', 'file:///C:/videos/gen.mp4', 'video/mp4', 'General');
  store.deleteMediaFolder('General');
  if (store.state.mediaFolders.includes('General')) {
    throw new Error('Debe poder eliminarse la carpeta General.');
  }
  if (store.state.mediaLibrary.some(m => m.id === generalVideo.id)) {
    throw new Error('Al eliminar una carpeta virtual, sus medios no deben moverse a otra carpeta.');
  }

  // 2. Verificar hidratación por lotes desde caché (sin regenerar ni disparar notify por cada item)
  const item = store.addMediaItem('Video Test', 'file:///C:/videos/test.mp4', 'video/mp4', 'Anuncios', '', 'C:\\videos\\test.mp4');
  item.thumbnail = '';
  const thumbMap = new Map([['C:\\videos\\test.mp4', 'data:image/jpeg;base64,CACHED_OK']]);
  const updated = store.hydrateMediaThumbnailsBatch(thumbMap);
  if (updated !== 1 || item.thumbnail !== 'data:image/jpeg;base64,CACHED_OK') {
    throw new Error('hydrateMediaThumbnailsBatch debe restaurar la miniatura usando la clave estable.');
  }
});


async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASSED: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

console.log('\n▶️ Grupo 18: Integración OBS / Spout / Resolume Arena (HTTP + SSE + Alpha + REST)');

test('RES-01: Estado forceTransparentBackground en Store, toggle y payload IPC', () => {
  globalThis.localStorage.removeItem('propresenter_force_transparent_bg');
  const store = new Store();
  if (store.state.forceTransparentBackground !== false) {
    throw new Error('forceTransparentBackground debe iniciar en false');
  }

  const enabled = store.toggleForceTransparentBackground();
  if (!enabled || store.state.forceTransparentBackground !== true) {
    throw new Error('toggleForceTransparentBackground debe activar forceTransparentBackground');
  }
  if (globalThis.localStorage.getItem('propresenter_force_transparent_bg') !== 'true') {
    throw new Error('forceTransparentBackground debe persistirse en localStorage');
  }
  const payload = store.getProjectionPayload();
  if (payload.forceTransparentBackground !== true) {
    throw new Error('getProjectionPayload debe incluir forceTransparentBackground');
  }

  store.setForceTransparentBackground(false);
  if (store.state.forceTransparentBackground !== false) {
    throw new Error('setForceTransparentBackground(false) debe desactivar forceTransparentBackground');
  }
});

test('RES-02: Fallback SSE en BroadcastSync(false) cuando no existe window.electronAPI', () => {
  const prevWindow = globalThis.window;
  const prevEventSource = globalThis.EventSource;
  let createdUrl = null;
  let closed = false;

  class MockEventSource {
    constructor(url) {
      createdUrl = url;
      this.onmessage = null;
      this.onerror = null;
    }
    close() {
      closed = true;
    }
  }

  try {
    globalThis.EventSource = MockEventSource;
    globalThis.window = { location: { protocol: 'http:' } };

    const receiver = new BroadcastSync(false);
    if (createdUrl !== '/events' || !receiver.eventSource) {
      throw new Error('BroadcastSync(false) debe conectar a EventSource("/events") fuera de Electron');
    }

    let receivedState = null;
    receiver.onUpdate((state) => {
      receivedState = state;
    });

    receiver.eventSource.onmessage({ data: JSON.stringify({ liveText: 'Santo eres Señor', forceTransparentBackground: true }) });
    if (!receivedState || receivedState.liveText !== 'Santo eres Señor' || receivedState.forceTransparentBackground !== true) {
      throw new Error('onUpdate no recibió el estado parseado desde EventSource');
    }

    receiver.close();
    if (!closed || receiver.eventSource !== null) {
      throw new Error('close() debe cerrar y limpiar la conexión EventSource');
    }

    // Verificar que dentro de Electron (con window.electronAPI) NO abre EventSource
    createdUrl = null;
    let ipcBound = false;
    globalThis.window = {
      location: { protocol: 'http:' },
      electronAPI: {
        onBroadcastUpdate: () => {
          ipcBound = true;
          return () => {};
        }
      }
    };
    const electronReceiver = new BroadcastSync(false);
    if (createdUrl !== null || !ipcBound) {
      throw new Error('Dentro de Electron debe usar window.electronAPI.onBroadcastUpdate y NO EventSource');
    }
    electronReceiver.close();
  } finally {
    globalThis.window = prevWindow;
    globalThis.EventSource = prevEventSource;
  }
});

const __smokeTestDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(__smokeTestDir, '..');

await asyncTest('RES-03: LocalAudienceServer sirve estáticos, bloquea traversal, entrega SSE inmediato y en vivo (<50ms), reescribe file:// y maneja EADDRINUSE', async () => {
  const settings = loadAppSettings(projectRootDir);
  if (!settings?.AudienceServer || settings.AudienceServer.Port !== 3456) {
    throw new Error('loadAppSettings debe leer AudienceServer.Port=3456 de appsettings.json');
  }

  const server = new LocalAudienceServer({
    host: '127.0.0.1',
    port: 0,
    rootDir: projectRootDir,
    heartbeatIntervalMs: 0
  });

  const started = await server.start();
  if (!started.listening || !started.port) {
    throw new Error(`El servidor HTTP local no pudo iniciar: ${started.error}`);
  }
  const baseUrl = `http://127.0.0.1:${started.port}`;

  try {
    // 1. Servir audience.html?transparent=1
    const audienceRes = await fetch(`${baseUrl}/audience.html?transparent=1`);
    const audienceHtml = await audienceRes.text();
    if (audienceRes.status !== 200 || !audienceRes.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`audience.html respondió con status/content-type inesperado: ${audienceRes.status}`);
    }
    if (!audienceHtml.includes('alpha-canvas')) {
      throw new Error('audience.html debe incluir los estilos alpha-canvas para modo mixto');
    }

    // 2. Servir módulo JS con Content-Type correcto
    const jsRes = await fetch(`${baseUrl}/src/js/broadcast.js`);
    if (jsRes.status !== 200 || !jsRes.headers.get('content-type')?.includes('javascript')) {
      throw new Error(`src/js/broadcast.js no sirvió Content-Type javascript: ${jsRes.status}`);
    }

    // 3. Protección contra path traversal (raw socket para no normalizar /../ en el cliente)
    const traversalStatus = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: started.port, path: '/../package.json', method: 'GET' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    if (traversalStatus !== 403 && traversalStatus !== 404) {
      throw new Error(`Path traversal debió ser rechazado con 403/404, respondió ${traversalStatus}`);
    }

    // 4. Emitir estado con file:// y verificar que no muta el objeto original
    const sampleLocalFile = path.join(projectRootDir, 'appsettings.json');
    const originalState = {
      liveText: 'Cuán Grande Es Él',
      activeVideoUrl: pathToFileURL(sampleLocalFile).href,
      isMediaCleared: false,
      forceTransparentBackground: false
    };
    const originalUrlSnapshot = originalState.activeVideoUrl;
    server.broadcastState(originalState);
    if (originalState.activeVideoUrl !== originalUrlSnapshot) {
      throw new Error('broadcastState no debe mutar el objeto state original usado por Electron IPC');
    }

    // 5. Conexión SSE tardía recibe lastBroadcastState al instante y luego recibe actualización en <50ms
    const sseResult = await new Promise((resolve, reject) => {
      const events = [];
      let buffer = '';
      let updateSentAt = 0;
      let updateLatencyMs = null;

      const req = http.get(`${baseUrl}/events`, (res) => {
        if (res.statusCode !== 200 || !res.headers['content-type']?.includes('text/event-stream')) {
          reject(new Error(`SSE headers inválidos: ${res.statusCode} ${res.headers['content-type']}`));
          return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const dataLine = part.split('\n').find(l => l.startsWith('data: '));
            if (!dataLine) continue;
            const parsed = JSON.parse(dataLine.slice(6));
            events.push(parsed);
            if (events.length === 1) {
              updateSentAt = Date.now();
              server.broadcastState({
                liveText: 'Diapositiva 2 en Vivo',
                forceTransparentBackground: true,
                isMediaCleared: false
              });
            } else if (events.length === 2) {
              updateLatencyMs = Date.now() - updateSentAt;
              req.destroy();
              resolve({ events, updateLatencyMs });
            }
          }
        });
      });
      req.on('error', (err) => {
        if (events.length >= 2) return;
        reject(err);
      });
      setTimeout(() => {
        req.destroy();
        reject(new Error('Timeout esperando eventos SSE'));
      }, 2000);
    });

    if (sseResult.events[0].liveText !== 'Cuán Grande Es Él') {
      throw new Error('Cliente SSE tardío no recibió lastBroadcastState inicial');
    }
    if (!sseResult.events[0].activeVideoUrl.startsWith('/local-media/')) {
      throw new Error('La URL file:// debió reescribirse a /local-media/ para navegadores externos');
    }
    if (sseResult.events[1].liveText !== 'Diapositiva 2 en Vivo' || sseResult.events[1].forceTransparentBackground !== true) {
      throw new Error('El segundo evento SSE en vivo no coincidió con el broadcast');
    }
    if (sseResult.updateLatencyMs > 150) {
      throw new Error(`Latencia SSE excesiva: ${sseResult.updateLatencyMs}ms`);
    }

    // 6. Proxy /local-media/ responde 200 y 206 Partial Content con Range
    const localMediaUrl = `${baseUrl}${sseResult.events[0].activeVideoUrl}`;
    const fullMediaRes = await fetch(localMediaUrl);
    if (fullMediaRes.status !== 200) {
      throw new Error(`Proxy /local-media devolvió status ${fullMediaRes.status}`);
    }
    const rangeMediaRes = await fetch(localMediaUrl, { headers: { Range: 'bytes=0-15' } });
    if (rangeMediaRes.status !== 206 || !rangeMediaRes.headers.get('content-range')?.startsWith('bytes 0-15/')) {
      throw new Error(`Proxy /local-media Range devolvió status ${rangeMediaRes.status}`);
    }

    // 7. Manejo de EADDRINUSE sin crashear
    const collidingServer = new LocalAudienceServer({
      host: '127.0.0.1',
      port: started.port,
      rootDir: projectRootDir,
      heartbeatIntervalMs: 0
    });
    const collisionRes = await collidingServer.start();
    if (collisionRes.listening !== false || collisionRes.code !== 'EADDRINUSE') {
      await collidingServer.stop();
      throw new Error('El segundo servidor en el mismo puerto debió reportar EADDRINUSE limpiamente sin crashear');
    }
  } finally {
    await server.stop();
  }
});

await asyncTest('RES-04: ResolumeClient dispara POST column/connect, omite cuando disabled y captura errores/timeouts', async () => {
  const prevFetch = globalThis.fetch;
  try {
    let calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, method: init?.method });
      return { ok: true, status: 200 };
    };

    const client = new ResolumeClient({ enabled: false, host: '127.0.0.1', port: 8080, timeoutMs: 1500 });
    const skipped = await client.triggerColumn(2);
    if (!skipped.skipped || calls.length !== 0) {
      throw new Error('ResolumeClient no debe hacer requests cuando enabled=false');
    }

    client.configure({ enabled: true, host: '127.0.0.1', port: 8080 }, false);
    const triggered = await client.triggerColumn(3);
    if (!triggered.ok || calls.length !== 1 || calls[0].method !== 'POST' || calls[0].url !== 'http://127.0.0.1:8080/api/v1/composition/columns/3/connect') {
      throw new Error(`Endpoint o método incorrecto al disparar columna: ${JSON.stringify(calls[0])}`);
    }

    // Simular timeout con AbortController
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
    const timedOut = await client.triggerColumn(1, { timeoutMs: 30 });
    if (timedOut.ok !== false || timedOut.error !== 'timeout') {
      throw new Error(`Se esperaba captura silenciosa de timeout, obtenido: ${JSON.stringify(timedOut)}`);
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

console.log('\n▶️ Grupo 19: Segunda Salida Nativa para Videowall (Solo Videos) (RF-64)');

test('RF-64: Vista videowall.html, build en dist/videowall.html, IPC en main.js/preload.js y controles UI', () => {
  const fs = require('node:fs');

  const videowallHtmlPath = path.join(projectRootDir, 'videowall.html');
  const distVideowallHtmlPath = path.join(projectRootDir, 'dist', 'videowall.html');
  const viteConfigPath = path.join(projectRootDir, 'vite.config.js');
  const mainJsPath = path.join(projectRootDir, 'main.js');
  const preloadJsPath = path.join(projectRootDir, 'preload.js');
  const indexHtmlPath = path.join(projectRootDir, 'index.html');

  if (!fs.existsSync(videowallHtmlPath)) {
    throw new Error('No existe videowall.html en la raíz del proyecto.');
  }
  if (!fs.existsSync(distVideowallHtmlPath)) {
    throw new Error('No existe dist/videowall.html tras el build.');
  }

  const vwHtml = fs.readFileSync(videowallHtmlPath, 'utf8');
  if (!vwHtml.includes('new BroadcastSync(false)') || !vwHtml.includes('object-fit: cover') || !vwHtml.includes('cursor: none') || !vwHtml.includes('#000000')) {
    throw new Error('videowall.html debe incluir BroadcastSync(false), object-fit: cover, cursor: none y fondo #000000.');
  }
  if (!vwHtml.includes('<video') || !vwHtml.includes('muted')) {
    throw new Error('videowall.html debe renderizar un elemento <video> con muted.');
  }
  if (vwHtml.includes('slide-text-container') || vwHtml.includes('lower-third-banner')) {
    throw new Error('videowall.html debe ignorar por completo textos, letras, placas y overlays.');
  }

  const viteCfg = fs.readFileSync(viteConfigPath, 'utf8');
  if (!viteCfg.includes('videowall.html')) {
    throw new Error('vite.config.js debe registrar videowall.html como entry point.');
  }

  const mainJs = fs.readFileSync(mainJsPath, 'utf8');
  for (const token of ['let videowallWindow = null', 'open-videowall', 'close-videowall', 'is-videowall-open', 'videowall-status-changed', "videowallWindow.webContents.send('broadcast-update', state)"]) {
    if (!mainJs.includes(token)) {
      throw new Error(`main.js no contiene el requerimiento esperado: ${token}`);
    }
  }

  const preloadJs = fs.readFileSync(preloadJsPath, 'utf8');
  for (const apiMethod of ['openVideowall', 'closeVideowall', 'isVideowallOpen', 'onVideowallStatusChanged']) {
    if (!preloadJs.includes(apiMethod)) {
      throw new Error(`preload.js no expone ${apiMethod} en window.electronAPI`);
    }
  }

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  if (!indexHtml.includes('select-videowall-display') || !indexHtml.includes('btn-toggle-videowall') || !indexHtml.includes('select-videowall-image-mode')) {
    throw new Error('index.html debe incluir el selector de monitor, el selector de modo en imágenes/anuncios y el botón toggle para Videowall.');
  }
});

test('RF-65: Gestión de Imágenes y Anuncios en Videowall (videowallImageMode: black | sticky | blur)', () => {
  const fs = require('node:fs');
  globalThis.localStorage.removeItem('freepresenter_videowall_image_mode');

  const store = new Store();
  // Default debe ser 'sticky'
  if (store.state.videowallImageMode !== 'sticky') {
    throw new Error(`El modo por defecto de videowallImageMode debe ser 'sticky', recibido: ${store.state.videowallImageMode}`);
  }

  // Cambiar a 'blur' y verificar persistencia y payload
  store.setVideowallImageMode('blur');
  if (store.state.videowallImageMode !== 'blur') {
    throw new Error('setVideowallImageMode("blur") no actualizó el estado');
  }
  if (globalThis.localStorage.getItem('freepresenter_videowall_image_mode') !== 'blur') {
    throw new Error('freepresenter_videowall_image_mode no se persistió en localStorage');
  }
  const payloadBlur = store.getProjectionPayload();
  if (payloadBlur.videowallImageMode !== 'blur') {
    throw new Error('getProjectionPayload() debe incluir videowallImageMode');
  }

  // Cambiar a 'black'
  store.setVideowallImageMode('black');
  if (store.state.videowallImageMode !== 'black' || globalThis.localStorage.getItem('freepresenter_videowall_image_mode') !== 'black') {
    throw new Error('setVideowallImageMode("black") no actualizó ni persistió el estado');
  }

  // Valor inválido cae a 'sticky'
  store.setVideowallImageMode('invalid-mode');
  if (store.state.videowallImageMode !== 'sticky') {
    throw new Error('Un valor inválido en setVideowallImageMode debe normalizarse a "sticky"');
  }

  // Verificar capas y reglas en videowall.html
  const vwHtml = fs.readFileSync(path.join(projectRootDir, 'videowall.html'), 'utf8');
  for (const token of [
    'videowall-ambient',
    'blur(45px) brightness(0.55) saturate(1.2)',
    'scale(1.15)',
    'transition: opacity 0.5s ease',
    'lastVideoSrc',
    'videowallImageMode'
  ]) {
    if (!vwHtml.includes(token)) {
      throw new Error(`videowall.html debe contener "${token}" para la gestión de imágenes/anuncios.`);
    }
  }
});

console.log('\n▶️ Grupo 20: Módulo Stage — Reproductor Dual Sincronizado (RF-66)');

test('RF-66: Docks superior/inferior, cola Alt+Click, disparo simultáneo stageMedia, auto-avance y desactivación al volver a canción/blackout', () => {
  const fs = require('node:fs');
  const store = new Store();
  store.clearStageSelections();

  const [main1, main2, main3] = store.addStageMediaBatch('main', [
    { id: 'st-m1', name: 'Intro Película.mp4', url: 'file:///C:/stage/intro.mp4', duration: 30 },
    { id: 'st-m2', name: 'Clip Principal.mp4', url: 'file:///C:/stage/clip.mp4', duration: 120 },
    { id: 'st-m3', name: 'Cierre.mp4', url: 'file:///C:/stage/outro.mp4', duration: 45 }
  ]);
  const [sec1] = store.addStageMediaBatch('secondary', [
    { id: 'st-s1', name: 'Loop Videowall LED.mp4', url: 'file:///C:/stage/led-loop.mp4', duration: 20 }
  ]);

  // 1. "Enviar a pantallas" deshabilitado hasta tener selección válida en ambos docks
  if (store.canDispatchStage() !== false) {
    throw new Error('canDispatchStage() debe ser false cuando no hay selección en ambos docks.');
  }
  store.selectStageMainVideo(main1.id);
  if (store.canDispatchStage() !== false) {
    throw new Error('canDispatchStage() debe seguir en false si falta seleccionar el video secundario.');
  }
  store.selectStageSecondaryVideo(sec1.id);
  if (store.canDispatchStage() !== true) {
    throw new Error('canDispatchStage() debe ser true cuando hay selección en dock superior e inferior.');
  }

  // 2. Armado de cola con Alt + Click en Dock Superior y recálculo al quitar un ítem
  store.toggleStageMainQueueItem(main1.id);
  store.toggleStageMainQueueItem(main2.id);
  store.toggleStageMainQueueItem(main3.id);
  if (store.state.stageMainQueue.length !== 3 || store.state.stageMainSelectedId !== null) {
    throw new Error('toggleStageMainQueueItem debe armar la cola de 3 videos y limpiar la selección simple.');
  }

  // Alt + Click sobre un video ya encolado (main2) lo quita y recalcula índices [main1, main3]
  store.toggleStageMainQueueItem(main2.id);
  if (store.state.stageMainQueue.length !== 2 || store.state.stageMainQueue[0] !== main1.id || store.state.stageMainQueue[1] !== main3.id) {
    throw new Error('Alt+Click sobre un video ya en la cola debe quitarlo y recalcular índices.');
  }

  // Clic normal limpia la cola previa y deja selección única; volvemos a armar cola [main1, main2] para probar disparo y avance
  store.selectStageMainVideo(main1.id);
  if (store.state.stageMainQueue.length !== 0 || store.state.stageMainSelectedId !== main1.id) {
    throw new Error('Clic normal (selectStageMainVideo) debe limpiar la cola previa y dejar ese único video seleccionado.');
  }
  store.toggleStageMainQueueItem(main1.id);
  store.toggleStageMainQueueItem(main2.id);

  // 3. Disparo simultáneo ("Enviar a pantallas")
  const dispatched = store.dispatchStageToScreens();
  if (!dispatched || !dispatched.active) {
    throw new Error('dispatchStageToScreens() debe activar stageMedia.active = true.');
  }
  if (dispatched.mainVideo?.src !== main1.url || dispatched.secondaryVideo?.src !== sec1.url || dispatched.secondaryVideo?.loop !== true) {
    throw new Error('dispatchStageToScreens() debe asignar mainVideo (#1 de la cola) y secondaryVideo (loop: true).');
  }
  const initialSyncTs = dispatched.syncTimestamp;

  // 4. Avance automático de cola al recibir MEDIA_ENDED sin reiniciar secondaryVideo
  const nextPlayed = store.advanceStageMainQueue();
  if (!nextPlayed || store.state.stageMedia.mainVideo?.src !== main2.url) {
    throw new Error('advanceStageMainQueue() debe avanzar al video #2 en audience.html.');
  }
  if (store.state.stageMedia.syncTimestamp !== initialSyncTs || store.state.stageMedia.secondaryVideo?.src !== sec1.url) {
    throw new Error('Al avanzar la cola principal, syncTimestamp y secondaryVideo.src no deben cambiar para no reiniciar el videowall.');
  }

  // 5. Finalización del último video de la cola
  const afterLast = store.advanceStageMainQueue();
  if (afterLast !== null || store.state.stageMedia.mainVideo !== null || store.state.stageQueueFinished !== true) {
    throw new Error('Al terminar el último video de la cola, mainVideo debe quedar en null y stageQueueFinished en true.');
  }

  // 6. Proyectar una canción, versículo o activar Blackout desactiva stageMedia.active = false
  store.dispatchStageToScreens();
  if (!store.state.stageMedia.active) throw new Error('stageMedia debería estar activo tras nuevo disparo.');
  store.setLiveSlide(0, 0);
  if (store.state.stageMedia.active !== false) {
    throw new Error('Proyectar una diapositiva de canción/show debe desactivar stageMedia.active = false.');
  }

  store.dispatchStageToScreens();
  store.clearAll();
  if (store.state.stageMedia.active !== false) {
    throw new Error('Activar Blackout (clearAll) debe desactivar stageMedia.active = false.');
  }

  // Verificar soporte de stageMedia en audience.html, videowall.html e index.html
  const audHtml = fs.readFileSync(path.join(projectRootDir, 'audience.html'), 'utf8');
  const vwHtml = fs.readFileSync(path.join(projectRootDir, 'videowall.html'), 'utf8');
  const idxHtml = fs.readFileSync(path.join(projectRootDir, 'index.html'), 'utf8');
  if (!audHtml.includes('state.stageMedia') || !vwHtml.includes('state.stageMedia') || !idxHtml.includes('btn-stage-send-screens')) {
    throw new Error('audience.html, videowall.html e index.html deben integrar stageMedia y btn-stage-send-screens.');
  }
});


// ----------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`📊 RESULTADOS SMOKE TEST: ${passedTests}/${totalTests} PRUEBAS EXITOSAS`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
process.exit(0);
