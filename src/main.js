// --- App Version & Automatic Cache Invalidation ---
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';
const STORAGE_VERSION_KEY = 'spectromorphology_app_version';

(function handleVersionUpgrade() {
  try {
    const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log(`[Spectromorphology] Detected version upgrade: ${storedVersion} -> ${APP_VERSION}. Purging browser cache...`);

      // 1. Purge Cache Storage API
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }

      // 2. Unregister legacy / stale Service Workers
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
    }
    localStorage.setItem(STORAGE_VERSION_KEY, APP_VERSION);
  } catch (e) {
    // Ignore in restrictive sandboxes
  }
})();

import * as THREE from 'three';
import GUI from 'lil-gui';
import { FishRibbon } from './ribbon/FishRibbon.js';
import { createKaleidoscopeMaterial } from './shaders/kaleidoscopeMaterial.js';
import { BrushDebugOverlay } from './ribbon/BrushDebugOverlay.js';

// --- Global Setup ---
const container = document.getElementById('canvas-container');
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.info.autoReset = false; // Allow multi-pass draw call and triangle accumulation
container.appendChild(renderer.domElement);

// 2. Offscreen Stroke Scene & FBO
// Configurable resolution for ultra-crisp paper fiber edges and optimal GPU fillrate
let currentFboSize = 2560;
const strokeRenderTarget = new THREE.WebGLRenderTarget(currentFboSize, currentFboSize, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  samples: 4 // Hardware 4x MSAA anti-aliasing on FBO canvas
});

function setFboResolution(size) {
  const numSize = parseInt(size, 10);
  if (!numSize || numSize === currentFboSize) return;
  currentFboSize = numSize;
  params.fboResolution = numSize;
  strokeRenderTarget.setSize(numSize, numSize);
  if (!params.persistentCanvas) {
    renderer.setRenderTarget(strokeRenderTarget);
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear();
    renderer.setRenderTarget(null);
  }
}

const strokeScene = new THREE.Scene();

// Aspect ratio for screen & debug camera
const initAspect = width / height;

// Tightly bound strokeExtent: mandala strokes live within r ≈ 0.85, so 1.05 safely captures all strokes
// while dedicating 100% of the FBO resolution to the actual lines instead of empty black space!
const initStrokeExtent = 1.05;

// Orthographic camera covering stroke territory tightly for maximum texel density
const strokeCamera = new THREE.OrthographicCamera(
  -initStrokeExtent, initStrokeExtent, initStrokeExtent, -initStrokeExtent, 0.1, 10
);
strokeCamera.position.z = 1;

// 3. Multi-layered Saturated Paper Ribbons
// ── Dynamic width modulation (0 to 0.08) with polyphonic layer phase offsets ──
const ribbons = [
  // Layer 1: Crimson / Ruby with Amber split (mid-outer territory)
  new FishRibbon({
    color: 0xef2353,
    splitColor: 0xffaa00,
    segments: 100,
    maxWidth: 0.08,
    widthLimit: 0.08,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 0.72,        // slower breathing rate
    widthPhase: 0.5 * Math.PI,
    widthHarmonicPhase: 1.2,
    speed: 1.1,
    waveFreq: 3.5,
    waveAmp: 0.028,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.42,
    phaseOffset: 0.0,
    orbitSpeed: 0.35,
    speedMultiplier: 0.82,       // slower travel
    speedWanderFreq: 0.22,
    speedSeed: 14.2,
    speedWanderIntensity: 0.55,
    maxBoundaryRadius: 0.58,
    headTaperLength: 0.15,
    headTipWidth: 0.02,
    randomSpeedEnabled: true,
    independentWidth: true,
    fixedPathTrail: true,
    bifurcationEnabled: true,
    splitChance: 0.75,
    splitThreshold: 0.38,
    splitSeparation: 0.065,
    splitDuration: 5.5
  }),
  // Layer 2: Deep Cyan / Electric Teal with Emerald split (wide outer sweep)
  new FishRibbon({
    color: 0x00d2d3,
    splitColor: 0x10ac84,
    segments: 100,
    maxWidth: 0.075,
    widthLimit: 0.08,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 1.38,        // faster, energetic breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 0.66,
    widthHarmonicPhase: 3.7,
    speed: 1.25,
    waveFreq: 3.8,
    waveAmp: 0.026,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.52,
    phaseOffset: Math.PI * 0.66,
    orbitSpeed: 0.42,
    speedMultiplier: 1.26,       // faster, agile travel
    speedWanderFreq: 0.36,
    speedSeed: 58.6,
    speedWanderIntensity: 0.55,
    maxBoundaryRadius: 0.58,
    headTaperLength: 0.15,
    headTipWidth: 0.02,
    randomSpeedEnabled: true,
    independentWidth: true,
    fixedPathTrail: true,
    bifurcationEnabled: true,
    splitChance: 0.75,
    splitThreshold: 0.38,
    splitSeparation: 0.065,
    splitDuration: 5.5
  }),
  // Layer 3: Royal Violet / Magenta with Coral split (inner-mid core territory)
  new FishRibbon({
    color: 0x9b59b6,
    splitColor: 0xff6b6b,
    segments: 100,
    maxWidth: 0.07,
    widthLimit: 0.08,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 0.96,        // intermediate breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 1.33,
    widthHarmonicPhase: 5.1,
    speed: 0.95,
    waveFreq: 3.2,
    waveAmp: 0.030,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.30,
    phaseOffset: Math.PI * 1.33,
    orbitSpeed: 0.3,
    speedMultiplier: 1.02,       // intermediate travel
    speedWanderFreq: 0.28,
    speedSeed: 91.4,
    speedWanderIntensity: 0.55,
    maxBoundaryRadius: 0.58,
    headTaperLength: 0.15,
    headTipWidth: 0.02,
    randomSpeedEnabled: true,
    independentWidth: true,
    fixedPathTrail: true,
    bifurcationEnabled: true,
    splitChance: 0.75,
    splitThreshold: 0.38,
    splitSeparation: 0.065,
    splitDuration: 5.5
  })
];

