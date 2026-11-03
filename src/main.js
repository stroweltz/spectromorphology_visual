// --- App Version & Automatic Cache Invalidation ---
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.3.0';
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
import { mountControlPanel } from './ui/mount.tsx';
import { fpsStore } from './ui/fps-store.ts';
import { FishRibbon } from './ribbon/FishRibbon.js';
import { createKaleidoscopeMaterial } from './shaders/kaleidoscopeMaterial.js';
import { COLOR_THEMES } from './themes/colorThemes.js';
import { BrushDebugOverlay } from './ribbon/BrushDebugOverlay.js';

// --- Global Setup ---
const container = document.getElementById('canvas-container');
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(width, height);

// Detect software emulator (Microsoft Basic Render Driver, WARP, SwiftShader, llvmpipe)
function checkIsSoftwareRenderer(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const std = gl.getParameter(gl.RENDERER) || '';
    const full = (unmasked + ' ' + std).toLowerCase();
    return full.includes('basic render driver') ||
           full.includes('swiftshader') ||
           full.includes('llvmpipe') ||
           full.includes('software') ||
           full.includes('warp');
  } catch (e) {
    return false;
  }
}

const isSoftwareRenderer = checkIsSoftwareRenderer(renderer.getContext());
renderer.setPixelRatio(isSoftwareRenderer ? 1.0 : Math.min(window.devicePixelRatio, 2));
fpsStore.setEngine(renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1');
renderer.info.autoReset = false; // Allow multi-pass draw call and triangle accumulation
container.appendChild(renderer.domElement);

// 2. Offscreen Stroke Scene & FBO
// Configurable resolution for ultra-crisp paper fiber edges and optimal GPU fillrate
const isMobileOrIntegrated = (typeof window !== 'undefined' && (window.innerWidth <= 1024 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)));
const defaultFbo = isSoftwareRenderer ? 512 : (isMobileOrIntegrated ? 1536 : 1920);
let currentFboSize = defaultFbo;
const strokeRenderTarget = new THREE.WebGLRenderTarget(currentFboSize, currentFboSize, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  samples: 0 // 0 = disabled MSAA; paper shader has analytical AA!
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
    minTurnRadius: 0.08,
    color: 0xef2353,
    splitColor: 0xffaa00,
    segments: 140,
    maxWidth: 0.08,
    widthLimit: 0.032,            // Верхний потолок толщины (4.0 * 0.008)
    widthSpeed: 0.22,
    widthSpeedMult: 0.72,        // slower breathing rate
    widthPhase: 0.5 * Math.PI,
    widthHarmonicPhase: 1.2,
    speed: 1.1,
    waveFreq: 4.8,
    waveAmp: 0.0384,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.42,
    phaseOffset: 0.0,
    orbitSpeed: 0.2,
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
    minTurnRadius: 0.08,
    color: 0x00d2d3,
    splitColor: 0x10ac84,
    segments: 140,
    maxWidth: 0.075,
    widthLimit: 0.032,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 1.38,        // faster, energetic breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 0.66,
    widthHarmonicPhase: 3.7,
    speed: 1.25,
    waveFreq: 4.8,
    waveAmp: 0.0384,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.52,
    phaseOffset: Math.PI * 0.66,
    orbitSpeed: 0.2,
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
    minTurnRadius: 0.08,
    color: 0x9b59b6,
    splitColor: 0xff6b6b,
    segments: 140,
    maxWidth: 0.07,
    widthLimit: 0.032,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 0.96,        // intermediate breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 1.33,
    widthHarmonicPhase: 5.1,
    speed: 0.95,
    waveFreq: 4.8,
    waveAmp: 0.0384,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.30,
    phaseOffset: Math.PI * 1.33,
    orbitSpeed: 0.2,
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

const bgModeMap = {
  'solid': 0.0,
  'radial': 1.0,
  'nebula': 2.0,
  'waves': 3.0,
  'aurora': 4.0
};

const bgPresets = {
  '🌌 Полночный Индиго': {
    bgMode: 'nebula',
    bgOuter: '#030406',
    bgInner: '#0c1527',
    bgAccent: '#160a22',
    nebulaIntensity: 5.5,
    nebulaSpeed: 2.5,
    nebulaScale: 1.4,
    vignette: 0.75
  },
  '🍷 Винный Обсидиан': {
    bgMode: 'nebula',
    bgOuter: '#040205',
    bgInner: '#200814',
    bgAccent: '#140822',
    nebulaIntensity: 5.0,
    nebulaSpeed: 2.2,
    nebulaScale: 1.3,
    vignette: 0.8
  },
  '🌲 Изумрудный Петроль': {
    bgMode: 'nebula',
    bgOuter: '#020504',
    bgInner: '#061d19',
    bgAccent: '#081824',
    nebulaIntensity: 5.0,
    nebulaSpeed: 2.4,
    nebulaScale: 1.5,
    vignette: 0.75
  },
  '🌊 Глубоководный Пульс': {
    bgMode: 'waves',
    bgOuter: '#030508',
    bgInner: '#081a2e',
    bgAccent: '#0a2328',
    nebulaIntensity: 4.8,
    nebulaSpeed: 2.0,
    nebulaScale: 1.6,
    vignette: 0.7
  },
  '🌠 Северное Сияние': {
    bgMode: 'aurora',
    bgOuter: '#020406',
    bgInner: '#071f1a',
    bgAccent: '#0f142b',
    nebulaIntensity: 5.2,
    nebulaSpeed: 2.2,
    nebulaScale: 1.4,
    vignette: 0.75
  },
  '🌑 Монохромный Графит': {
    bgMode: 'nebula',
    bgOuter: '#030304',
    bgInner: '#15171e',
    bgAccent: '#0c0d11',
    nebulaIntensity: 4.5,
    nebulaSpeed: 2.0,
    nebulaScale: 1.5,
    vignette: 0.8
  },
  '⬛ Абсолютная Тьма': {
    bgMode: 'solid',
    bgOuter: '#020202',
    bgInner: '#050505',
    bgAccent: '#030303',
    nebulaIntensity: 0.0,
    nebulaSpeed: 1.0,
    nebulaScale: 1.0,
    vignette: 0.6
  }
};

const kaleidoscopeMaterial = createKaleidoscopeMaterial();

function applyBgMode(modeKey) {
  const val = bgModeMap[modeKey] ?? 2.0;
  kaleidoscopeMaterial.uniforms.uBgType.value = val;
}
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
  sectors: 8,
  mirror: true,
  autoRotate: false,
  rotationSpeed: 0.15,
  manualRotation: 0.0,
  zoom: 1.0,

  // Brush Motion & Trail Kinematics
  motionSpeed: 1.1,
  orbitSpeed: 0.2,
  boundaryRadius: 0.58,
  minTurnRadius: 0.08,
  fixedPathTrail: true,         // Фиксированный след: где нарисовано, там и лежит
  trailLength: 1.5,             // Длина шлейфа мазка (0.5..3.5)
  waveAmplitude: 4.8,           // Размах синусоиды [0..10] (3.5 = 0.028)
  waveFrequency: 4.8,           // Частота синусоиды вдоль пути
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
  strokeWidthLimit: 4.0,       // Потолок толщины [0..10] (10.0 = полная кисть 0.080)
  roughness: isSoftwareRenderer ? 0.0 : 3.5,     // Рваный край [0..10] (3.5 = 0.35)
  fiberIntensity: isSoftwareRenderer ? 0.0 : 3.5, // Волокна бумаги [0..10] (3.5 = 0.28)
  edgeBorder: 0.0,              // Кайма кромки / четкость перекрытий [0..10] (6.5 = 0.65)
  ribbonVolume: 0.0,            // 3D объём и блик ленты [0..10] (5.5 = 0.55)
  widthSpeed: 2.8,              // Скорость изменения толщины [0..10] (2.8 = 0.22)
  centerTaperStrength: 8.5,     // Сужение к центру [0..10] (8.5 = 0.85)
  centerTaperRadius: 5.8,       // Радиус сужения [1..10] (5.8 = 0.35)
  headTaperLength: 5.0,         // Длина наконечника [1..10] (5.0 = 0.15)
  headTipWidth: 2.0,            // Толщина острия [0..10] (2.0 = 0.02)
  independentWidth: true,       // Независимая толщина мазков
  widthAsymmetry: 6.5,          // Степень асинхронности [0..10]

  // Color Themes & Harmonized Palette
  colorTheme: '🌌 Авторский Оригинал (Полночный Индиго)',
  toneMappingMode: 'none',
  layer1Color: '#ef2353',
  layer1Split: '#ffaa00',
  layer2Color: '#00d2d3',
  layer2Split: '#10ac84',
  layer3Color: '#9b59b6',
  layer3Split: '#ff6b6b',

  // Background & Atmosphere
  bgMode: isSoftwareRenderer ? 'radial' : 'nebula',
  bgPreset: '🌑 Монохромный Графит',
  bgInner: '#0c1527',
  bgOuter: '#030406',
  bgAccent: '#160a22',
  nebulaIntensity: 5.5,
  nebulaSpeed: 2.5,
  nebulaScale: 1.4,
  vignette: 0.75,
  dropShadow: 0.0,              // Тень мандалы на фон [0..10] (5.0 = 0.50)
  filmGrain: 0.0,

  // Neon Bloom & Photonic Glow (Controllable & subtle by default to preserve paper texture)
  bloomEnabled: true,
  neonBloom: 0.35,              // Деликатное свечение (0.0 = чистая бумага, 1.0 = тяжелый неон)
  bloomRadius: 12.0,            // Радиус размытия ореола (px)
  bloomContrast: 2.5,           // Отсечка темного фона (только мазки дают свечение)

  // Performance & Graphics
  fboResolution: defaultFbo,
  screenDpi: isSoftwareRenderer ? 1.0 : 1.5,
  autoRadiusCoupling: true,
  keepAwake: true,              // Не давать экрану гаснуть (Wake Lock для вечеринок/VJ)
  batteryEcoMode: false         // Эко-режим только при работе от батареи
};

