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
import { COLOR_THEMES, getThemeLayerColors } from './themes/colorThemes.js';
import { BrushDebugOverlay } from './ribbon/BrushDebugOverlay.js';
import { GravitySimulation } from './ribbon/gravity/GravitySimulation.js';
import { GravityBrushAgent } from './ribbon/gravity/GravityBrushAgent.js';

// --- Global Setup ---
const container = document.getElementById('canvas-container');
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.info.autoReset = false; // Allow multi-pass draw call and triangle accumulation
container.appendChild(renderer.domElement);

// 2. Offscreen Stroke Scene & FBO
// Configurable resolution for ultra-crisp paper fiber edges and optimal GPU fillrate
const isMobileOrIntegrated = (typeof window !== 'undefined' && (window.innerWidth <= 1024 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)));
const defaultFbo = isMobileOrIntegrated ? 1536 : 1920;
let currentFboSize = defaultFbo;
const strokeRenderTarget = new THREE.WebGLRenderTarget(currentFboSize, currentFboSize, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  samples: 1 // 1x sample: Zero MSAA resolve overhead; paper shader has analytical AA!
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
    segments: 100,
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
    segments: 100,
    maxWidth: 0.075,
    widthLimit: 0.032,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 1.38,        // faster, energetic breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 0.4,
    widthHarmonicPhase: 3.7,
    speed: 1.25,
    waveFreq: 4.8,
    waveAmp: 0.0384,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.52,
    phaseOffset: Math.PI * 0.4,
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
    segments: 100,
    maxWidth: 0.07,
    widthLimit: 0.032,            // Верхний потолок толщины
    widthSpeed: 0.22,
    widthSpeedMult: 0.96,        // intermediate breathing rate
    widthPhase: 0.5 * Math.PI + Math.PI * 0.8,
    widthHarmonicPhase: 5.1,
    speed: 0.95,
    waveFreq: 4.8,
    waveAmp: 0.0384,              // Фиксированная синусоида вдоль пути
    pathRadius: 0.30,
    phaseOffset: Math.PI * 0.8,
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
  }),
  // Layer 4: Warm Gold / Tangerine with Crimson split (orbital resonance bridge)
  new FishRibbon({
    minTurnRadius: 0.08,
    color: 0xf39c12,
    splitColor: 0xe74c3c,
    segments: 100,
    maxWidth: 0.075,
    widthLimit: 0.032,
    widthSpeed: 0.22,
    widthSpeedMult: 1.15,
    widthPhase: 0.5 * Math.PI + Math.PI * 1.2,
    widthHarmonicPhase: 2.3,
    speed: 1.12,
    waveFreq: 4.8,
    waveAmp: 0.0384,
    pathRadius: 0.46,
    phaseOffset: Math.PI * 1.2,
    orbitSpeed: 0.2,
    speedMultiplier: 1.12,
    speedWanderFreq: 0.32,
    speedSeed: 33.7,
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
  // Layer 5: Deep Sky Azure with Aquamarine split (outer orbital sweep)
  new FishRibbon({
    minTurnRadius: 0.08,
    color: 0x0984e3,
    splitColor: 0x00cec9,
    segments: 100,
    maxWidth: 0.07,
    widthLimit: 0.032,
    widthSpeed: 0.22,
    widthSpeedMult: 0.88,
    widthPhase: 0.5 * Math.PI + Math.PI * 1.6,
    widthHarmonicPhase: 4.4,
    speed: 1.05,
    waveFreq: 4.8,
    waveAmp: 0.0384,
    pathRadius: 0.38,
    phaseOffset: Math.PI * 1.6,
    orbitSpeed: 0.2,
    speedMultiplier: 0.94,
    speedWanderFreq: 0.25,
    speedSeed: 77.2,
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
  // Layer 6: Neon Fuchsia / Magenta with Sunburst split (cosmic halo envelope)
  new FishRibbon({
    minTurnRadius: 0.08,
    color: 0xe056fd,
    splitColor: 0xf0932b,
    segments: 100,
    maxWidth: 0.075,
    widthLimit: 0.032,
    widthSpeed: 0.22,
    widthSpeedMult: 1.22,
    widthPhase: 0.5 * Math.PI + Math.PI * 0.2,
    widthHarmonicPhase: 6.2,
    speed: 1.18,
    waveFreq: 4.8,
    waveAmp: 0.0384,
    pathRadius: 0.44,
    phaseOffset: Math.PI * 0.2,
    orbitSpeed: 0.2,
    speedMultiplier: 1.08,
    speedWanderFreq: 0.34,
    speedSeed: 112.5,
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

const gravitySim = new GravitySimulation({
  bodyCount: 5,
  G: 1.25,
  centralMass: 3.2,
  nBodyG: 0.0, // 0.0 = serene, stable Keplerian rosette orbits without multi-body chaos
  boundaryRadius: 0.58,
  timeScale: 1.0,
  damping: 0.0,
  assocDistance: 0.16,
  slingshotPower: 1.5,
  tidalBifurcation: true
});

ribbons.forEach((ribbon, index) => {
  ribbon._kinematicAgent = ribbon.agent;
  ribbon._gravityAgent = new GravityBrushAgent(gravitySim, index, {
    phaseOffset: ribbon.phaseOffset,
    maxBoundaryRadius: 0.58
  });
  // Stagger z-depth so layers overlap naturally
  ribbon.group.position.z = -index * 0.02;
  strokeScene.add(ribbon.group);

  // Default octilinear configuration (fully synchronized in syncMotionMode)
  ribbon.filletRadius = 0.08;
  ribbon.stepLength = 0.22;
  ribbon.turnAngleBalance = 0.45;
  ribbon.branchMode = 'parallel';
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

  // Motion Mode & Trajectory Kinematics
  motionMode: 'classic',        // 'classic' (Органический) | 'octilinear' (45°/90° со скруглениями)
  gravityBrushCount: 5,         // 4, 5, 6 кистей
  gravityG: 1.25,               // Гравитационная постоянная G [0.2 .. 3.5]
  gravityCentralMass: 3.2,      // Масса центрального аттрактора M [0.5 .. 8.0]
  gravityNBody: 0.0,            // Взаимное N-body притяжение кистей [0.0 .. 1.0] (0 = чистые орбиты)
  gravityAssocDist: 0.16,       // Дистанция ассоциации / захвата R_assoc [0.05 .. 0.35]
  gravitySlingshot: 1.5,        // Импульс сброса (slingshot boost) [0.5 .. 4.5]
  gravitySpeed: 1.0,            // Скорость орбитального времени [0.2 .. 2.5]
  gravityDamping: 0.0,          // Орбитальное затухание [0.0 .. 0.08]
  gravityTidalSplit: true,      // Приливное расщепление (Tidal Bifurcation) в перицентре

  // Brush Motion & Trail Kinematics (Классический режим)
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

  // Octilinear Filleted Motion (Линейно-диагональный режим со скруглёнными углами)
  gridFilletRadius: 0.08,       // Радиус кругового переходного скругления углов R_fillet [0.02..0.20]
  gridStepLength: 0.22,         // Длина шага прямого отрезка до поворота [0.05..0.50]
  gridTurnBalance: 0.45,        // Баланс вероятности поворотов: 45° vs 90° [0..1]
  gridBranchMode: 'parallel',   // Режим ветвления Head B: 'parallel' (параллельные шины) | 'fork' (развилка со скруглением)

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
  roughness: 3.5,               // Рваный край [0..10] (3.5 = 0.35)
  fiberIntensity: 3.5,          // Волокна бумаги [0..10] (3.5 = 0.28)
  edgeBorder: 6.5,              // Кайма кромки / четкость перекрытий [0..10] (6.5 = 0.65)
  ribbonVolume: 5.5,            // 3D объём и блик ленты [0..10] (5.5 = 0.55)
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
  layer4Color: '#f39c12',
  layer4Split: '#e74c3c',
  layer5Color: '#0984e3',
  layer5Split: '#00cec9',
  layer6Color: '#e056fd',
  layer6Split: '#f0932b',

  // Background & Atmosphere
  bgMode: 'nebula',
  bgPreset: '🌑 Монохромный Графит',
  bgInner: '#0c1527',
  bgOuter: '#030406',
  bgAccent: '#160a22',
  nebulaIntensity: 5.5,
  nebulaSpeed: 2.5,
  nebulaScale: 1.4,
  vignette: 0.75,
  dropShadow: 5.0,              // Тень мандалы на фон [0..10] (5.0 = 0.50)
  filmGrain: 0.0,

  // Performance & Graphics
  fboResolution: defaultFbo,
  screenDpi: 1.5,
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

// Sync initial paper material 3D volume and edge rim
ribbons.forEach(r => {
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
const initialSpeedRatios = [0.82, 1.26, 1.02, 1.12, 0.94, 1.08];
const initialWidthRatios = [0.72, 1.38, 0.96, 1.15, 0.88, 1.22];

function applySpeedVariance(variance) {
  const norm = variance > 1.0 ? (variance / 10.0) : variance;
  ribbons.forEach((r, idx) => {
    const baseDev = (initialSpeedRatios[idx] || 1.0) - 1.0;
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
    const baseDev = (initialWidthRatios[idx] || 1.0) - 1.0;
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
let themeCtrl, descCtrl;
let l1ColCtrl, l1SplitCtrl, l2ColCtrl, l2SplitCtrl, l3ColCtrl, l3SplitCtrl;
let l4ColCtrl, l4SplitCtrl, l5ColCtrl, l5SplitCtrl, l6ColCtrl, l6SplitCtrl;
const themeDesc = { text: COLOR_THEMES[params.colorTheme]?.archetype || 'Абсолютный неоновый контраст на черном' };

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

  const activeCount = (params.motionMode === 'gravity') ? params.gravityBrushCount : 3;
  const themeLayers = getThemeLayerColors(themeKey, Math.max(activeCount, 6));

  themeLayers.forEach((l, idx) => {
    if (ribbons[idx]) {
      ribbons[idx].setColors(l.color, l.splitColor);
    }
  });

  if (brushDebug && typeof brushDebug.updateColors === 'function') {
    brushDebug.updateColors(ribbons);
  }

  if (themeLayers[0]) { params.layer1Color = themeLayers[0].color; params.layer1Split = themeLayers[0].splitColor; }
  if (themeLayers[1]) { params.layer2Color = themeLayers[1].color; params.layer2Split = themeLayers[1].splitColor; }
  if (themeLayers[2]) { params.layer3Color = themeLayers[2].color; params.layer3Split = themeLayers[2].splitColor; }
  if (themeLayers[3]) { params.layer4Color = themeLayers[3].color; params.layer4Split = themeLayers[3].splitColor; }
  if (themeLayers[4]) { params.layer5Color = themeLayers[4].color; params.layer5Split = themeLayers[4].splitColor; }
  if (themeLayers[5]) { params.layer6Color = themeLayers[5].color; params.layer6Split = themeLayers[5].splitColor; }

  if (t.toneMappingMode) {
    params.toneMappingMode = t.toneMappingMode;
    renderer.toneMapping = (t.toneMappingMode === 'agx') ? THREE.AgXToneMapping : THREE.NoToneMapping;
    if (typeof toneMappingCtrl !== 'undefined' && toneMappingCtrl) toneMappingCtrl.updateDisplay();
  }
  if (themeDesc) themeDesc.text = t.archetype;
  if (descCtrl) descCtrl.updateDisplay();
  if (themeCtrl) themeCtrl.updateDisplay();
  if (bgOuterCtrl) bgOuterCtrl.updateDisplay();
  if (bgInnerCtrl) bgInnerCtrl.updateDisplay();
  if (bgAccentCtrl) bgAccentCtrl.updateDisplay();
  if (vigCtrl) vigCtrl.updateDisplay();
  if (bgModeCtrl) bgModeCtrl.updateDisplay();
  if (intensityCtrl) intensityCtrl.updateDisplay();
  if (speedCtrl) speedCtrl.updateDisplay();
  if (scaleCtrl) scaleCtrl.updateDisplay();
  if (l1ColCtrl) l1ColCtrl.updateDisplay();
  if (l1SplitCtrl) l1SplitCtrl.updateDisplay();
  if (l2ColCtrl) l2ColCtrl.updateDisplay();
  if (l2SplitCtrl) l2SplitCtrl.updateDisplay();
  if (l3ColCtrl) l3ColCtrl.updateDisplay();
  if (l3SplitCtrl) l3SplitCtrl.updateDisplay();
  if (l4ColCtrl) l4ColCtrl.updateDisplay();
  if (l4SplitCtrl) l4SplitCtrl.updateDisplay();
  if (l5ColCtrl) l5ColCtrl.updateDisplay();
  if (l5SplitCtrl) l5SplitCtrl.updateDisplay();
  if (l6ColCtrl) l6ColCtrl.updateDisplay();
  if (l6SplitCtrl) l6SplitCtrl.updateDisplay();
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

// ── Fullscreen & Zen Mode (Zero screen clutter) ─────────────────
let isZenMode = false;
let zenIdleTimeout = null;

const fullscreenBtn = document.getElementById('fullscreen-btn');
const zenExitBtn = document.getElementById('zen-exit-btn');

function resetZenIdleTimer() {
  if (!isZenMode) return;
  document.body.classList.remove('zen-idle');
  if (zenIdleTimeout) clearTimeout(zenIdleTimeout);
  zenIdleTimeout = setTimeout(() => {
    if (isZenMode) {
      document.body.classList.add('zen-idle');
    }
  }, 2500);
}

function enterFullscreenZenMode() {
  isZenMode = true;
  document.body.classList.add('zen-mode');
  document.body.classList.remove('zen-idle');

  // Close mobile drawer if it was open
  if (typeof closeMobileDrawer === 'function') {
    closeMobileDrawer();
  }

  // Request native browser fullscreen if supported
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  }

  resetZenIdleTimer();
}

function exitFullscreenZenMode() {
  isZenMode = false;
  document.body.classList.remove('zen-mode', 'zen-idle');
  if (zenIdleTimeout) clearTimeout(zenIdleTimeout);

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function toggleFullscreenZenMode(forceState) {
  const target = (typeof forceState === 'boolean') ? forceState : !isZenMode;
  if (target) {
    enterFullscreenZenMode();
  } else {
    exitFullscreenZenMode();
  }
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => toggleFullscreenZenMode());
}
if (zenExitBtn) {
  zenExitBtn.addEventListener('click', () => exitFullscreenZenMode());
}

['mousemove', 'mousedown', 'touchstart', 'touchmove'].forEach(evt => {
  window.addEventListener(evt, resetZenIdleTimer, { passive: true });
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && isZenMode) {
    exitFullscreenZenMode();
  }
});
document.addEventListener('webkitfullscreenchange', () => {
  if (!document.webkitFullscreenElement && isZenMode) {
    exitFullscreenZenMode();
  }
});

// Double click canvas to toggle fullscreen zen mode
const canvasWrapper = document.getElementById('canvas-container');
if (canvasWrapper) {
  canvasWrapper.addEventListener('dblclick', () => {
    toggleFullscreenZenMode();
  });
}

// Close on Escape key & Toggle Fullscreen on 'F'
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isZenMode) {
      exitFullscreenZenMode();
      return;
    }
    if (document.body.classList.contains('gui-drawer-open')) {
      closeMobileDrawer();
      return;
    }
  }
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    toggleFullscreenZenMode();
  }
  if ((e.key === 'g' || e.key === 'G' || e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const modeOrder = ['classic', 'octilinear'];
    const nextIdx = (modeOrder.indexOf(params.motionMode) + 1) % modeOrder.length;
    const nextMode = modeOrder[nextIdx];
    syncMotionMode(nextMode);
    const modeLabels = {
      classic: '🌊 Режим: Классический (Органический)',
      octilinear: '📐 Режим: Линейно-диагональный (Octilinear Grid)'
    };
    showToast(modeLabels[nextMode]);
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
const STORAGE_KEY = 'spectromorphology_user_settings_v1_6_original';

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
const defaultLayerParams = { layer1: true, layer2: true, layer3: true, layer4: true, layer5: true, layer6: true };
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

    if (Array.isArray(data.initialSpeedRatios)) {
      for (let i = 0; i < Math.min(6, data.initialSpeedRatios.length); i++) initialSpeedRatios[i] = data.initialSpeedRatios[i];
    }
    if (Array.isArray(data.initialWidthRatios)) {
      for (let i = 0; i < Math.min(6, data.initialWidthRatios.length); i++) initialWidthRatios[i] = data.initialWidthRatios[i];
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
        if (prop === 'motionMode' && data.params[prop] === 'gravity') {
          ctrl.setValue('classic');
        } else if (prop === 'fboResolution' && data.params[prop] < 2048) {
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

// ── Top Action: Fullscreen & Save Buttons ────────────────
gui.add({
  toggleFullscreen: () => toggleFullscreenZenMode()
}, 'toggleFullscreen').name('🖥️ Фулскрин (Без интерфейса)');

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
fPerf.add(params, 'keepAwake').name('💡 Не гасить экран (VJ / Пати)').onChange(v => {
  if (v) acquireWakeLock(); else releaseWakeLock();
});
fPerf.add(params, 'batteryEcoMode').name('🔋 Эко-режим (только от батареи)');
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


const fTheme = gui.addFolder('🎨 Художественные темы и Цвета');
descCtrl = fTheme.add(themeDesc, 'text').name('ℹ️ Стиль').listen().disable();

themeCtrl = fTheme.add(params, 'colorTheme', Object.keys(COLOR_THEMES))
  .name('✨ Выбор палитры')
  .onChange(applyColorTheme);

const toneMappingCtrl = fTheme.add(params, 'toneMappingMode', {
  'AgX Cinema (Мягкое свечение)': 'agx',
  'Без тонемаппинга (Прямой)': 'none'
}).name('Тонемаппинг').onChange(v => {
  renderer.toneMapping = (v === 'agx') ? THREE.AgXToneMapping : THREE.NoToneMapping;
});

const fCustomColors = fTheme.addFolder('🎛 Тонкая настройка цветов кистей');
l1ColCtrl = fCustomColors.addColor(params, 'layer1Color').name('Кисть 1 (Ядро): Основной').onChange(v => ribbons[0].setColors(v, params.layer1Split));
l1SplitCtrl = fCustomColors.addColor(params, 'layer1Split').name('Кисть 1 (Ядро): Сплит').onChange(v => ribbons[0].setColors(params.layer1Color, v));
l2ColCtrl = fCustomColors.addColor(params, 'layer2Color').name('Кисть 2 (Середина): Основной').onChange(v => ribbons[1].setColors(v, params.layer2Split));
l2SplitCtrl = fCustomColors.addColor(params, 'layer2Split').name('Кисть 2 (Середина): Сплит').onChange(v => ribbons[1].setColors(params.layer2Color, v));
l3ColCtrl = fCustomColors.addColor(params, 'layer3Color').name('Кисть 3 (Орбита): Основной').onChange(v => ribbons[2].setColors(v, params.layer3Split));
l3SplitCtrl = fCustomColors.addColor(params, 'layer3Split').name('Кисть 3 (Орбита): Сплит').onChange(v => ribbons[2].setColors(params.layer3Color, v));
l4ColCtrl = fCustomColors.addColor(params, 'layer4Color').name('Кисть 4: Основной').onChange(v => ribbons[3] && ribbons[3].setColors(v, params.layer4Split));
l4SplitCtrl = fCustomColors.addColor(params, 'layer4Split').name('Кисть 4: Сплит').onChange(v => ribbons[3] && ribbons[3].setColors(params.layer4Color, v));
l5ColCtrl = fCustomColors.addColor(params, 'layer5Color').name('Кисть 5: Основной').onChange(v => ribbons[4] && ribbons[4].setColors(v, params.layer5Split));
l5SplitCtrl = fCustomColors.addColor(params, 'layer5Split').name('Кисть 5: Сплит').onChange(v => ribbons[4] && ribbons[4].setColors(params.layer5Color, v));
l6ColCtrl = fCustomColors.addColor(params, 'layer6Color').name('Кисть 6: Основной').onChange(v => ribbons[5] && ribbons[5].setColors(v, params.layer6Split));
l6SplitCtrl = fCustomColors.addColor(params, 'layer6Split').name('Кисть 6: Сплит').onChange(v => ribbons[5] && ribbons[5].setColors(params.layer6Color, v));
fCustomColors.close();

const fLayers = gui.addFolder('Слои кистей (вкл/выкл)');
const layerParams = {
  layer1: true,
  layer2: true,
  layer3: true,
  layer4: true,
  layer5: true,
  layer6: true,
};
const layerConfigs = [
  { key: 'layer1', name: 'Кисть 1: Рубин / Янтарь' },
  { key: 'layer2', name: 'Кисть 2: Бирюза / Изумруд' },
  { key: 'layer3', name: 'Кисть 3: Фиолет / Коралл' },
  { key: 'layer4', name: 'Кисть 4: Золото / Мандарин' },
  { key: 'layer5', name: 'Кисть 5: Лазурь / Аквамарин' },
  { key: 'layer6', name: 'Кисть 6: Маджента / Фуксия' },
];
layerConfigs.forEach((cfg, idx) => {
  fLayers.add(layerParams, cfg.key).name(cfg.name).onChange(v => {
    const isGravity = (params.motionMode === 'gravity');
    const activeLimit = isGravity ? params.gravityBrushCount : 3;
    const shouldBeVisible = v && (idx < activeLimit);
    ribbons[idx].group.visible = shouldBeVisible;
    brushDebug.setRibbonVisible(idx, shouldBeVisible);
  });
});

// ── Глобальные опции режимов движения ──
const MOTION_MODE_OPTIONS = {
  '🌊 Классический (Органический)': 'classic',
  '📐 Линейно-диагональный (Octilinear)': 'octilinear'
};

// ── 🪐 Гравитационный режим (N-body орбиты, скрыт из UI) ──
const fGravity = gui.addFolder('🪐 Гравитационный режим (N-body)');
fGravity.hide();

const gravityModeCtrl = fGravity.add(params, 'motionMode', MOTION_MODE_OPTIONS)
  .name('Режим движения')
  .listen()
  .onChange(v => {
    syncMotionMode(v);
  });

fGravity.add(params, 'gravityBrushCount', [4, 5, 6])
  .name('Количество кистей')
  .onChange(v => {
    params.gravityBrushCount = parseInt(v, 10);
    gravitySim.setBodyCount(params.gravityBrushCount);
    syncMotionMode();
  });

fGravity.add(params, 'gravityG', 0.2, 3.5, 0.05)
  .name('Гравитация G (скорость орбит)')
  .onChange(v => {
    gravitySim.setG(v);
  });

fGravity.add(params, 'gravityCentralMass', 0.5, 8.0, 0.1)
  .name('Масса ядра M')
  .onChange(v => {
    gravitySim.setCentralMass(v);
  });

fGravity.add(params, 'gravityNBody', 0.0, 1.0, 0.02)
  .name('Взаимное N-body (0=чисто, >0=хаос)')
  .onChange(v => {
    gravitySim.nBodyG = v;
  });

fGravity.add(params, 'gravityAssocDist', 0.05, 0.35, 0.01)
  .name('Захват R_assoc')
  .onChange(v => {
    gravitySim.assocDistance = v;
  });

fGravity.add(params, 'gravitySlingshot', 0.5, 4.5, 0.1)
  .name('Импульс сброса')
  .onChange(v => {
    gravitySim.slingshotPower = v;
  });

fGravity.add(params, 'gravityTidalSplit')
  .name('Приливной сплит (Roche)')
  .onChange(v => {
    gravitySim.tidalBifurcationEnabled = v;
    if (params.motionMode === 'gravity') {
      ribbons.forEach(r => r.bifurcationEnabled = v);
    }
  });

fGravity.add(params, 'gravitySpeed', 0.2, 2.5, 0.05)
  .name('Скорость времени')
  .onChange(v => {
    gravitySim.timeScale = v;
  });

fGravity.add(params, 'gravityDamping', 0.0, 0.08, 0.005)
  .name('Орбитальный баланс')
  .onChange(v => {
    gravitySim.damping = v;
  });

fGravity.add({
  resetOrbits: () => {
    gravitySim.resetAllOrbits();
    ribbons.forEach(r => r.reset());
  }
}, 'resetOrbits').name('✨ Перезапуск орбит');

function syncMotionMode(mode = params.motionMode) {
  if (mode === 'gravity') mode = 'classic';
  params.motionMode = mode;
  const isGravity = false;
  const isOctilinear = (mode === 'octilinear');
  const activeCount = 3;

  ribbons.forEach((ribbon, idx) => {
    const isSlotActive = (idx < activeCount);
    const shouldBeVisible = isSlotActive && (layerParams[`layer${idx + 1}`] !== false);
    ribbon.group.visible = shouldBeVisible;
    if (brushDebug) brushDebug.setRibbonVisible(idx, shouldBeVisible);

    if (isGravity) {
      ribbon.setAgent(ribbon._gravityAgent);
      ribbon.randomSpeedEnabled = false;
      ribbon.speedDriftEnabled = false;
      ribbon.bifurcationEnabled = params.gravityTidalSplit;
      ribbon.waveAmp = 0.0;
    } else if (isOctilinear) {
      ribbon.setMotionMode('octilinear');
      ribbon.randomSpeedEnabled = false;
      ribbon.speedDriftEnabled = false;
      ribbon.waveAmp = 0.0;
      ribbon.filletRadius = params.gridFilletRadius;
      ribbon.stepLength = params.gridStepLength;
      ribbon.turnAngleBalance = params.gridTurnBalance;
      ribbon.branchMode = params.gridBranchMode;
    } else {
      // Classic Organic
      ribbon.setMotionMode('classic');
      ribbon.randomSpeedEnabled = params.randomSpeedMode;
      ribbon.speedDriftEnabled = params.dynamicSpeedDrift;
      ribbon.bifurcationEnabled = params.bifurcationEnabled;
      ribbon.waveAmp = params.waveAmplitude * 0.008;
    }
    ribbon.reset();
  });

  if (isOctilinear) {
    if (typeof fOctilinear !== 'undefined') fOctilinear.open();
    if (typeof fFish !== 'undefined') fFish.close();
  } else {
    if (typeof fFish !== 'undefined') fFish.open();
    if (typeof fOctilinear !== 'undefined') fOctilinear.close();
  }

  if (typeof fishModeCtrl !== 'undefined') fishModeCtrl.setValue(mode);
  if (typeof octilinearModeCtrl !== 'undefined') octilinearModeCtrl.setValue(mode);

  applyColorTheme(params.colorTheme);
  updateAllInstances();
}

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

const fishModeCtrl = fFish.add(params, 'motionMode', MOTION_MODE_OPTIONS)
  .name('Режим траектории')
  .listen()
  .onChange(v => {
    syncMotionMode(v);
  });

fFish.add(params, 'motionSpeed', 0.2, 3.0, 0.1).name('Скорость движения').onChange(v => {
  ribbons.forEach(r => r.speed = v);
});
fFish.add(params, 'orbitSpeed', 0.05, 1.5, 0.05).name('Скорость кисти (орбита)').onChange(v => {
  ribbons.forEach(r => r.orbitSpeed = v);
});
fFish.add(params, 'boundaryRadius', 0.25, 0.70, 0.01).name('Радиус обитания').onChange(v => {
  ribbons.forEach(r => r.maxBoundaryRadius = v);
  gravitySim.boundaryRadius = v;
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

// ── Папка: Линейно-диагональный режим со скруглёнными углами (Octilinear Filleted Mode) ──
const fOctilinear = gui.addFolder('📐 Линейно-диагональный режим (Octilinear)');

const octilinearModeCtrl = fOctilinear.add(params, 'motionMode', MOTION_MODE_OPTIONS)
  .name('Активный режим')
  .listen()
  .onChange(v => {
    syncMotionMode(v);
  });

const filletRadiusCtrl = fOctilinear.add(params, 'gridFilletRadius', 0.02, 0.20, 0.005)
  .name('Радиус скругления (R_fillet)')
  .listen()
  .onChange(v => {
    ribbons.forEach(r => r.filletRadius = v);
  });

const stepLengthCtrl = fOctilinear.add(params, 'gridStepLength', 0.05, 0.50, 0.01)
  .name('Длина шага сетки')
  .listen()
  .onChange(v => {
    ribbons.forEach(r => r.stepLength = v);
  });

const turnBalanceCtrl = fOctilinear.add(params, 'gridTurnBalance', 0.0, 1.0, 0.05)
  .name('Баланс (45° ⟷ 90°)')
  .listen()
  .onChange(v => {
    ribbons.forEach(r => r.turnAngleBalance = v);
  });

const branchModeCtrl = fOctilinear.add(params, 'gridBranchMode', {
  '🛤️ Параллельные шины': 'parallel',
  '🔱 Развилка со скруглением': 'fork'
}).name('Ветвление Head B').listen().onChange(v => {
  ribbons.forEach(r => r.branchMode = v);
});

// ── Пресеты эстетики Octilinear ──
fOctilinear.add({
  presetPCB: () => {
    params.motionMode = 'octilinear';
    params.gridFilletRadius = 0.05;
    params.gridStepLength = 0.18;
    params.gridTurnBalance = 0.50;
    params.gridBranchMode = 'fork';
    syncMotionMode('octilinear');
    filletRadiusCtrl.setValue(0.05);
    stepLengthCtrl.setValue(0.18);
    turnBalanceCtrl.setValue(0.50);
    branchModeCtrl.setValue('fork');
    ribbons.forEach(r => {
      r.filletRadius = 0.05;
      r.stepLength = 0.18;
      r.turnAngleBalance = 0.50;
      r.branchMode = 'fork';
      r.setMotionMode('octilinear');
    });
    fOctilinear.open();
    showToast('⚡ Пресет: Печатная плата (PCB)');
  }
}, 'presetPCB').name('⚡ Пресет: Печатная плата (PCB)');

fOctilinear.add({
  presetSubway: () => {
    params.motionMode = 'octilinear';
    params.gridFilletRadius = 0.12;
    params.gridStepLength = 0.30;
    params.gridTurnBalance = 0.35;
    params.gridBranchMode = 'parallel';
    syncMotionMode('octilinear');
    filletRadiusCtrl.setValue(0.12);
    stepLengthCtrl.setValue(0.30);
    turnBalanceCtrl.setValue(0.35);
    branchModeCtrl.setValue('parallel');
    ribbons.forEach(r => {
      r.filletRadius = 0.12;
      r.stepLength = 0.30;
      r.turnAngleBalance = 0.35;
      r.branchMode = 'parallel';
      r.setMotionMode('octilinear');
    });
    fOctilinear.open();
    showToast('🚇 Пресет: Схема метро (Subway Lines)');
  }
}, 'presetSubway').name('🚇 Пресет: Схема метро (Subway)');

fOctilinear.add({
  presetManhattan: () => {
    params.motionMode = 'octilinear';
    params.gridFilletRadius = 0.06;
    params.gridStepLength = 0.24;
    params.gridTurnBalance = 1.0;
    params.gridBranchMode = 'fork';
    syncMotionMode('octilinear');
    filletRadiusCtrl.setValue(0.06);
    stepLengthCtrl.setValue(0.24);
    turnBalanceCtrl.setValue(1.0);
    branchModeCtrl.setValue('fork');
    ribbons.forEach(r => {
      r.filletRadius = 0.06;
      r.stepLength = 0.24;
      r.turnAngleBalance = 1.0;
      r.branchMode = 'fork';
      r.setMotionMode('octilinear');
    });
    fOctilinear.open();
    showToast('🏙️ Пресет: Ортогональный Манхэттен (90°)');
  }
}, 'presetManhattan').name('🏙️ Пресет: Манхэттен (90°)');

fOctilinear.add({
  presetIsometric: () => {
    params.motionMode = 'octilinear';
    params.gridFilletRadius = 0.07;
    params.gridStepLength = 0.20;
    params.gridTurnBalance = 0.0;
    params.gridBranchMode = 'fork';
    syncMotionMode('octilinear');
    filletRadiusCtrl.setValue(0.07);
    stepLengthCtrl.setValue(0.20);
    turnBalanceCtrl.setValue(0.0);
    branchModeCtrl.setValue('fork');
    ribbons.forEach(r => {
      r.filletRadius = 0.07;
      r.stepLength = 0.20;
      r.turnAngleBalance = 0.0;
      r.branchMode = 'fork';
      r.setMotionMode('octilinear');
    });
    fOctilinear.open();
    showToast('✨ Пресет: Изометрия (45° Diagonal)');
  }
}, 'presetIsometric').name('✨ Пресет: Изометрия (45°)');

fOctilinear.close();

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
fPaper.add(params, 'edgeBorder', 0.0, 10.0, 0.1).name('✒️ Тёмная кайма кромки (0..10)').onChange(v => {
  const norm = v * 0.10;
  ribbons.forEach(r => {
    r.material.uniforms.uEdgeBorder.value = norm;
    r.splitMaterial.uniforms.uEdgeBorder.value = norm;
  });
});
fPaper.add(params, 'ribbonVolume', 0.0, 10.0, 0.1).name('🔮 3D объём и блик (0..10)').onChange(v => {
  const norm = v * 0.10;
  ribbons.forEach(r => {
    r.material.uniforms.uRibbonVolume.value = norm;
    r.splitMaterial.uniforms.uRibbonVolume.value = norm;
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

const fBg = gui.addFolder('🌌 Атмосфера и градиенты фона');

let bgModeCtrl, intensityCtrl, speedCtrl, scaleCtrl, bgInnerCtrl, bgAccentCtrl, bgOuterCtrl, vigCtrl;

fBg.add(params, 'bgPreset', Object.keys(bgPresets))
  .name('✨ Пресет атмосферы')
  .onChange(presetName => {
    const p = bgPresets[presetName];
    if (!p) return;
    params.bgMode = p.bgMode;
    params.bgOuter = p.bgOuter;
    params.bgInner = p.bgInner;
    params.bgAccent = p.bgAccent;
    params.nebulaIntensity = p.nebulaIntensity;
    params.nebulaSpeed = p.nebulaSpeed;
    params.nebulaScale = p.nebulaScale;
    params.vignette = p.vignette;

    applyBgMode(p.bgMode);
    kaleidoscopeMaterial.uniforms.uBgOuter.value.set(p.bgOuter);
    kaleidoscopeMaterial.uniforms.uBgInner.value.set(p.bgInner);
    kaleidoscopeMaterial.uniforms.uBgAccent.value.set(p.bgAccent);
    kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = p.nebulaIntensity * 0.10;
    kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = p.nebulaSpeed * 0.10;
    kaleidoscopeMaterial.uniforms.uNebulaScale.value = p.nebulaScale;
    kaleidoscopeMaterial.uniforms.uVignette.value = p.vignette;

    if (bgModeCtrl) bgModeCtrl.updateDisplay();
    if (bgOuterCtrl) bgOuterCtrl.updateDisplay();
    if (bgInnerCtrl) bgInnerCtrl.updateDisplay();
    if (bgAccentCtrl) bgAccentCtrl.updateDisplay();
    if (intensityCtrl) intensityCtrl.updateDisplay();
    if (speedCtrl) speedCtrl.updateDisplay();
    if (scaleCtrl) scaleCtrl.updateDisplay();
    if (vigCtrl) vigCtrl.updateDisplay();
  });

bgModeCtrl = fBg.add(params, 'bgMode', {
  '🌌 Дыхание Бездны (Небула)': 'nebula',
  '🌊 Циклические волны (Пульс)': 'waves',
  '🌠 Северное сияние (Аврора)': 'aurora',
  '🔘 Мягкий радиальный': 'radial',
  '⬛ Сплошной тёмный': 'solid'
}).name('Режим свечения').onChange(v => {
  applyBgMode(v);
});

intensityCtrl = fBg.add(params, 'nebulaIntensity', 0.0, 10.0, 0.1)
  .name('Яркость свечения (0..10)')
  .onChange(v => {
    kaleidoscopeMaterial.uniforms.uNebulaIntensity.value = v * 0.10;
  });

speedCtrl = fBg.add(params, 'nebulaSpeed', 0.1, 10.0, 0.1)
  .name('Скорость дыхания (0..10)')
  .onChange(v => {
    kaleidoscopeMaterial.uniforms.uNebulaSpeed.value = v * 0.10;
  });

scaleCtrl = fBg.add(params, 'nebulaScale', 0.5, 3.0, 0.1)
  .name('Размытость / Масштаб')
  .onChange(v => {
    kaleidoscopeMaterial.uniforms.uNebulaScale.value = v;
  });

bgInnerCtrl = fBg.addColor(params, 'bgInner').name('Основной свет (центр)').onChange(hex => {
  kaleidoscopeMaterial.uniforms.uBgInner.value.set(hex);
});

bgAccentCtrl = fBg.addColor(params, 'bgAccent').name('Акцентный свет (небула)').onChange(hex => {
  kaleidoscopeMaterial.uniforms.uBgAccent.value.set(hex);
});

bgOuterCtrl = fBg.addColor(params, 'bgOuter').name('Глубокая тьма (края)').onChange(hex => {
  kaleidoscopeMaterial.uniforms.uBgOuter.value.set(hex);
});

vigCtrl = fBg.add(params, 'vignette', 0.0, 1.0, 0.05).name('Виньетка').onChange(v => {
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
syncMotionMode();

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
  if (params.motionMode === 'gravity') {
    gravitySim.update(elapsedTime, delta);
  }
  ribbons.forEach(ribbon => {
    if (ribbon.group.visible) {
      ribbon.update(elapsedTime, delta);
    }
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

    if (perfFpsEl) {
      const ecoTag = params.batteryEcoMode && isRunningOnBattery ? ' [Eco 30]' : '';
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

  // Periodic report to server every 1.5s
  if (nowMs - lastPostTime >= 1500) {
    lastPostTime = nowMs;
    sendPerfTelemetry({
      ...liveMetrics,
      timestamp: Date.now(),
      fboSize: currentFboSize,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio,
      sectors: params.sectors,
      mirror: params.mirror,
      bifurcatedCount: ribbons.filter(r => r.group.visible && r.splitState !== 'CLOSED').length,
      isTabVisible: !document.hidden
    });
  }
}

// Initial start of animation loop
rafId = requestAnimationFrame(animate);