ribbons.forEach((ribbon, index) => {
  // Stagger z-depth so layers overlap naturally
  ribbon.group.position.z = -index * 0.02;
  strokeScene.add(ribbon.group);
});

// 4. Main Display Scene & Fullscreen Kaleidoscope Quad
const mainScene = new THREE.Scene();
const mainCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const kaleidoscopeMaterial = createKaleidoscopeMaterial();
kaleidoscopeMaterial.uniforms.tDiffuse.value = strokeRenderTarget.texture;
kaleidoscopeMaterial.uniforms.uAspect.value = width / height;
kaleidoscopeMaterial.uniforms.uStrokeScale.value = 0.7 / initStrokeExtent;

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), kaleidoscopeMaterial);
mainScene.add(quad);

// 5. Brush Debug Overlay
// Pass live kaleidoscope uniforms so the wedge stays in sync with GUI changes
const brushDebug = new BrushDebugOverlay(strokeScene, ribbons, kaleidoscopeMaterial.uniforms);

// Background plane for the debug view (so strokes aren't transparent over void)
const debugBgGeom = new THREE.PlaneGeometry(1.4, 1.4);
const debugBgMat  = new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: false });
const debugBgMesh = new THREE.Mesh(debugBgGeom, debugBgMat);
debugBgMesh.position.z = -0.5;
debugBgMesh.visible    = false;
strokeScene.add(debugBgMesh);

// Camera for debug view: renders strokeScene directly to screen with aspect correction
const debugCamera = new THREE.OrthographicCamera(-0.7 * initAspect, 0.7 * initAspect, 0.7, -0.7, 0.1, 10);
debugCamera.position.z = 1;
debugBgMesh.scale.set(initAspect * 2.0, 2.0, 1);

// State flag
let brushDebugMode = false;

// 6. Interactive GUI Controls
const params = {
  // Kaleidoscope / Mandala
  sectors: 12,
  mirror: true,
  autoRotate: false,
  rotationSpeed: 0.15,
  manualRotation: 0.0,
  zoom: 1.0,

  // Brush Motion & Trail Kinematics
  motionSpeed: 1.1,
  orbitSpeed: 0.35,
  boundaryRadius: 0.58,
  minTurnRadius: 0.12,
  fixedPathTrail: true,         // Фиксированный след: где нарисовано, там и лежит
  trailLength: 1.5,             // Длина шлейфа мазка (0.5..3.5)
  waveAmplitude: 3.5,           // Размах синусоиды [0..10] (3.5 = 0.028)
  waveFrequency: 3.5,           // Частота синусоиды вдоль пути
  randomSpeedMode: true,        // Режим независимых случайных скоростей
  speedVariance: 6.5,           // Разброс случайных скоростей [0..10]
  dynamicSpeedDrift: true,      // Органический дрейф скорости во времени
  speedDriftIntensity: 5.5,     // Сила дрейфа скорости [0..10]

  // Canvas Persistence
  persistentCanvas: false,      // Накапливать рисунок на холсте (вечное рисование)

  // Bifurcation / Twin Head Splitting (Раздвоение кисти на две головы)
  bifurcationEnabled: true,     // Авто-раздвоение кисти при истончении
  splitChance: 0.75,            // Вероятность запуска при тонком мазке
  splitThreshold: 3.8,          // Порог толщины для активации [1..10] (3.8 = 0.38)
  splitSeparation: 5.0,         // Дистанция между двумя головами [1..10] (5.0 = 0.065)
  splitDuration: 5.5,           // Длительность раздвоения (сек)

  // Paper Texture & Width Dynamics (Человеческая шкала 0..10)
  strokeWidthLimit: 10.0,       // Потолок толщины [0..10] (10.0 = полная кисть 0.080)
  roughness: 3.5,               // Рваный край [0..10] (3.5 = 0.35)
  fiberIntensity: 3.5,          // Волокна бумаги [0..10] (3.5 = 0.28)
  widthSpeed: 2.8,              // Скорость изменения толщины [0..10] (2.8 = 0.22)
  centerTaperStrength: 8.5,     // Сужение к центру [0..10] (8.5 = 0.85)
  centerTaperRadius: 5.8,       // Радиус сужения [1..10] (5.8 = 0.35)
  headTaperLength: 5.0,         // Длина наконечника [1..10] (5.0 = 0.15)
  headTipWidth: 2.0,            // Толщина острия [0..10] (2.0 = 0.02)
  independentWidth: true,       // Независимая толщина мазков
  widthAsymmetry: 6.5,          // Степень асинхронности [0..10]

  // Background
  bgGradient: true,
  bgInner: '#0e121d',
  bgOuter: '#040507',
  vignette: 0.75,
  filmGrain: 0.0,

  // Performance & Graphics
  fboResolution: 2560,
  screenDpi: 1.5,
  autoRadiusCoupling: true
};

// ── Helper: propagate sector / mirror changes to all ribbon instances ──
function updateAllInstances() {
  ribbons.forEach(r => {
    r.updateInstances(params.sectors, params.mirror);
    if (brushDebugMode) {
      r.mesh.count = 1;
      if (r.splitMesh.visible) r.splitMesh.count = 1;
    }
  });
  // Also keep uniforms in sync for debug overlay reads
  kaleidoscopeMaterial.uniforms.uSectors.value = params.sectors;
  kaleidoscopeMaterial.uniforms.uMirror.value = params.mirror ? 1.0 : 0.0;
}

// Initial instance setup (must happen before first frame)
updateAllInstances();

// ── Asynchronous & Random Speed / Width State & Helpers ──
const initialSpeedRatios = [0.82, 1.26, 1.02];
const initialWidthRatios = [0.72, 1.38, 0.96];