// Sync initial background uniforms with params
applyBgMode(params.bgMode);
kaleidoscopeMaterial.uniforms.uBgInner.value.set(params.bgInner);
kaleidoscopeMaterial.uniforms.uBgOuter.value.set(params.bgOuter);
kaleidoscopeMaterial.uniforms.uBgAccent.value.set(params.bgAccent);
kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = params.nebulaIntensity * 0.10;
kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = params.nebulaSpeed * 0.10;
kaleidoscopeMaterial.uniforms.uNebulaScale.value = params.nebulaScale;
kaleidoscopeMaterial.uniforms.uVignette.value = params.vignette;
kaleidoscopeMaterial.uniforms.uFilmGrain.value = params.filmGrain;
kaleidoscopeMaterial.uniforms.uDropShadow.value = params.dropShadow * 0.10;

// Sync initial paper material uniforms
ribbons.forEach(r => {
  r.material.uniforms.uRoughness.value = params.roughness * 0.10;
  r.splitMaterial.uniforms.uRoughness.value = params.roughness * 0.10;
  r.material.uniforms.uFiberIntensity.value = params.fiberIntensity * 0.08;
  r.splitMaterial.uniforms.uFiberIntensity.value = params.fiberIntensity * 0.08;
  r.material.uniforms.uEdgeBorder.value = params.edgeBorder * 0.10;
  r.splitMaterial.uniforms.uEdgeBorder.value = params.edgeBorder * 0.10;
  r.material.uniforms.uRibbonVolume.value = params.ribbonVolume * 0.10;
  r.splitMaterial.uniforms.uRibbonVolume.value = params.ribbonVolume * 0.10;
});

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


