import * as THREE from 'three';
import { KinematicBrushAgent } from './KinematicBrushAgent.js';
import { BifurcationController } from './BifurcationController.js';
import { TrailHistory } from './TrailHistory.js';
import { RibbonMeshRenderer } from './RibbonMeshRenderer.js';

/**
 * FishRibbon
 * ----------
 * High-level coordinator (facade) for procedural fish ribbon brush strokes.
 * Orchestrates:
 *   1. KinematicBrushAgent   – autonomous steering, curvature physics, wander dynamics
 *   2. BifurcationController – dynamic thickness breathing, center taper, twin-head split lifecycle
 *   3. TrailHistory          – fixed-distance immutable vertebrae spine & historical widths
 *   4. RibbonMeshRenderer    – Three.js instanced geometry, normal extrusion, vertex colors
 */
export class FishRibbon {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this._segments = options.segments || 64;
    this.phaseOffset = options.phaseOffset || 0.0;
    this.pathRadius = options.pathRadius || 0.42;

    // ── OOP Component Composition ──
    this.agent = new KinematicBrushAgent(options);
    this.bifurcation = new BifurcationController(options);
    this.trail = new TrailHistory(this._segments, options, this.bifurcation.currentWidth);
    this.renderer = new RibbonMeshRenderer(this._segments, options);
  }

  // ── Public Accessors for main.js, BrushDebugOverlay, and Audio Engine ──

  get segments() {
    return this._segments;
  }

  get spine() {
    return this.trail.spine;
  }

  get splitSpine() {
    return this.trail.splitSpine;
  }

  get widths() {
    return this.trail.widths;
  }

  get splitWidths() {
    return this.trail.splitWidths;
  }

  get shiftCount() {
    return this.trail.shiftCountA;
  }

  get splitState() {
    return this.bifurcation.state;
  }

  set splitState(val) {
    this.bifurcation.state = val;
  }

  get splitProgress() {
    return this.bifurcation.splitProgress;
  }

  set splitProgress(val) {
    this.bifurcation.splitProgress = val;
  }

  get currentWidth() {
    return this.bifurcation.currentWidth;
  }

  get baseWidth() {
    return this.bifurcation.currentWidth;
  }

  set baseWidth(val) {
    this.bifurcation.currentWidth = val;
  }

  get group() {
    return this.renderer.group;
  }

  get mesh() {
    return this.renderer.mesh;
  }

  get splitMesh() {
    return this.renderer.splitMesh;
  }

  get material() {
    return this.renderer.material;
  }

  get splitMaterial() {
    return this.renderer.splitMaterial;
  }

  get geometry() {
    return this.renderer.geometry;
  }

  get splitGeometry() {
    return this.renderer.splitGeometry;
  }

  get headPos() {
    return this.agent.pos;
  }

  get headingAngle() {
    return this.agent.headingAngle;
  }

  set headingAngle(v) {
    this.agent.headingAngle = v;
  }

  get angularVelocity() {
    return this.agent.angularVelocity;
  }

  set angularVelocity(v) {
    this.agent.angularVelocity = v;
  }

  get headA() {
    return this.bifurcation.headA;
  }

  get headB() {
    return this.bifurcation.headB;
  }

  // ── Delegated Kinematics & Agent Properties ──

  get speed() { return this.agent.speed; }
  set speed(v) { this.agent.speed = v; }

  get orbitSpeed() { return this.agent.orbitSpeed; }
  set orbitSpeed(v) { this.agent.orbitSpeed = v; }

  get maxBoundaryRadius() { return this.agent.maxBoundaryRadius; }
  set maxBoundaryRadius(v) { this.agent.maxBoundaryRadius = v; }

  get minTurnRadius() { return this.agent.minTurnRadius; }
  set minTurnRadius(v) { this.agent.minTurnRadius = v; }

  get randomSpeedEnabled() { return this.agent.randomSpeedEnabled; }
  set randomSpeedEnabled(v) { this.agent.randomSpeedEnabled = v; }

  get speedMultiplier() { return this.agent.speedMultiplier; }
  set speedMultiplier(v) { this.agent.speedMultiplier = v; }

  get speedDriftEnabled() { return this.agent.speedDriftEnabled; }
  set speedDriftEnabled(v) { this.agent.speedDriftEnabled = v; }

  get speedWanderIntensity() { return this.agent.speedWanderIntensity; }
  set speedWanderIntensity(v) { this.agent.speedWanderIntensity = v; }

  get speedWanderFreq() { return this.agent.speedWanderFreq; }
  set speedWanderFreq(v) { this.agent.speedWanderFreq = v; }

  get audioSpeedMult() { return this.agent.audioSpeedMult; }
  set audioSpeedMult(v) { this.agent.audioSpeedMult = v; }

  get audioSteerMult() { return this.agent.audioSteerMult; }
  set audioSteerMult(v) { this.agent.audioSteerMult = v; }

  get audioExtraAngular() { return this.agent.audioExtraAngular; }
  set audioExtraAngular(v) { this.agent.audioExtraAngular = v; }

  // ── Delegated Trail & History Properties ──

  get trailLength() { return this.trail.trailLength; }
  set trailLength(v) { this.trail.trailLength = v; }

  get fixedPathTrail() { return this.trail.fixedPathTrail; }
  set fixedPathTrail(v) { this.trail.fixedPathTrail = v; }

  // ── Delegated Bifurcation & Thickness Properties ──

  get waveAmp() { return this.bifurcation.waveAmp; }
  set waveAmp(v) { this.bifurcation.waveAmp = v; }

  get waveFreq() { return this.bifurcation.waveFreq; }
  set waveFreq(v) { this.bifurcation.waveFreq = v; }

  get bifurcationEnabled() { return this.bifurcation.bifurcationEnabled; }
  set bifurcationEnabled(v) { this.bifurcation.bifurcationEnabled = v; }

  get splitChance() { return this.bifurcation.splitChance; }
  set splitChance(v) { this.bifurcation.splitChance = v; }

  get splitThreshold() { return this.bifurcation.splitThreshold; }
  set splitThreshold(v) { this.bifurcation.splitThreshold = v; }

  get splitSeparation() { return this.bifurcation.splitSeparation; }
  set splitSeparation(v) { this.bifurcation.splitSeparation = v; }

  get splitDuration() { return this.bifurcation.splitDuration; }
  set splitDuration(v) { this.bifurcation.splitDuration = v; }

  get maxWidth() { return this.bifurcation.maxWidth; }
  set maxWidth(v) { this.bifurcation.maxWidth = v; }

  get widthLimit() { return this.bifurcation.widthLimit; }
  set widthLimit(v) { this.setWidthLimit(v); }

  get widthSpeed() { return this.bifurcation.widthSpeed; }
  set widthSpeed(v) { this.bifurcation.widthSpeed = v; }

  get widthSpeedMult() { return this.bifurcation.widthSpeedMult; }
  set widthSpeedMult(v) { this.bifurcation.widthSpeedMult = v; }

  get centerTaperStrength() { return this.bifurcation.centerTaperStrength; }
  set centerTaperStrength(v) { this.bifurcation.centerTaperStrength = v; }

  get centerTaperRadius() { return this.bifurcation.centerTaperRadius; }
  set centerTaperRadius(v) { this.bifurcation.centerTaperRadius = v; }

  get independentWidth() { return this.bifurcation.independentWidth; }
  set independentWidth(v) { this.bifurcation.independentWidth = v; }

  // ── Delegated Mesh & Renderer Properties ──

  get headTaperLength() { return this.renderer.headTaperLength; }
  set headTaperLength(v) { this.renderer.headTaperLength = v; }

  get headTipWidth() { return this.renderer.headTipWidth; }
  set headTipWidth(v) { this.renderer.headTipWidth = v; }

  get baseColor() { return this.renderer.baseColor; }
  get splitColor() { return this.renderer.secondaryColor; }

  /**
   * Updates primary and split ribbon colors.
   * @param {THREE.Color|string|number} color
   * @param {THREE.Color|string|number} [splitColor]
   */
  setColors(color, splitColor) {
    this.renderer.setColors(color, splitColor);
  }

  // ── High-Level Coordinator Methods ──

  /**
   * Rebuilds instance matrices for mandala-style symmetry.
   * @param {number}  sectors – rotational copies
   * @param {boolean} mirror  – add bilateral symmetry copies
   */
  updateInstances(sectors, mirror) {
    this.renderer.updateInstances(sectors, mirror);
  }

  /**
   * Resets kinematics, history, and bifurcation state.
   */
  reset() {
    this.agent.reset();
    this.bifurcation.reset();
    this.trail.reset(this.agent.pos, this.agent.headingAngle, this.trail.trailLength, this.bifurcation.currentWidth);
    this.renderer.splitMesh.visible = false;
  }

  /**
   * Manually triggers or forces bifurcation into twin heads.
   * @param {number} [currentWidth]
   * @param {boolean} [force=false]
   */
  triggerSplit(currentWidth, force = false) {
    const triggered = this.bifurcation.triggerSplit(currentWidth, force);
    if (triggered) {
      this.trail.onTriggerSplit(this.bifurcation.headB);
    }
  }

  /**
   * Updates global/individual thickness limiter ceiling.
   * @param {number} limit
   */
  setWidthLimit(limit) {
    this.bifurcation.setWidthLimit(limit);
    this.trail.setWidthLimit(limit);
  }

  /**
   * Main per-frame update loop.
   * @param {number} time – elapsed time in seconds
   * @param {number} delta – time step since last frame
   */
  update(time, delta) {
    this.renderer.material.uniforms.uTime.value = time;
    this.renderer.splitMaterial.uniforms.uTime.value = time;

    const clampedDelta = Math.min(Math.max(delta || 0.016, 0.001), 0.05);

    // 1. Advance Guide Agent Kinematics
    this.agent.update(time, clampedDelta);

    // 2. Advance Thickness Breathing & Bifurcation State Machine
    this.bifurcation.update(time, clampedDelta, this.agent);

    // If split was just triggered (autonomously or forced), sync split trail
    if (this.bifurcation.justTriggeredSplit) {
      this.trail.onTriggerSplit(this.bifurcation.headB);
      this.bifurcation.justTriggeredSplit = false;
    }

    // 3. Commit Head Positions to Fixed-Distance History Trail
    const segDist = Math.max(0.005, this.trail.trailLength / Math.max(1, this._segments - 1));
    this.trail.update(
      this.bifurcation.headA,
      this.bifurcation.headB,
      this.bifurcation.headWidthA,
      this.bifurcation.headWidthB,
      this.bifurcation,
      segDist,
      this.trail.fixedPathTrail,
      clampedDelta,
      this.agent.currentV,
      this.agent.headingAngle
    );

    // 4. Update Three.js Ribbon Geometries & Attributes
    this.renderer.update(
      this.trail.spine,
      this.trail.widths,
      this.trail.splitSpine,
      this.trail.splitWidths,
      this.bifurcation.state,
      this.agent.headingAngle,
      this.trail.lateralOffsetsA,
      this.trail.lateralOffsetsB,
      this.trail.tangentsA,
      this.trail.tangentsB
    );
  }

  dispose() {
    this.renderer.dispose();
  }
}