function applySpeedVariance(variance) {
  const norm = variance > 1.0 ? (variance / 10.0) : variance;
  ribbons.forEach((r, idx) => {
    const baseDev = initialSpeedRatios[idx] - 1.0;
    r.speedMultiplier = Math.max(0.2, 1.0 + baseDev * (norm / 0.65));
  });
}

function rerollBrushSpeeds() {
  const variance = params.speedVariance > 1.0 ? (params.speedVariance / 10.0) : params.speedVariance;
  ribbons.forEach((r, idx) => {
    const rand = (Math.random() - 0.5) * 2.0;
    initialSpeedRatios[idx] = 1.0 + rand * variance * 0.7;
    r.speedMultiplier = Math.max(0.25, initialSpeedRatios[idx]);
    r.speedWanderFreq = 0.15 + Math.random() * 0.35;
    r.speedSeed = Math.random() * 100.0;
  });
}

function applyWidthAsymmetry(asymmetry) {
  const norm = asymmetry > 1.0 ? (asymmetry / 10.0) : asymmetry;
  ribbons.forEach((r, idx) => {
    const baseDev = initialWidthRatios[idx] - 1.0;
    r.widthSpeedMult = Math.max(0.25, 1.0 + baseDev * (norm / 0.65));
  });
}

function rerollBrushWidths() {
  const asymmetry = params.widthAsymmetry > 1.0 ? (params.widthAsymmetry / 10.0) : params.widthAsymmetry;
  ribbons.forEach((r, idx) => {
    const rand = (Math.random() - 0.5) * 2.0;
    initialWidthRatios[idx] = 1.0 + rand * asymmetry * 0.7;
    r.widthSpeedMult = Math.max(0.25, initialWidthRatios[idx]);
    r.widthPhase = Math.random() * Math.PI * 2.0;
    r.widthHarmonicPhase = Math.random() * Math.PI * 2.0;
  });
}

const gui = new GUI({ title: 'Параметры Визуализатора' });
gui.domElement.classList.add('gui-drawer-panel');

// ── Mobile Drawer Integration (Slide-out panel for <= 768px) ──
const mobileHeader = document.createElement('div');
mobileHeader.className = 'gui-mobile-header';
mobileHeader.innerHTML = `
  <div class="gui-mobile-header-title">
    <span class="gui-mobile-header-icon" aria-hidden="true">⚙️</span>
    <span>Параметры</span>
  </div>
  <button id="gui-close-btn" class="gui-mobile-close-btn" type="button" aria-label="Закрыть меню">
    <span>✕ Закрыть</span>
  </button>
`;
gui.domElement.prepend(mobileHeader);

const toggleBtn = document.getElementById('gui-toggle-btn');
const backdrop = document.getElementById('gui-backdrop');
const closeBtn = document.getElementById('gui-close-btn');

function openMobileDrawer() {
  document.body.classList.add('gui-drawer-open');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
}

function closeMobileDrawer() {
  document.body.classList.remove('gui-drawer-open');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
}

let lastToggleTime = 0;
function toggleMobileDrawer() {
  const now = Date.now();
  if (now - lastToggleTime < 200) return;
  lastToggleTime = now;
  if (document.body.classList.contains('gui-drawer-open')) {
    closeMobileDrawer();
  } else {
    openMobileDrawer();
  }
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMobileDrawer();
  });
  toggleBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMobileDrawer();
  });
}

if (backdrop) {
  const handleBackdrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMobileDrawer();
  };
  backdrop.addEventListener('click', handleBackdrop);
  backdrop.addEventListener('touchend', handleBackdrop);
}

if (closeBtn) {
  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMobileDrawer();
  };
  closeBtn.addEventListener('click', handleClose);
  closeBtn.addEventListener('touchend', handleClose);
}

// Swipe right to close gesture on mobile drawer
let touchStartX = -1;
let touchStartY = -1;
let touchDeltaX = 0;
let touchDeltaY = 0;

gui.domElement.addEventListener('touchstart', (e) => {
  // Ignore gestures on interactive inputs/sliders
  if (e.target.closest('.slider, .display, input, select, button, .name, .lil-slider, .lil-display')) {
    touchStartX = -1;
    return;
  }
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchDeltaX = 0;
    touchDeltaY = 0;
  }
}, { passive: true });

gui.domElement.addEventListener('touchmove', (e) => {
  if (touchStartX < 0) return;
  if (e.touches.length === 1) {
    touchDeltaX = e.touches[0].clientX - touchStartX;
    touchDeltaY = e.touches[0].clientY - touchStartY;
  }
}, { passive: true });

gui.domElement.addEventListener('touchend', () => {
  if (touchStartX >= 0 && touchDeltaX > 50 && Math.abs(touchDeltaX) > Math.abs(touchDeltaY) * 1.4) {
    closeMobileDrawer();
  }
  touchStartX = -1;
  touchStartY = -1;
  touchDeltaX = 0;
  touchDeltaY = 0;
}, { passive: true });

// Close on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('gui-drawer-open')) {
    closeMobileDrawer();
  }
});

// Close drawer if window is resized above 768px
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && document.body.classList.contains('gui-drawer-open')) {
    closeMobileDrawer();
  }
});

// Auto-open on launch if requested via URL query (?openMenu)
if (window.innerWidth <= 768 && new URLSearchParams(window.location.search).has('openMenu')) {
  openMobileDrawer();
}

// ── LocalStorage Settings Persistence ───────────────────
const STORAGE_KEY = 'spectromorphology_user_settings_v1';

function showToast(message, isError = false) {
  const toast = document.getElementById('hud-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.borderColor = isError ? 'rgba(245, 101, 101, 0.65)' : 'rgba(72, 187, 120, 0.65)';
  toast.style.color = isError ? '#f56565' : '#48bb78';
  toast.style.boxShadow = isError
    ? '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(245, 101, 101, 0.25)'
    : '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(72, 187, 120, 0.25)';
  toast.style.display = 'block';
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2200);
}