// ── Curated Master Color Themes Integration ────────────────
function applyColorTheme(themeKey) {
  const t = COLOR_THEMES[themeKey];
  if (!t) return;
  params.colorTheme = themeKey;
  params.bgOuter = t.bgOuter;
  params.bgInner = t.bgInner;
  if (t.bgAccent) params.bgAccent = t.bgAccent;
  params.vignette = t.vignette;
  params.bgMode = t.bgMode || 'nebula';
  if (t.nebulaIntensity !== undefined) params.nebulaIntensity = t.nebulaIntensity;
  if (t.nebulaScale !== undefined) params.nebulaScale = t.nebulaScale;
  if (t.nebulaSpeed !== undefined) params.nebulaSpeed = t.nebulaSpeed;

  applyBgMode(params.bgMode);
  kaleidoscopeMaterial.uniforms.uBgOuter.value.set(params.bgOuter);
  kaleidoscopeMaterial.uniforms.uBgInner.value.set(params.bgInner);
  if (params.bgAccent) kaleidoscopeMaterial.uniforms.uBgAccent.value.set(params.bgAccent);
  if (params.nebulaIntensity !== undefined) kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = params.nebulaIntensity * 0.10;
  if (params.nebulaScale !== undefined) kaleidoscopeMaterial.uniforms.uNebulaScale.value = params.nebulaScale;
  if (params.nebulaSpeed !== undefined) kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = params.nebulaSpeed * 0.10;
  kaleidoscopeMaterial.uniforms.uVignette.value = params.vignette;

  t.layers.forEach((l, idx) => {
    if (ribbons[idx]) {
      ribbons[idx].setColors(l.color, l.splitColor);
    }
  });

  if (brushDebug && typeof brushDebug.updateColors === 'function') {
    brushDebug.updateColors(ribbons);
  }

  params.layer1Color = t.layers[0].color;
  params.layer1Split = t.layers[0].splitColor;
  params.layer2Color = t.layers[1].color;
  params.layer2Split = t.layers[1].splitColor;
  params.layer3Color = t.layers[2].color;
  params.layer3Split = t.layers[2].splitColor;

  if (t.toneMappingMode) {
    params.toneMappingMode = t.toneMappingMode;
    renderer.toneMapping = (t.toneMappingMode === 'agx') ? THREE.AgXToneMapping : THREE.NoToneMapping;
  }
}

// ── Bloom Canvas Setup (Soft Photonic Glow Overlay) ──
const bloomCanvas = document.getElementById('bloom-canvas');
const bctx = bloomCanvas ? bloomCanvas.getContext('2d') : null;

function updateBloomCanvasStyle() {
  if (!bloomCanvas) return;
  const intensity = params.neonBloom ?? 0.0;
  if (!params.bloomEnabled || intensity <= 0.005) {
    bloomCanvas.style.opacity = '0';
    bloomCanvas.style.display = 'none';
    if (bctx) bctx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    return;
  }
  bloomCanvas.style.display = 'block';
  bloomCanvas.style.opacity = String(intensity * 0.95);
  bloomCanvas.style.filter = `blur(${params.bloomRadius || 12}px) saturate(1.35)`;
}

function resizeBloomCanvas() {
  if (!bloomCanvas) return;
  bloomCanvas.width = Math.max(2, Math.round(window.innerWidth / 5));
  bloomCanvas.height = Math.max(2, Math.round(window.innerHeight / 5));
  updateBloomCanvasStyle();
}
resizeBloomCanvas();
window.addEventListener('resize', resizeBloomCanvas);

// ── LocalStorage Settings Persistence ──
const STORAGE_KEY = 'spectromorphology_user_settings_v2_0';

function saveCurrentSettings() {
  try {
    const data = {
      params: { ...params },
      layerParams: {
        core: {
          visible: ribbons[0]?.group.visible ?? true,
          primary: params.layer1Color,
          split: params.layer1Split
        },
        middle: {
          visible: ribbons[1]?.group.visible ?? true,
          primary: params.layer2Color,
          split: params.layer2Split
        },
        orbit: {
          visible: ribbons[2]?.group.visible ?? true,
          primary: params.layer3Color,
          split: params.layer3Split
        }
      },
      initialSpeedRatios: [...initialSpeedRatios],
      initialWidthRatios: [...initialWidthRatios],
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.params) return false;

    if (Array.isArray(data.initialSpeedRatios) && data.initialSpeedRatios.length === 3) {
      for (let i = 0; i < 3; i++) initialSpeedRatios[i] = data.initialSpeedRatios[i];
    }
    if (Array.isArray(data.initialWidthRatios) && data.initialWidthRatios.length === 3) {
      for (let i = 0; i < 3; i++) initialWidthRatios[i] = data.initialWidthRatios[i];
    }

    Object.assign(params, data.params);

    if (data.layerParams) {
      if (data.layerParams.core && ribbons[0]) {
        ribbons[0].group.visible = data.layerParams.core.visible !== false;
      }
      if (data.layerParams.middle && ribbons[1]) {
        ribbons[1].group.visible = data.layerParams.middle.visible !== false;
      }
      if (data.layerParams.orbit && ribbons[2]) {
        ribbons[2].group.visible = data.layerParams.orbit.visible !== false;
      }
    }

    applyAllParams();
    return true;
  } catch (err) {
    console.error('Failed to load settings:', err);
    return false;
  }
}

