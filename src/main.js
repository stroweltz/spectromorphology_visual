import * as THREE from 'three';
import GUI from 'lil-gui';
import { FishRibbon } from './ribbon/FishRibbon.js';
import { createKaleidoscopeMaterial } from './shaders/kaleidoscopeMaterial.js';

// --- Global Setup ---
const container = document.getElementById('canvas-container');
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// 2. Offscreen Stroke Scene & FBO
// Higher resolution for sharp paper fiber edges and deckled cuts
const FBO_SIZE = 2048;
const strokeRenderTarget = new THREE.WebGLRenderTarget(FBO_SIZE, FBO_SIZE, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType
});

const strokeScene = new THREE.Scene();
// Orthographic camera covering -0.7 to +0.7 space
const strokeCamera = new THREE.OrthographicCamera(-0.7, 0.7, 0.7, -0.7, 0.1, 10);
strokeCamera.position.z = 1;

// 3. Multi-layered Saturated Paper Ribbons
const ribbons = [
  // Layer 1: Crimson / Ruby with Amber split
  new FishRibbon({
    color: 0xef2353,
    splitColor: 0xffaa00,
    segments: 70,
    baseWidth: 0.13,
    speed: 1.1,
    waveFreq: 4.2,
    waveAmp: 0.065,
    pathRadius: 0.35,
    phaseOffset: 0.0,
    orbitSpeed: 0.35,
    splitIntensity: 0.85
  }),
  // Layer 2: Deep Cyan / Electric Teal with Emerald split
  new FishRibbon({
    color: 0x00d2d3,
    splitColor: 0x10ac84,
    segments: 70,
    baseWidth: 0.11,
    speed: 1.25,
    waveFreq: 4.8,
    waveAmp: 0.06,
    pathRadius: 0.28,
    phaseOffset: Math.PI * 0.66,
    orbitSpeed: 0.42,
    splitIntensity: 0.9
  }),
  // Layer 3: Royal Violet / Magenta with Coral split
  new FishRibbon({
    color: 0x9b59b6,
    splitColor: 0xff6b6b,
    segments: 70,
    baseWidth: 0.12,
    speed: 0.95,
    waveFreq: 3.8,
    waveAmp: 0.07,
    pathRadius: 0.38,
    phaseOffset: Math.PI * 1.33,
    orbitSpeed: 0.3,
    splitIntensity: 0.8
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

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), kaleidoscopeMaterial);
mainScene.add(quad);

// 5. Interactive GUI Controls
const params = {
  // Kaleidoscope
  sectors: 12,
  mirror: true,
  autoRotate: true,
  rotationSpeed: 0.15,
  manualRotation: 0.0,
  zoom: 1.0,

  // Fish Motion & Kinematics
  motionSpeed: 1.1,
  waveAmplitude: 0.065,
  waveFrequency: 4.2,
  splitting: 0.85,

  // Paper Texture
  roughness: 0.35,
  fiberIntensity: 0.28,
  ribbonWidth: 0.12,

  // Background
  bgGradient: true,
  bgInner: '#0e121d',
  bgOuter: '#040507',
  vignette: 0.75
};

const gui = new GUI({ title: 'Параметры Визуализатора' });

const fKaleido = gui.addFolder('Калейдоскопическая призма');
fKaleido.add(params, 'sectors', 2, 32, 1).name('Секторы симметрии').onChange(v => {
  kaleidoscopeMaterial.uniforms.uSectors.value = v;
});
fKaleido.add(params, 'mirror').name('Зеркальные грани').onChange(v => {
  kaleidoscopeMaterial.uniforms.uMirror.value = v ? 1.0 : 0.0;
});
fKaleido.add(params, 'autoRotate').name('Авто-вращение');
fKaleido.add(params, 'rotationSpeed', -1.0, 1.0, 0.01).name('Скорость вращения');
fKaleido.add(params, 'zoom', 0.4, 2.5, 0.05).name('Масштаб (Zoom)').onChange(v => {
  kaleidoscopeMaterial.uniforms.uZoom.value = v;
});

const fFish = gui.addFolder('Рыбья кинематика');
fFish.add(params, 'motionSpeed', 0.2, 3.0, 0.1).name('Скорость плавания').onChange(v => {
  ribbons.forEach(r => r.speed = v);
});
fFish.add(params, 'waveAmplitude', 0.01, 0.15, 0.005).name('Размах волны (Амплитуда)').onChange(v => {
  ribbons.forEach(r => r.waveAmp = v);
});
fFish.add(params, 'waveFrequency', 1.0, 8.0, 0.2).name('Частота изгиба').onChange(v => {
  ribbons.forEach(r => r.waveFreq = v);
});
fFish.add(params, 'splitting', 0.0, 1.5, 0.05).name('Расщепление ветвей').onChange(v => {
  ribbons.forEach(r => r.splitIntensity = v);
});

const fPaper = gui.addFolder('Фактура бумаги');
fPaper.add(params, 'roughness', 0.0, 1.0, 0.02).name('Рваный край (fBm)').onChange(v => {
  ribbons.forEach(r => {
    r.material.uniforms.uRoughness.value = v;
    r.splitMaterial.uniforms.uRoughness.value = v;
  });
});
fPaper.add(params, 'fiberIntensity', 0.0, 0.8, 0.02).name('Волокна целлюлозы').onChange(v => {
  ribbons.forEach(r => {
    r.material.uniforms.uFiberIntensity.value = v;
    r.splitMaterial.uniforms.uFiberIntensity.value = v;
  });
});
fPaper.add(params, 'ribbonWidth', 0.04, 0.25, 0.01).name('Толщина мазка').onChange(v => {
  ribbons.forEach(r => r.baseWidth = v);
});

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

// Resize Handler
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  kaleidoscopeMaterial.uniforms.uAspect.value = w / h;
});

// 6. Animation Loop
const clock = new THREE.Clock();
let currentRotation = 0.0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // 1. Update Fish Ribbons (Kinematics, wave, splitting)
  ribbons.forEach(ribbon => {
    ribbon.update(elapsedTime, delta);
  });

  // 2. Render Strokes into Offscreen FBO
  renderer.setRenderTarget(strokeRenderTarget);
  renderer.setClearColor(0x000000, 0.0); // Transparent background for strokes
  renderer.clear();
  renderer.render(strokeScene, strokeCamera);

  // 3. Render Kaleidoscope Pass to Screen
  renderer.setRenderTarget(null);

  if (params.autoRotate) {
    currentRotation += delta * params.rotationSpeed;
  }
  kaleidoscopeMaterial.uniforms.uRotation.value = currentRotation;
  kaleidoscopeMaterial.uniforms.uTime.value = elapsedTime;

  renderer.render(mainScene, mainCamera);
}

animate();