const defaultParams = JSON.parse(JSON.stringify(params));
const defaultLayerParams = { layer1: true, layer2: true, layer3: true };
const defaultPerfParams = { showTelemetry: true };
const defaultDebugParams = { brushDebugMode: false };

const storageParams = {
  autoSave: true
};

let isRestoringSettings = false;

function saveCurrentSettings(showNotification = true) {
  try {
    const data = {
      params: { ...params },
      layerParams: { ...layerParams },
      perfParams: { ...perfParams },
      debugParams: { ...debugParams },
      storageParams: { ...storageParams },
      initialSpeedRatios: [...initialSpeedRatios],
      initialWidthRatios: [...initialWidthRatios],
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (showNotification) {
      showToast('💾 Параметры сохранены в localStorage');
    }
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    if (showNotification) {
      showToast('❌ Ошибка сохранения в localStorage', true);
    }
    return false;
  }
}

function loadSavedSettings(silent = false) {
  isRestoringSettings = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data) return false;

    if (Array.isArray(data.initialSpeedRatios) && data.initialSpeedRatios.length === 3) {
      for (let i = 0; i < 3; i++) initialSpeedRatios[i] = data.initialSpeedRatios[i];
    }
    if (Array.isArray(data.initialWidthRatios) && data.initialWidthRatios.length === 3) {
      for (let i = 0; i < 3; i++) initialWidthRatios[i] = data.initialWidthRatios[i];
    }

    if (data.storageParams && typeof data.storageParams.autoSave === 'boolean') {
      storageParams.autoSave = data.storageParams.autoSave;
    }

    // Apply values through controllers so that onChange callbacks fire properly
    const controllers = gui.controllersRecursive();
    controllers.forEach(ctrl => {
      const prop = ctrl.property;
      if (typeof ctrl.getValue() === 'function') return;

      if (data.params && prop in data.params) {
        if (prop === 'fboResolution' && data.params[prop] < 2048) {
          ctrl.setValue(2560);
        } else {
          ctrl.setValue(data.params[prop]);
        }
      } else if (data.layerParams && prop in data.layerParams) {
        ctrl.setValue(data.layerParams[prop]);
      } else if (data.perfParams && prop in data.perfParams) {
        ctrl.setValue(data.perfParams[prop]);
      } else if (data.debugParams && prop in data.debugParams) {
        ctrl.setValue(data.debugParams[prop]);
      } else if (data.storageParams && prop in data.storageParams) {
        ctrl.setValue(data.storageParams[prop]);
      }
    });

    if (!silent) {
      showToast('📂 Загружены сохранённые параметры');
    }
    return true;
  } catch (err) {
    console.error('Failed to load settings:', err);
    return false;
  } finally {
    isRestoringSettings = false;
  }
}

function resetToDefaultSettings() {
  isRestoringSettings = true;
  try {
    localStorage.removeItem(STORAGE_KEY);

    const controllers = gui.controllersRecursive();
    controllers.forEach(ctrl => {
      const prop = ctrl.property;
      if (typeof ctrl.getValue() === 'function') return;

      if (prop in defaultParams) {
        ctrl.setValue(defaultParams[prop]);
      } else if (prop in defaultLayerParams) {
        ctrl.setValue(defaultLayerParams[prop]);
      } else if (prop in defaultPerfParams) {
        ctrl.setValue(defaultPerfParams[prop]);
      } else if (prop in defaultDebugParams) {
        ctrl.setValue(defaultDebugParams[prop]);
      }
    });

    showToast('↺ Настройки сброшены к заводским');
  } catch (err) {
    console.error('Failed to reset settings:', err);
  } finally {
    isRestoringSettings = false;
  }
}

// ── Top Action: Save Button ─────────────────────────────
gui.add({
  saveNow: () => saveCurrentSettings(true)
}, 'saveNow').name('💾 Запомнить параметры');

// ── Debug brush mode button ─────────────────────────────
const debugParams = {
  brushDebugMode: false,
};
gui.add(debugParams, 'brushDebugMode').name('🖌 Режим кисти (debug)').onChange(v => {
  brushDebugMode = v;
  brushDebug.setVisible(v);
  debugBgMesh.visible = v;

  const hudDebug = document.getElementById('hud-debug');
  const hudSub = document.getElementById('hud-subtitle');
  if (hudDebug) hudDebug.style.display = v ? 'inline-block' : 'none';
  if (hudSub) hudSub.textContent = v ? 'Исходная траектория кисти · Без симметрий' : 'Мандала бумажных мазков · Рыбья кинематика';

  if (v) {
    // Show only the original (non-instanced) ribbon in debug mode
    ribbons.forEach(r => {
      r.mesh.count = 1;
      if (r.splitMesh.visible) r.splitMesh.count = 1;
    });
  } else {
    // Restore mandala instances
    updateAllInstances();
  }
});

gui.add({
  rerollAll: () => {
    rerollBrushSpeeds();
    rerollBrushWidths();
  }
}, 'rerollAll').name('🎲 Случайный ансамбль (всё)');

const fPerf = gui.addFolder('🚀 Производительность и Графика');
const perfParams = { showTelemetry: true };
fPerf.add(perfParams, 'showTelemetry').name('⚡ Телеметрия / FPS HUD').onChange(v => {
  if (hudPerf) hudPerf.style.display = v ? 'inline-flex' : 'none';
});
fPerf.add(params, 'fboResolution', {
  '👑 4K Cinema (3840px · Максимум)': 3840,
  '💎 Ультра Retina (2560px · Рекомендуется)': 2560,
  '🎨 Высокое (2048px · Чётко)': 2048,
  '⚡ Баланс (1536px · Быстро)': 1536,
  '🚀 Турбо (1024px · Легко)': 1024
}).name('Качество холста (FBO)').onChange(v => setFboResolution(v));
fPerf.add(params, 'screenDpi', {
  '⚡ Стандарт (1.2x)': 1.2,
  '🎨 Высокая чёткость (1.5x)': 1.5,
  '💎 Ultra Retina (2.0x)': 2.0
}).name('Разрешение экрана (DPI)').onChange(v => {
  renderer.setPixelRatio(v);
});
fPerf.close();