function applyAllParams() {
  updateAllInstances();
  applyBgMode(params.bgMode);
  kaleidoscopeMaterial.uniforms.uBgOuter.value.set(params.bgOuter);
  kaleidoscopeMaterial.uniforms.uBgInner.value.set(params.bgInner);
  if (params.bgAccent) kaleidoscopeMaterial.uniforms.uBgAccent.value.set(params.bgAccent);
  kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = params.nebulaIntensity * 0.10;
  kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = params.nebulaSpeed * 0.10;
  kaleidoscopeMaterial.uniforms.uNebulaScale.value = params.nebulaScale;
  kaleidoscopeMaterial.uniforms.uVignette.value = params.vignette;
  kaleidoscopeMaterial.uniforms.uFilmGrain.value = params.filmGrain * 0.10;
  kaleidoscopeMaterial.uniforms.uDropShadow.value = params.dropShadow * 0.10;
  kaleidoscopeMaterial.uniforms.uStrokeScale.value = (0.7 / initStrokeExtent) * (params.zoom || 1.0);

  if (params.toneMappingMode === 'agx') {
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
  } else {
    renderer.toneMapping = THREE.NoToneMapping;
  }

  ribbons.forEach((r, idx) => {
    r.widthLimit = params.strokeWidthLimit * 0.008;
    r.material.uniforms.uRoughness.value = params.roughness * 0.10;
    r.splitMaterial.uniforms.uRoughness.value = params.roughness * 0.10;
    r.material.uniforms.uFiberIntensity.value = params.fiberIntensity * 0.08;
    r.splitMaterial.uniforms.uFiberIntensity.value = params.fiberIntensity * 0.08;
    r.material.uniforms.uEdgeBorder.value = params.edgeBorder * 0.10;
    r.splitMaterial.uniforms.uEdgeBorder.value = params.edgeBorder * 0.10;
    r.material.uniforms.uRibbonVolume.value = params.ribbonVolume * 0.10;
    r.splitMaterial.uniforms.uRibbonVolume.value = params.ribbonVolume * 0.10;

    r.speed = params.motionSpeed;
    r.orbitSpeed = params.orbitSpeed;
    r.maxBoundaryRadius = params.boundaryRadius;
    r.minTurnRadius = params.minTurnRadius;
    r.waveAmp = params.waveAmplitude * 0.008;
    r.waveFreq = params.waveFrequency;
    r.splitChance = params.splitChance;
    r.splitDuration = params.splitDuration;
    r.splitSeparation = (params.splitSeparation * 0.065) / 5.0;
  });

  if (params.layer1Color && params.layer1Split && ribbons[0]) ribbons[0].setColors(params.layer1Color, params.layer1Split);
  if (params.layer2Color && params.layer2Split && ribbons[1]) ribbons[1].setColors(params.layer2Color, params.layer2Split);
  if (params.layer3Color && params.layer3Split && ribbons[2]) ribbons[2].setColors(params.layer3Color, params.layer3Split);

  updateBloomCanvasStyle();
}