const fLayers = gui.addFolder('Слои кистей (вкл/выкл)');
const layerParams = {
  layer1: true,
  layer2: true,
  layer3: true,
};
const layerConfigs = [
  { key: 'layer1', name: 'Кисть 1: Рубин / Янтарь' },
  { key: 'layer2', name: 'Кисть 2: Бирюза / Изумруд' },
  { key: 'layer3', name: 'Кисть 3: Фиолет / Коралл' },
];
layerConfigs.forEach((cfg, idx) => {
  fLayers.add(layerParams, cfg.key).name(cfg.name).onChange(v => {
    ribbons[idx].group.visible = v;
    brushDebug.setRibbonVisible(idx, v);
  });
});

const fKaleido = gui.addFolder('Мандала / Симметрия');
fKaleido.add(params, 'sectors', 2, 32, 1).name('Секторы симметрии').onChange(v => {
  updateAllInstances();
});
fKaleido.add(params, 'mirror').name('Зеркальные грани').onChange(v => {
  updateAllInstances();
});
fKaleido.add(params, 'autoRotate').name('Авто-вращение');
fKaleido.add(params, 'rotationSpeed', -1.0, 1.0, 0.01).name('Скорость вращения');
fKaleido.add(params, 'zoom', 0.4, 2.5, 0.05).name('Масштаб (Zoom)').onChange(v => {
  kaleidoscopeMaterial.uniforms.uZoom.value = v;
});

const fFish = gui.addFolder('Кинематика кисти и след');
fFish.add(params, 'motionSpeed', 0.2, 3.0, 0.1).name('Скорость движения').onChange(v => {
  ribbons.forEach(r => r.speed = v);
});
fFish.add(params, 'orbitSpeed', 0.05, 1.5, 0.05).name('Скорость кисти (орбита)').onChange(v => {
  ribbons.forEach(r => r.orbitSpeed = v);
});
fFish.add(params, 'boundaryRadius', 0.25, 0.70, 0.01).name('Радиус обитания').onChange(v => {
  ribbons.forEach(r => r.maxBoundaryRadius = v);
});
const minTurnCtrl = fFish.add(params, 'minTurnRadius', 0.0, 0.5, 0.01).name('Мин. радиус поворота').onChange(v => {
  let effectiveRadius = v;
  if (params.autoRadiusCoupling) {
    const minSafeR = (params.strokeWidthLimit * 0.008) * 0.6;
    if (v < minSafeR) {
      effectiveRadius = minSafeR;
      minTurnCtrl.setValue(minSafeR);
    }
  }
  ribbons.forEach(r => r.minTurnRadius = effectiveRadius);
});
fFish.add(params, 'autoRadiusCoupling').name('🔗 Связка R_min с шириной').onChange(v => {
  if (v) {
    const minSafeR = (params.strokeWidthLimit * 0.008) * 0.6;
    if (params.minTurnRadius < minSafeR) {
      params.minTurnRadius = minSafeR;
      minTurnCtrl.setValue(minSafeR);
      ribbons.forEach(r => r.minTurnRadius = minSafeR);
    }
  }
});
fFish.add(params, 'fixedPathTrail').name('📌 Фиксированный след').onChange(v => {
  ribbons.forEach(r => r.fixedPathTrail = v);
});
fFish.add(params, 'trailLength', 0.5, 3.5, 0.1).name('Длина шлейфа кисти').onChange(v => {
  ribbons.forEach(r => r.trailLength = v);
});
fFish.add(params, 'waveAmplitude', 0.0, 10.0, 0.1).name('Амплитуда виляния (0..10)').onChange(v => {
  ribbons.forEach(r => r.waveAmp = v * 0.008);
});
fFish.add(params, 'waveFrequency', 0.5, 8.0, 0.1).name('Частота синусоиды пути').onChange(v => {
  ribbons.forEach(r => r.waveFreq = v);
});

// Папка: Холст и рисование (накопление мазков)
const fCanvas = gui.addFolder('🎨 Холст (накопление мазков)');
fCanvas.add(params, 'persistentCanvas').name('Накапливать рисунок').onChange(v => {
  if (!v) {
    renderer.setRenderTarget(strokeRenderTarget);
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear();
    renderer.setRenderTarget(null);
  }
});
fCanvas.add({
  clearCanvas: () => {
    renderer.setRenderTarget(strokeRenderTarget);
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear();
    renderer.setRenderTarget(null);
  }
}, 'clearCanvas').name('🧹 Очистить холст');

// Папка: Раздвоение кисти (Расщепление на две головы)
const fBifurcation = gui.addFolder('✂️ Раздвоение кисти (Расщепление)');
fBifurcation.add(params, 'bifurcationEnabled').name('Вкл. авто-раздвоение').onChange(v => {
  ribbons.forEach(r => r.bifurcationEnabled = v);
});
fBifurcation.add(params, 'splitChance', 0.0, 1.0, 0.05).name('Вероятность при тонком').onChange(v => {
  ribbons.forEach(r => r.splitChance = v);
});
fBifurcation.add(params, 'splitThreshold', 1.0, 8.0, 0.1).name('Порог запуска (1..8)').onChange(v => {
  ribbons.forEach(r => r.splitThreshold = v * 0.10);
});
fBifurcation.add(params, 'splitSeparation', 1.0, 10.0, 0.1).name('Дистанция голов (1..10)').onChange(v => {
  ribbons.forEach(r => r.splitSeparation = v * 0.013);
});
fBifurcation.add(params, 'splitDuration', 2.0, 15.0, 0.5).name('Длительность (сек)').onChange(v => {
  ribbons.forEach(r => r.splitDuration = v);
});
fBifurcation.add({
  forceSplitNow: () => {
    ribbons.forEach(r => r.triggerSplit(r.currentWidth, true));
  }
}, 'forceSplitNow').name('✂️ Раздвоить сейчас!');

// Подпапка: Случайные независимые скорости
const fSpeedVar = fFish.addFolder('🎲 Случайные скорости кистей');
fSpeedVar.add(params, 'randomSpeedMode').name('Вкл. разные скорости').onChange(v => {
  ribbons.forEach(r => r.randomSpeedEnabled = v);
});
fSpeedVar.add(params, 'speedVariance', 0.0, 10.0, 0.1).name('Разброс скоростей (0..10)').onChange(v => {
  applySpeedVariance(v);
});
fSpeedVar.add(params, 'dynamicSpeedDrift').name('Органический дрейф').onChange(v => {
  ribbons.forEach(r => r.speedDriftEnabled = v);
});
fSpeedVar.add(params, 'speedDriftIntensity', 0.0, 10.0, 0.1).name('Сила дрейфа (0..10)').onChange(v => {
  ribbons.forEach(r => r.speedWanderIntensity = v * 0.10);
});
fSpeedVar.add({ reroll: rerollBrushSpeeds }, 'reroll').name('🎲 Новые скорости');

const fPaper = gui.addFolder('Толщина мазков и бумага');

// ── Ограничитель максимальной толщины для всех кистей (шкала 0..10: 10.0 = 0.080) ──
const limitCtrl = fPaper.add(params, 'strokeWidthLimit', 0.5, 15.0, 0.1)
  .name('🛑 Потолок толщины (0..10)')
  .onChange(v => {
    ribbons.forEach(r => r.setWidthLimit(v * 0.008));
    if (params.autoRadiusCoupling) {
      const minSafeR = (v * 0.008) * 0.6;
      if (params.minTurnRadius < minSafeR) {
        params.minTurnRadius = minSafeR;
        minTurnCtrl.setValue(minSafeR);
        ribbons.forEach(r => r.minTurnRadius = minSafeR);
      }
    }
  });

function setGlobalWidth(val) {
  params.strokeWidthLimit = val;
  limitCtrl.setValue(val);
  ribbons.forEach(r => r.setWidthLimit(val * 0.008));
  if (params.autoRadiusCoupling) {
    const minSafeR = (val * 0.008) * 0.6;
    if (params.minTurnRadius < minSafeR) {
      params.minTurnRadius = minSafeR;
      minTurnCtrl.setValue(minSafeR);
      ribbons.forEach(r => r.minTurnRadius = minSafeR);
    }
  }
}

const fPresets = fPaper.addFolder('⚡ Пресеты толщины (0..10)');
fPresets.add({ set: () => setGlobalWidth(1.5) }, 'set').name('🪡 Нить / волосок (1.5)');
fPresets.add({ set: () => setGlobalWidth(3.8) }, 'set').name('✒️ Тонкое перо (3.8)');
fPresets.add({ set: () => setGlobalWidth(7.0) }, 'set').name('🖌 Средний мазок (7.0)');
fPresets.add({ set: () => setGlobalWidth(10.0) }, 'set').name('🎨 Полная кисть (10.0)');
fPresets.close();

fPaper.add(params, 'roughness', 0.0, 10.0, 0.1).name('Рваный край (0..10)').onChange(v => {
  const norm = v * 0.10;
  ribbons.forEach(r => {
    r.material.uniforms.uRoughness.value = norm;
    r.splitMaterial.uniforms.uRoughness.value = norm;
  });
});
fPaper.add(params, 'fiberIntensity', 0.0, 10.0, 0.1).name('Волокна бумаги (0..10)').onChange(v => {
  const norm = v * 0.08;
  ribbons.forEach(r => {
    r.material.uniforms.uFiberIntensity.value = norm;
    r.splitMaterial.uniforms.uFiberIntensity.value = norm;
  });
});
fPaper.add(params, 'widthSpeed', 0.0, 10.0, 0.1).name('Скорость дыхания (0..10)').onChange(v => {
  ribbons.forEach(r => r.widthSpeed = v * 0.08);
});
fPaper.add(params, 'centerTaperStrength', 0.0, 10.0, 0.1).name('Сужение к центру (0..10)').onChange(v => {
  ribbons.forEach(r => r.centerTaperStrength = v * 0.10);
});
fPaper.add(params, 'centerTaperRadius', 1.0, 10.0, 0.1).name('Радиус сужения (1..10)').onChange(v => {
  ribbons.forEach(r => r.centerTaperRadius = v * 0.06);
});
fPaper.add(params, 'headTaperLength', 1.0, 10.0, 0.1).name('Длина острия (1..10)').onChange(v => {
  ribbons.forEach(r => r.headTaperLength = v * 0.03);
});
fPaper.add(params, 'headTipWidth', 0.0, 10.0, 0.1).name('Толщина острия (0..10)').onChange(v => {
  ribbons.forEach(r => r.headTipWidth = v * 0.01);
});

// Подпапка: Независимая толщина мазков
const fWidthVar = fPaper.addFolder('🔀 Независимая толщина мазков');
fWidthVar.add(params, 'independentWidth').name('Вкл. независимую толщину').onChange(v => {
  ribbons.forEach(r => r.independentWidth = v);
});
fWidthVar.add(params, 'widthAsymmetry', 0.0, 10.0, 0.1).name('Асинхронность (0..10)').onChange(v => {
  applyWidthAsymmetry(v);
});
fWidthVar.add({ reroll: rerollBrushWidths }, 'reroll').name('🎲 Новые ритмы толщины');