// ── Mount Luxury Spectromorphology Control Rack ──
const uiContainer = document.getElementById('ui-root');
if (uiContainer) {
  const engineBridge = {
    getInitialSettings() {
      return {
        sectors: params.sectors,
        mirror: params.mirror,
        autoRotate: params.autoRotate,
        rotateSpeed: params.rotationSpeed,
        zoom: Math.round(params.zoom * 100),

        theme: params.colorTheme,
        colorTheme: params.colorTheme,
        toneMap: params.toneMappingMode === 'agx' ? 'agx' : 'raw',
        layers: {
          core: {
            visible: ribbons[0]?.group.visible ?? true,
            primary: params.layer1Color,
            split: params.layer1Split
          },
          middle: {
            visible: ribbons[1]?.group.visible ?? true,
            primary: params.layer2Color,
            split: params.layer2Split
          },
          orbit: {
            visible: ribbons[2]?.group.visible ?? true,
            primary: params.layer3Color,
            split: params.layer3Split
          }
        },

        strokeWidth: params.strokeWidthLimit,
        roughEdge: params.roughness / 10.0,
        fiberDensity: params.fiberIntensity / 10.0,
        darkEdge: params.edgeBorder / 10.0,
        highlight: params.ribbonVolume / 10.0,
        breathSpeed: params.widthSpeed / 3.5,
        centerTaper: params.centerTaperStrength / 10.0,
        tipSharpness: Math.max(0, 1.0 - (params.headTipWidth / 0.05)),

        moveSpeed: params.motionSpeed,
        orbitSpeed: params.orbitSpeed,
        boundaryRadius: params.boundaryRadius,
        minTurnRadius: params.minTurnRadius,
        safeTurn: params.autoRadiusCoupling,
        wobbleAmp: params.waveAmplitude / 10.0,
        wobbleFreq: params.waveFrequency,
        splitChance: Math.round(params.splitChance * 100),
        branchSeparation: params.splitSeparation / 10.0,
        splitDuration: params.splitDuration,

        bloomEnabled: params.bloomEnabled ?? true,
        neonBloom: params.neonBloom ?? 0.35,
        bloomRadius: params.bloomRadius ?? 12.0,
        bloomContrast: params.bloomContrast ?? 2.5,

        bgMode: params.bgMode,
        glow: params.nebulaIntensity / 10.0,
        pulseSpeed: params.nebulaSpeed / 10.0,
        bgScale: params.nebulaScale,
        vignette: params.vignette,
        grain: params.filmGrain / 10.0,
        bgCenter: params.bgInner,
        bgAccent: params.bgAccent,
        bgDeep: params.bgOuter,

        persistent: params.persistentCanvas,
        resolution: params.fboResolution,
        wakeLock: params.keepAwake
      };
    },
    getThemes() {
      return Object.keys(COLOR_THEMES).map(k => {
        const t = COLOR_THEMES[k];
        return {
          id: t.id || k,
          title: k,
          name: t.title || k,
          mood: t.archetype,
          archetype: t.archetype,
          colors: t.colors || [t.layers[0].color, t.layers[1]?.color || '#00d2d3', t.layers[2]?.color || '#9b59b6'],
          bg: t.bg || { center: t.bgInner, accent: t.bgAccent, deep: t.bgOuter },
          bgMode: t.bgMode,
          layers: t.layers
        };
      });
    },
    onParamChange(key, value) {
      switch (key) {
        case 'sectors':
          params.sectors = value;
          updateAllInstances();
          break;
        case 'mirror':
          params.mirror = value;
          updateAllInstances();
          break;
        case 'autoRotate':
          params.autoRotate = value;
          break;
        case 'rotateSpeed':
          params.rotationSpeed = value;
          break;
        case 'zoom':
          params.zoom = value / 100.0;
          kaleidoscopeMaterial.uniforms.uStrokeScale.value = (0.7 / initStrokeExtent) * (value / 100.0);
          break;
        case 'toneMap':
          if (value === 'agx') {
            renderer.toneMapping = THREE.AgXToneMapping;
            renderer.toneMappingExposure = 1.0;
            params.toneMappingMode = 'agx';
          } else {
            renderer.toneMapping = THREE.NoToneMapping;
            params.toneMappingMode = 'none';
          }
          break;
        case 'strokeWidth':
          params.strokeWidthLimit = value;
          ribbons.forEach(r => r.widthLimit = value * 0.008);
          break;
        case 'roughEdge':
          params.roughness = value * 10;
          ribbons.forEach(r => {
            r.material.uniforms.uRoughness.value = value;
            r.splitMaterial.uniforms.uRoughness.value = value;
          });
          break;
        case 'fiberDensity':
          params.fiberIntensity = value * 10;
          ribbons.forEach(r => {
            r.material.uniforms.uFiberIntensity.value = value * 0.8;
            r.splitMaterial.uniforms.uFiberIntensity.value = value * 0.8;
          });
          break;
        case 'darkEdge':
          params.edgeBorder = value * 10;
          ribbons.forEach(r => {
            r.material.uniforms.uEdgeBorder.value = value;
            r.splitMaterial.uniforms.uEdgeBorder.value = value;
          });
          break;
        case 'highlight':
          params.ribbonVolume = value * 10;
          ribbons.forEach(r => {
            r.material.uniforms.uRibbonVolume.value = value;
            r.splitMaterial.uniforms.uRibbonVolume.value = value;
          });
          break;
        case 'breathSpeed':
          params.widthSpeed = value * 3.5;
          ribbons.forEach(r => r.widthSpeed = value * 0.22);
          break;
        case 'centerTaper':
          params.centerTaperStrength = value * 10;
          ribbons.forEach(r => r.centerTaperStrength = value);
          break;
        case 'tipSharpness':
          params.headTipWidth = (1.0 - value) * 0.05;
          ribbons.forEach(r => r.headTipWidth = (1.0 - value) * 0.05);
          break;
        case 'moveSpeed':
          params.motionSpeed = value;
          ribbons.forEach(r => r.speed = value);
          break;
        case 'orbitSpeed':
          params.orbitSpeed = value;
          ribbons.forEach(r => r.orbitSpeed = value);
          break;
        case 'boundaryRadius':
          params.boundaryRadius = value;
          ribbons.forEach(r => r.maxBoundaryRadius = value);
          break;
        case 'minTurnRadius':
          params.minTurnRadius = value;
          ribbons.forEach(r => r.minTurnRadius = value);
          break;
        case 'safeTurn':
          params.autoRadiusCoupling = value;
          break;
        case 'wobbleAmp':
          params.waveAmplitude = value * 10;
          ribbons.forEach(r => r.waveAmp = value * 0.08);
          break;
        case 'wobbleFreq':
          params.waveFrequency = value;
          ribbons.forEach(r => r.waveFreq = value);
          break;
        case 'splitChance':
          params.splitChance = value / 100.0;
          ribbons.forEach(r => r.splitChance = value / 100.0);
          break;
        case 'branchSeparation':
          params.splitSeparation = value * 10;
          ribbons.forEach(r => r.splitSeparation = (value * 0.065) / 0.5);
          break;
        case 'splitDuration':
          params.splitDuration = value;
          ribbons.forEach(r => r.splitDuration = value);
          break;
        case 'bloomEnabled':
          params.bloomEnabled = value;
          updateBloomCanvasStyle();
          break;
        case 'neonBloom':
          params.neonBloom = value;
          updateBloomCanvasStyle();
          break;
        case 'bloomRadius':
          params.bloomRadius = value;
          updateBloomCanvasStyle();
          break;
        case 'bloomContrast':
          params.bloomContrast = value;
          break;
        case 'bgMode':
          params.bgMode = value;
          applyBgMode(value);
          break;
        case 'glow':
          params.nebulaIntensity = value * 10;
          kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = value;
          break;
        case 'pulseSpeed':
          params.nebulaSpeed = value * 10;
          kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = value * 0.25;
          break;
        case 'bgScale':
          params.nebulaScale = value;
          kaleidoscopeMaterial.uniforms.uNebulaScale.value = value;
          break;
        case 'vignette':
          params.vignette = value;
          kaleidoscopeMaterial.uniforms.uVignette.value = value;
          break;
        case 'grain':
          params.filmGrain = value * 10;
          kaleidoscopeMaterial.uniforms.uFilmGrain.value = value * 0.1;
          break;
        case 'bgCenter':
          params.bgInner = value;
          kaleidoscopeMaterial.uniforms.uBgInner.value.set(value);
          break;
        case 'bgAccent':
          params.bgAccent = value;
          kaleidoscopeMaterial.uniforms.uBgAccent.value.set(value);
          break;
        case 'bgDeep':
          params.bgOuter = value;
          kaleidoscopeMaterial.uniforms.uBgOuter.value.set(value);
          break;
        case 'persistent':
          params.persistentCanvas = value;
          break;
        case 'resolution':
          setFboResolution(value);
          break;
        case 'wakeLock':
          params.keepAwake = value;
          break;
      }
      saveCurrentSettings();
    },
    onLayerChange(layerId, partial) {
      const idx = layerId === 'core' ? 0 : layerId === 'middle' ? 1 : 2;
      const r = ribbons[idx];
      if (!r) return;
      if (partial.visible !== undefined) {
        r.group.visible = partial.visible;
      }
      if (partial.primary !== undefined) {
        r.material.uniforms.uBaseColor.value.set(partial.primary);
        if (idx === 0) params.layer1Color = partial.primary;
        else if (idx === 1) params.layer2Color = partial.primary;
        else if (idx === 2) params.layer3Color = partial.primary;
      }
      if (partial.split !== undefined) {
        r.splitMaterial.uniforms.uBaseColor.value.set(partial.split);
        if (idx === 0) params.layer1Split = partial.split;
        else if (idx === 1) params.layer2Split = partial.split;
        else if (idx === 2) params.layer3Split = partial.split;
      }
      saveCurrentSettings();
    },
    onApplyTheme(themeId) {
      const tKey = Object.keys(COLOR_THEMES).find(k => COLOR_THEMES[k].id === themeId || k === themeId);
      if (tKey) {
        applyColorTheme(tKey);
        saveCurrentSettings();
      }
    },
    onSplitNow() {
      ribbons.forEach(r => r.forceSplit());
    },
    onReroll() {
      const themeKeys = Object.keys(COLOR_THEMES);
      const randTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];
      applyColorTheme(randTheme);

      const sectorStops = [4, 6, 8, 12, 16, 24];
      params.sectors = sectorStops[Math.floor(Math.random() * sectorStops.length)];
      params.mirror = Math.random() > 0.3;
      updateAllInstances();

      rerollBrushSpeeds();
      rerollBrushWidths();
      saveCurrentSettings();
    },
    onClearCanvas() {
      renderer.setRenderTarget(strokeRenderTarget);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear();
      renderer.setRenderTarget(null);
    },
    onReset() {
      localStorage.removeItem(STORAGE_KEY);
      applyColorTheme('🌌 Авторский Оригинал (Полночный Индиго)');
      params.sectors = 8;
      params.mirror = true;
      params.zoom = 1.0;
      params.autoRotate = false;
      params.rotationSpeed = 0.15;
      params.motionSpeed = 1.1;
      params.orbitSpeed = 0.2;
      params.boundaryRadius = 0.58;
      params.minTurnRadius = 0.08;
      params.fixedPathTrail = true;
      params.trailLength = 1.5;
      params.waveAmplitude = 4.8;
      params.waveFrequency = 4.8;
      params.randomSpeedMode = true;
      params.speedVariance = 6.5;
      params.dynamicSpeedDrift = true;
      params.speedDriftIntensity = 5.5;
      params.strokeWidthLimit = 4.0;
      params.roughness = isSoftwareRenderer ? 0.0 : 3.5;
      params.fiberIntensity = isSoftwareRenderer ? 0.0 : 3.5;
      params.edgeBorder = 0.0;
      params.ribbonVolume = 0.0;
      params.widthSpeed = 2.8;
      params.centerTaperStrength = 8.5;
      params.centerTaperRadius = 5.8;
      params.headTaperLength = 5.0;
      params.headTipWidth = 2.0;
      params.independentWidth = true;
      params.widthAsymmetry = 6.5;
      params.bloomEnabled = true;
      params.neonBloom = 0.35;
      params.bloomRadius = 12.0;
      params.bloomContrast = 2.5;
      params.bgMode = 'nebula';
      params.bgPreset = '🌑 Монохромный Графит';
      params.bgInner = '#0c1527';
      params.bgOuter = '#030406';
      params.bgAccent = '#160a22';
      params.nebulaIntensity = 5.5;
      params.nebulaSpeed = 2.5;
      params.nebulaScale = 1.4;
      params.vignette = 0.75;
      params.dropShadow = 0.0;
      params.filmGrain = 0.0;
      params.persistentCanvas = false;
      initialSpeedRatios[0] = 0.82;
      initialSpeedRatios[1] = 1.26;
      initialSpeedRatios[2] = 1.02;
      initialWidthRatios[0] = 0.72;
      initialWidthRatios[1] = 1.38;
      initialWidthRatios[2] = 0.96;
      updateAllInstances();
      ribbons.forEach(r => {
        r.group.visible = true;
      });
      applyAllParams();
      updateBloomCanvasStyle();
      saveCurrentSettings();
    },
    onImport(raw) {
      if (!raw || typeof raw !== 'object') return false;
      try {
        for (const k of Object.keys(raw)) {
          if (k in params) {
            engineBridge.onParamChange(k, raw[k]);
          }
        }
        if (raw.layers) {
          if (raw.layers.core) engineBridge.onLayerChange('core', raw.layers.core);
          if (raw.layers.middle) engineBridge.onLayerChange('middle', raw.layers.middle);
          if (raw.layers.orbit) engineBridge.onLayerChange('orbit', raw.layers.orbit);
        }
        saveCurrentSettings();
        return true;
      } catch (e) {
        console.error('Import failed', e);
        return false;
      }
    }
  };

  // Restore saved settings on startup if present in localStorage
  loadSavedSettings();

  mountControlPanel(uiContainer, engineBridge);
}

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