const fBg = gui.addFolder('Фон и оптика');
fBg.add(params, 'bgGradient').name('Градиентный фон').onChange(v => {
  kaleidoscopeMaterial.uniforms.uBgType.value = v ? 1.0 : 0.0;
});
fBg.addColor(params, 'bgInner').name('Центр фона').onChange(hex => {
  kaleidoscopeMaterial.uniforms.uBgInner.value.set(hex);
});
fBg.addColor(params, 'bgOuter').name('Края фона').onChange(hex => {
  kaleidoscopeMaterial.uniforms.uBgOuter.value.set(hex);
});
fBg.add(params, 'vignette', 0.0, 1.0, 0.05).name('Виньетка').onChange(v => {
  kaleidoscopeMaterial.uniforms.uVignette.value = v;
});
fBg.add(params, 'filmGrain', 0.0, 10.0, 0.1).name('Зернистость плёнки (0..10)').onChange(v => {
  kaleidoscopeMaterial.uniforms.uFilmGrain.value = v;
});

// Папка: Управление сохранением (localStorage)
const fStorage = gui.addFolder('💾 Настройки и память (localStorage)');
fStorage.add({ saveNow: () => saveCurrentSettings(true) }, 'saveNow').name('💾 Запомнить сейчас');
fStorage.add(storageParams, 'autoSave').name('🔄 Автосохранение правок');
fStorage.add({ resetNow: resetToDefaultSettings }, 'resetNow').name('↺ Сбросить к заводским');
fStorage.close();

// Listen for any controller adjustments to automatically save if autoSave is active
gui.onFinishChange(() => {
  if (!isRestoringSettings && storageParams.autoSave) {
    saveCurrentSettings(false);
  }
});

// Restore saved settings on startup if present in localStorage
loadSavedSettings(true);

// Resize Handler: maintains aspect ratio for both display shader and debug camera
function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  renderer.setSize(w, h);
  kaleidoscopeMaterial.uniforms.uAspect.value = aspect;

  // Tightly fitted strokeExtent: allocates maximum texel density to the actual mandala strokes
  const strokeExtent = 1.05;

  strokeCamera.left = -strokeExtent;
  strokeCamera.right = strokeExtent;
  strokeCamera.top = strokeExtent;
  strokeCamera.bottom = -strokeExtent;
  strokeCamera.updateProjectionMatrix();

  kaleidoscopeMaterial.uniforms.uStrokeScale.value = 0.7 / strokeExtent;

  debugCamera.left = -0.7 * aspect;
  debugCamera.right = 0.7 * aspect;
  debugCamera.top = 0.7;
  debugCamera.bottom = -0.7;
  debugCamera.updateProjectionMatrix();

  debugBgMesh.scale.set(aspect * 2.0, 2.0, 1);
}
window.addEventListener('resize', handleResize);

// ── Performance Telemetry & Metrics HUD ──
const hudPerf = document.getElementById('hud-perf');
const perfFpsEl = document.getElementById('perf-fps');
const perfFrameTimeEl = document.getElementById('perf-frametime');
const perfCpuEl = document.getElementById('perf-cpu');
const perfGpuEl = document.getElementById('perf-gpu');
const perfDrawsEl = document.getElementById('perf-draws');
const perfFboEl = document.getElementById('perf-fbo');

let lastPerfSampleTime = performance.now();
let lastPostTime = performance.now();
let prevRafTime = performance.now();
let frameCounter = 0;
let accumCpuMs = 0;
let accumGpuMs = 0;
let accumFrameMs = 0;
let maxFrameIntervalMs = 0;

// High-precision frame timing history & jank analysis
const frameIntervalHistory = [];
let jankFramesCount = 0;
let severeJankFramesCount = 0;
let prevTotalTrailShifts = 0;

let liveMetrics = {
  fps: 60,
  frameTimeMs: 16.6,
  maxIntervalMs: 16.6,
  p50IntervalMs: 16.6,
  p95IntervalMs: 16.6,
  p99IntervalMs: 16.6,
  jankFrames: 0,
  severeJankFrames: 0,
  trailShiftsPerSec: 0,
  cpuMs: 1.0,
  gpuMs: 15.6,
  drawCalls: 0,
  triangles: 0
};