// --- WebGL Context Loss & Restoration Safety ---
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  console.warn('[Spectromorphology] WebGL context lost. Awaiting restoration...');
}, false);

renderer.domElement.addEventListener('webglcontextrestored', () => {
  console.log('[Spectromorphology] WebGL context restored. Re-syncing buffers...');
  setFboResolution(currentFboSize);
}, false);

// Only report to server when running on local development server
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function sendPerfTelemetry(metrics) {
  if (!isDev) return;
  try {
    fetch('/api/perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    }).catch(() => {});
  } catch (e) {}
}

// ── Smart Display Sleep & Background Zero-GPU System ──
// 1. If screen turns off, locks, or tab is hidden: 0.0% CPU & 0.0% GPU (render loop completely halts).
// 2. While the screen is ON (or PC/laptop on mains power): runs at full high-performance (60 FPS)
//    without interrupting ambient viewing, DJ sets, or screensaver mode.
let isRunningOnBattery = false;
let rafId = null;

if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
  navigator.getBattery().then(b => {
    const syncBattery = () => { isRunningOnBattery = !b.charging; };
    syncBattery();
    b.addEventListener('chargingchange', syncBattery);
  }).catch(() => {});
}

// ── Screen Wake Lock (Keeps display awake during parties / ambient installations) ──
let screenWakeLock = null;
async function acquireWakeLock() {
  if ('wakeLock' in navigator && !screenWakeLock) {
    try {
      screenWakeLock = await navigator.wakeLock.request('screen');
      screenWakeLock.addEventListener('release', () => {
        screenWakeLock = null;
      });
    } catch (err) {}
  }
}
function releaseWakeLock() {
  if (screenWakeLock) {
    screenWakeLock.release().catch(() => {});
    screenWakeLock = null;
  }
}

// Automatically acquire Wake Lock when keepAwake is enabled
if (params.keepAwake) {
  acquireWakeLock();
}

// Low fillrate / software rasterizer fallback state
let hasAutoDegraded = false;
let consecutiveLowFpsCount = 0;

if (isSoftwareRenderer) {
  setTimeout(() => {
    showToast('🛡️ Софтверный режим CPU: оптимизировано (512px, 60 FPS)');
  }, 1000);
}

// Complete GPU shutdown when display sleeps, PC locks, or tab is hidden
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Screen turned off, PC locked, or tab minimized:
      // Cancel requestAnimationFrame completely -> 0% CPU, 0% GPU!
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      fpsStore.set(0, 0);
      if (perfFpsEl) {
        perfFpsEl.textContent = 'ЭКРАН ВЫКЛ (0% GPU)';
        perfFpsEl.style.color = '#a0aec0';
      }
    } else {
      // Screen turned back on: instantly resume 60 FPS without delta jump
      if (!rafId) {
        clock.getDelta();
        prevRafTime = performance.now();
        lastPerfSampleTime = performance.now();
        frameCounter = 0;
        accumCpuMs = 0;
        accumGpuMs = 0;
        accumFrameMs = 0;
        frameIntervalHistory.length = 0;
        rafId = requestAnimationFrame(animate);
        if (perfFpsEl) {
          perfFpsEl.textContent = '60.0 FPS';
          perfFpsEl.style.color = '#48bb78';
        }
        if (params.keepAwake) {
          acquireWakeLock();
        }
      }
    }
  });
}

// 6. Animation Loop
const clock = new THREE.Clock();
let currentRotation = 0.0;
let lastBatteryFrameTime = 0;