function sendPerfTelemetry(metrics) {
  try {
    fetch('/api/perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    }).catch(() => {});
  } catch (e) {}
}

// 6. Animation Loop
const clock = new THREE.Clock();
let currentRotation = 0.0;

function animate(rafTimestamp) {
  requestAnimationFrame(animate);

  const tFrameStart = performance.now();
  const rafDelta = (prevRafTime > 0) ? (tFrameStart - prevRafTime) : 16.6;
  prevRafTime = tFrameStart;

  frameIntervalHistory.push(rafDelta);
  if (frameIntervalHistory.length > 240) {
    frameIntervalHistory.shift();
  }

  if (rafDelta > 22.0) {
    jankFramesCount++;
  }
  if (rafDelta > 35.0) {
    severeJankFramesCount++;
  }
  if (rafDelta > maxFrameIntervalMs) {
    maxFrameIntervalMs = rafDelta;
  }

  // Reset multi-pass counters for this frame
  renderer.info.reset();

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // 1. Update Fish Ribbons (Kinematics, wave, splitting on CPU)
  const tCpuStart = performance.now();
  ribbons.forEach(ribbon => {
    ribbon.update(elapsedTime, delta);
  });

  // 1b. Update debug overlay (reads updated spine data)
  brushDebug.update();
  const tCpuEnd = performance.now();
  const cpuMs = tCpuEnd - tCpuStart;

  // 2. Render passes on GPU
  const tGpuStart = performance.now();

  // Render Strokes into Offscreen FBO
  renderer.setRenderTarget(strokeRenderTarget);
  if (!params.persistentCanvas) {
    renderer.setClearColor(0x000000, 0.0); // Transparent background for strokes
    renderer.clear();
  }
  renderer.render(strokeScene, strokeCamera);

  // 3. Render to Screen
  renderer.setRenderTarget(null);

  if (brushDebugMode) {
    // ── Debug mode: render strokeScene directly, full screen ──
    renderer.setClearColor(0x0a0c14, 1.0);
    renderer.clear();
    renderer.render(strokeScene, debugCamera);
  } else {
    // ── Normal mode: mandala display pass ─────────────────────
    if (params.autoRotate) {
      currentRotation += delta * params.rotationSpeed;
    }
    kaleidoscopeMaterial.uniforms.uRotation.value = currentRotation;
    kaleidoscopeMaterial.uniforms.uTime.value = elapsedTime;

    renderer.render(mainScene, mainCamera);
  }

  const tGpuEnd = performance.now();
  const gpuMs = tGpuEnd - tGpuStart;
  const frameMs = performance.now() - tFrameStart;

  // Telemetry accumulation
  frameCounter++;
  accumCpuMs += cpuMs;
  accumGpuMs += gpuMs;
  accumFrameMs += frameMs;

  const now = performance.now();
  const sampleElapsed = now - lastPerfSampleTime;

  if (sampleElapsed >= 500) {
    const avgFps = Math.round((frameCounter / (sampleElapsed / 1000)) * 10) / 10;
    const avgFrameTime = Math.round((accumFrameMs / frameCounter) * 10) / 10;
    const avgCpu = Math.round((accumCpuMs / frameCounter) * 10) / 10;
    const avgGpu = Math.round((accumGpuMs / frameCounter) * 10) / 10;
    const maxInterval = Math.round(maxFrameIntervalMs * 10) / 10;
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;

    // Percentiles of true frame intervals
    const sortedIntervals = [...frameIntervalHistory].sort((a, b) => a - b);
    const p50 = sortedIntervals.length > 0 ? Math.round(sortedIntervals[Math.floor(sortedIntervals.length * 0.50)] * 10) / 10 : 16.6;
    const p95 = sortedIntervals.length > 0 ? Math.round(sortedIntervals[Math.floor(sortedIntervals.length * 0.95)] * 10) / 10 : 16.6;
    const p99 = sortedIntervals.length > 0 ? Math.round(sortedIntervals[Math.floor(sortedIntervals.length * 0.99)] * 10) / 10 : 16.6;

    // Kinematic trail shifts rate
    const currentTotalShifts = ribbons.reduce((sum, r) => sum + (r.shiftCount || 0), 0);
    const shiftsInWindow = currentTotalShifts - prevTotalTrailShifts;
    prevTotalTrailShifts = currentTotalShifts;
    const trailShiftsPerSec = Math.round((shiftsInWindow / (sampleElapsed / 1000)) * 10) / 10;

    liveMetrics = {
      fps: avgFps,
      frameTimeMs: avgFrameTime,
      maxIntervalMs: maxInterval,
      p50IntervalMs: p50,
      p95IntervalMs: p95,
      p99IntervalMs: p99,
      jankFrames: jankFramesCount,
      severeJankFrames: severeJankFramesCount,
      trailShiftsPerSec: trailShiftsPerSec,
      cpuMs: avgCpu,
      gpuMs: avgGpu,
      drawCalls: calls,
      triangles: triangles
    };

    if (perfFpsEl) {
      perfFpsEl.textContent = `${avgFps.toFixed(1)} FPS`;
      perfFpsEl.style.color = avgFps >= 55 ? '#48bb78' : (avgFps >= 35 ? '#ecc94b' : '#f56565');
    }
    if (perfFrameTimeEl) {
      const isNarrow = window.innerWidth <= 600;
      perfFrameTimeEl.textContent = isNarrow
        ? `${avgFrameTime.toFixed(1)}ms`
        : `${avgFrameTime.toFixed(1)}ms (p95: ${p95.toFixed(0)}ms, max: ${maxInterval.toFixed(0)}ms)`;
    }
    if (perfCpuEl) perfCpuEl.textContent = `CPU: ${avgCpu.toFixed(1)}ms`;
    if (perfGpuEl) perfGpuEl.textContent = `GPU: ${avgGpu.toFixed(1)}ms`;
    if (perfDrawsEl) perfDrawsEl.textContent = `${calls} calls · ${(triangles / 1000).toFixed(1)}k tris`;
    if (perfFboEl) perfFboEl.textContent = `${currentFboSize}px · Trail: ${trailShiftsPerSec}Hz`;

    frameCounter = 0;
    accumCpuMs = 0;
    accumGpuMs = 0;
    accumFrameMs = 0;
    maxFrameIntervalMs = 0;
    jankFramesCount = 0;
    severeJankFramesCount = 0;
    lastPerfSampleTime = now;
  }

  // Periodic report to server every 1.5s
  if (now - lastPostTime >= 1500) {
    lastPostTime = now;
    console.log(
      `[PERF LOG] FPS: ${liveMetrics.fps} | Frame: ${liveMetrics.frameTimeMs}ms (p95: ${liveMetrics.p95IntervalMs}ms, max: ${liveMetrics.maxIntervalMs}ms) | CPU: ${liveMetrics.cpuMs}ms | GPU: ${liveMetrics.gpuMs}ms | Trail shifts: ${liveMetrics.trailShiftsPerSec} Hz | Janks: ${liveMetrics.jankFrames}`
    );
    sendPerfTelemetry({
      ...liveMetrics,
      timestamp: Date.now(),
      fboSize: currentFboSize,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio,
      sectors: params.sectors,
      mirror: params.mirror,
      bifurcatedCount: ribbons.filter(r => r.splitState !== 'CLOSED').length,
      isTabVisible: !document.hidden
    });
  }
}

animate();