function animate(rafTimestamp) {
  // If display is off, PC locked, or tab hidden: halt immediately (0% GPU)
  if (typeof document !== 'undefined' && document.hidden) {
    rafId = null;
    return;
  }

  // Schedule next frame
  rafId = requestAnimationFrame(animate);

  const now = performance.now();

  // If user explicitly enabled batteryEcoMode AND device is on battery:
  if (params.batteryEcoMode && isRunningOnBattery) {
    if (now - lastBatteryFrameTime < 32.5) {
      return; // 30 FPS eco throttle to preserve battery
    }
  }
  lastBatteryFrameTime = now;

  const tFrameStart = performance.now();
  let rafDelta = (prevRafTime > 0) ? (tFrameStart - prevRafTime) : 16.6;
  prevRafTime = tFrameStart;

  // Flush stale background frame intervals upon waking up
  if (rafDelta > 150.0) {
    rafDelta = 16.6;
    frameIntervalHistory.length = 0;
  }

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

  const delta = Math.min(clock.getDelta(), 0.1);
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

    // Precompute CPU blob centers for background nebula (zero trigonometric calls on GPU)
    const tNeb = elapsedTime * params.nebulaSpeed * 0.10;
    const scale = Math.max(0.3, params.nebulaScale);
    kaleidoscopeMaterial.uniforms.uBlob1.value.set(Math.sin(tNeb * 0.35) * 0.42 * scale, Math.cos(tNeb * 0.27) * 0.30 * scale);
    kaleidoscopeMaterial.uniforms.uBlob2.value.set(Math.cos(tNeb * 0.31 + 2.1) * 0.46 * scale, Math.sin(tNeb * 0.43 + 1.2) * 0.34 * scale);
    kaleidoscopeMaterial.uniforms.uBlob3.value.set(Math.sin(tNeb * 0.19 + 4.2) * 0.15 * scale, Math.cos(tNeb * 0.24 + 3.1) * 0.15 * scale);
    kaleidoscopeMaterial.uniforms.uBlob4.value.set(Math.cos(tNeb * 0.22 + 5.1) * 0.32 * scale, Math.sin(tNeb * 0.25 + 2.4) * 0.36 * scale);
    kaleidoscopeMaterial.uniforms.uBreath.value = 0.82 + 0.18 * Math.sin(tNeb * 0.65);

    renderer.render(mainScene, mainCamera);

  // Soft Neon Bloom Layer update (every 2 frames at 1/5 downscaled resolution)
  if (frameCounter % 2 === 0 && bctx && bloomCanvas && params.bloomEnabled && (params.neonBloom ?? 0.0) > 0.005) {
    bctx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
    bctx.filter = `contrast(${params.bloomContrast || 2.5}) brightness(0.9)`;
    bctx.drawImage(renderer.domElement, 0, 0, bloomCanvas.width, bloomCanvas.height);
  }
  }

  const tGpuEnd = performance.now();
  const gpuMs = tGpuEnd - tGpuStart;
  const frameMs = performance.now() - tFrameStart;

  // Telemetry accumulation
  frameCounter++;
  accumCpuMs += cpuMs;
  accumGpuMs += gpuMs;
  accumFrameMs += frameMs;

  const nowMs = performance.now();
  const sampleElapsed = nowMs - lastPerfSampleTime;

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

    // Feed real-time telemetry to React toolbar badge
    fpsStore.set(Math.round(avgFps), avgFrameTime, calls, triangles);

    // Dynamic Fillrate Auto-Defense (if device struggles with full FBM/fillrate)
    if (avgFps < 15 && !hasAutoDegraded && (elapsedTime > 2.0 && elapsedTime < 25.0)) {
      consecutiveLowFpsCount++;
      if (consecutiveLowFpsCount >= 3) {
        hasAutoDegraded = true;
        console.warn('[Spectromorphology] Low fillrate detected (FPS: ' + avgFps + '). Activating Safe Lite Mode...');
        setFboResolution(512);
        renderer.setPixelRatio(1.0);
        ribbons.forEach(r => {
          r.material.uniforms.uRoughness.value = 0.0;
          r.material.uniforms.uFiberIntensity.value = 0.0;
          r.splitMaterial.uniforms.uRoughness.value = 0.0;
          r.splitMaterial.uniforms.uFiberIntensity.value = 0.0;
        });
        kaleidoscopeMaterial.uniforms.uDropShadow.value = 0.0;
        kaleidoscopeMaterial.uniforms.uBgType.value = 1.0;
        showToast('⚡ Авто-оптимизация: включен безопасный режим (512px, 60 FPS)');
      }
    } else if (avgFps >= 25) {
      consecutiveLowFpsCount = 0;
    }

    if (perfFpsEl) {
      const ecoTag = params.batteryEcoMode && isRunningOnBattery 
        ? ' [Eco 30]' 
        : (isSoftwareRenderer ? ' [CPU Safe]' : (hasAutoDegraded ? ' [Auto-Lite]' : ''));
      perfFpsEl.textContent = `${avgFps.toFixed(1)} FPS${ecoTag}`;
      perfFpsEl.style.color = avgFps >= 50 ? '#48bb78' : (avgFps >= 26 ? '#ecc94b' : '#f56565');
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
    lastPerfSampleTime = nowMs;
  }

  function getGpuInfo() {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const unmasked = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      const std = gl.getParameter(gl.RENDERER) || '';
      return unmasked || std || 'unknown';
    } catch (e) {
      return 'err: ' + e.message;
    }
  }

  // Periodic report to server every 1.5s
  if (nowMs - lastPostTime >= 1500) {
    lastPostTime = nowMs;
    sendPerfTelemetry({
      ...liveMetrics,
      timestamp: Date.now(),
      fboSize: currentFboSize,
      gpuRenderer: getGpuInfo(),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio,
      sectors: params.sectors,
      mirror: params.mirror,
      bifurcatedCount: ribbons.filter(r => r.splitState !== 'CLOSED').length,
      isTabVisible: !document.hidden
    });
  }
}

// Initial start of animation loop
rafId = requestAnimationFrame(animate);
