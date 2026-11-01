import * as THREE from 'three';

/**
 * BifurcationController
 * ---------------------
 * Governs dynamic stroke thickness modulation, mandala core tapering,
 * fixed-arclength spatial wave weaving, and the split/merge lifecycle
 * into twin brush heads (Head A and Head B).
 *
 * Bifurcation state machine:
 *   CLOSED -> OPENING -> SUSTAINED -> CLOSING -> DRAINING -> CLOSED
 */
export class BifurcationController {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.phaseOffset = options.phaseOffset ?? 0.0;

    // ── Dynamic Stroke Thickness Modulation ──
    this.maxWidth = options.maxWidth ?? 0.08;
    this.widthLimit = options.widthLimit ?? 0.08;
    this.widthSpeed = options.widthSpeed ?? 0.22;
    this.widthPhase = options.widthPhase ?? (this.phaseOffset + Math.PI * 0.5);

    this.independentWidth = options.independentWidth ?? true;
    this.widthSpeedMult = options.widthSpeedMult ?? 1.0;
    this.widthHarmonicPhase = options.widthHarmonicPhase ?? (this.phaseOffset * 2.4);

    // ── Mandala Core Radial Taper ──
    this.centerTaperStrength = options.centerTaperStrength ?? 0.85;
    this.centerTaperRadius = options.centerTaperRadius ?? 0.35;

    // ── Spatial Sine Wave on Motion Path ──
    this.waveFreq = options.waveFreq ?? 3.5;
    this.waveAmp = options.waveAmp ?? 0.028;

    // ── Bifurcation / Fork Configuration & State ──
    this.bifurcationEnabled = options.bifurcationEnabled ?? true;
    this.splitThreshold = options.splitThreshold ?? 0.38;
    this.splitChance = options.splitChance ?? 0.75;
    this.splitSeparation = options.splitSeparation ?? 0.065;
    this.splitDuration = options.splitDuration ?? 5.5;
    this.splitOpenDuration = 1.3;
    this.splitCloseDuration = 1.3;
    this.splitMinCooldown = options.splitMinCooldown ?? 7.0;
    this.splitCooldown = 2.5 + (this.phaseOffset * 2.3) % 4.5;

    this.state = 'CLOSED'; // 'CLOSED', 'OPENING', 'SUSTAINED', 'CLOSING', 'DRAINING'
    this.splitProgress = 0.0;
    this.splitTimer = 0.0;
    this.splitDistSinceStart = 0.0;
    this.splitDrainDist = 0.0;
    this.splitDrainSteps = 0;
    this.currentSplitDuration = this.splitDuration;
    this.splitMaxCap = this.maxWidth;
    this._wasAboveThreshold = true;
    this.justTriggeredSplit = false;

    // Calculated Twin Head Outputs
    this.headA = new THREE.Vector2();
    this.headB = new THREE.Vector2();
    this.headWidthA = 0.0;
    this.headWidthB = 0.0;
    this.currentWidth = 0.0;

    this._initInitialWidth();
  }

  _initInitialWidth() {
    const initR = 0.42;
    const initNormR = Math.min(1.0, initR / Math.max(0.001, this.centerTaperRadius));
    const initSmoothR = initNormR * initNormR * (3.0 - 2.0 * initNormR);
    const initRadial = (this.centerTaperStrength > 0.001)
      ? (1.0 - this.centerTaperStrength * (1.0 - initSmoothR))
      : 1.0;
    const initW = this.maxWidth * (0.5 - 0.5 * Math.cos(this.widthPhase)) * initRadial;
    this.currentWidth = initW;
    this.headWidthA = initW;
    this.headWidthB = initW;
  }

  /**
   * Triggers bifurcation into two heads.
   * Locks the stroke thickness cap to the triggering thinness until the heads rejoin.
   * @param {number} [currentWidth] - current brush thickness
   * @param {boolean} [force=false]  - whether to override cooldown/state
   */
  triggerSplit(currentWidth, force = false) {
    if (this.state !== 'CLOSED' && !force) return false;
    this.state = 'OPENING';
    this.splitProgress = (force && this.splitProgress > 0) ? this.splitProgress : 0.0;
    this.splitTimer = 0.0;
    this.splitDistSinceStart = 0.0;
    this.splitDrainDist = 0.0;
    this.splitDrainSteps = 0;
    this.currentSplitDuration = this.splitDuration * (0.85 + Math.random() * 0.3);
    const thresholdWidth = this.maxWidth * this.splitThreshold;
    const w = (currentWidth !== undefined && currentWidth > 0) ? currentWidth : thresholdWidth;
    this.splitMaxCap = Math.min(w, thresholdWidth);
    this._wasAboveThreshold = false;
    this.justTriggeredSplit = true;
    return true;
  }

  /**
   * Completes draining after all vertebrae of the split branch have cleared out.
   */
  completeDrain() {
    this.state = 'CLOSED';
    this.splitProgress = 0.0;
    this.splitDrainSteps = 0;
    this.splitCooldown = this.splitMinCooldown * (0.8 + Math.random() * 0.4);
  }

  /**
   * Updates thickness limit and clamps internal cap.
   * @param {number} limit
   */
  setWidthLimit(limit) {
    this.widthLimit = limit;
    if (this.splitMaxCap > limit) this.splitMaxCap = limit;
  }

  /**
   * Updates breathing thickness dynamics, bifurcation state, and twin head positions.
   * @param {number} time - elapsed time in seconds
   * @param {number} dt   - delta time in seconds
   * @param {import('./KinematicBrushAgent.js').KinematicBrushAgent} agent - guide agent
   */
  update(time, dt, agent) {
    const clampedDelta = Math.min(Math.max(dt || 0.016, 0.001), 0.05);

    // 0. Dynamic stroke thickness modulation
    const effectiveWidthSpeed = this.widthSpeed * (this.independentWidth ? this.widthSpeedMult : 1.0);
    this.widthPhase += effectiveWidthSpeed * clampedDelta;

    let widthCycle;
    if (this.independentWidth) {
      // Golden ratio harmonics (1.618 and 0.618) guarantee unique breathing cadences
      const phi = this.widthPhase;
      const h1 = Math.sin(phi);
      const h2 = Math.sin(phi * 1.618 + this.widthHarmonicPhase) * 0.35;
      const h3 = Math.sin(phi * 0.618 + this.widthHarmonicPhase * 2.1) * 0.2;
      const rawCycle = (h1 + h2 + h3 + 1.55) / 3.1;
      widthCycle = THREE.MathUtils.clamp(rawCycle, 0.0, 1.0);
    } else {
      widthCycle = 0.5 - 0.5 * Math.cos(this.widthPhase);
    }

    let rawHeadWidth = this.maxWidth * widthCycle;

    // Apply Radial Limiter to raw head width near mandala center (0, 0)
    if (this.centerTaperStrength > 0.001) {
      const r = agent.pos.length();
      const normR = Math.min(1.0, r / Math.max(0.001, this.centerTaperRadius));
      const smoothR = normR * normR * (3.0 - 2.0 * normR);
      const radialFactor = 1.0 - this.centerTaperStrength * (1.0 - smoothR);
      rawHeadWidth *= radialFactor;
    }

    // 1. Bifurcation State Machine & Probability Trigger
    const thresholdWidth = this.maxWidth * this.splitThreshold;
    const isBelowThreshold = (rawHeadWidth <= thresholdWidth);

    if (this.bifurcationEnabled) {
      if (this.state === 'CLOSED') {
        this.splitCooldown -= clampedDelta;
        if (isBelowThreshold) {
          if (this._wasAboveThreshold && this.splitCooldown <= 0.0) {
            if (Math.random() < this.splitChance) {
              this.triggerSplit(rawHeadWidth);
            } else {
              this.splitCooldown = 3.5;
            }
          }
          this._wasAboveThreshold = false;
        } else {
          this._wasAboveThreshold = true;
        }
      }
    } else if (this.state !== 'CLOSED') {
      if (this.state !== 'DRAINING') {
        this.state = 'CLOSING';
      }
    }

    // Advance split lifecycle
    if (this.state === 'OPENING') {
      this.splitTimer += clampedDelta;
      const t = Math.min(1.0, this.splitTimer / Math.max(0.01, this.splitOpenDuration));
      this.splitProgress = t * t * (3.0 - 2.0 * t);
      if (t >= 1.0) {
        this.state = 'SUSTAINED';
        this.splitTimer = 0.0;
      }
    } else if (this.state === 'SUSTAINED') {
      this.splitProgress = 1.0;
      this.splitTimer += clampedDelta;
      if (this.splitTimer >= this.currentSplitDuration) {
        this.state = 'CLOSING';
        this.splitTimer = 0.0;
      }
    } else if (this.state === 'CLOSING') {
      this.splitTimer += clampedDelta;
      const t = Math.min(1.0, this.splitTimer / Math.max(0.01, this.splitCloseDuration));
      this.splitProgress = 1.0 - t * t * (3.0 - 2.0 * t);
      if (t >= 1.0) {
        this.splitProgress = 0.0;
        this.state = 'DRAINING';
        this.splitDrainDist = 0.0;
        this.splitDrainSteps = 0;
        this.splitTimer = 0.0;
      }
    }

    // Thickness capping rule: lock ceiling while split is active
    let effectiveHeadWidth = rawHeadWidth;
    if (this.state !== 'CLOSED' && this.state !== 'DRAINING') {
      effectiveHeadWidth = Math.min(rawHeadWidth, this.splitMaxCap);
    } else {
      if (this.splitMaxCap < this.maxWidth) {
        this.splitMaxCap += (this.maxWidth - this.splitMaxCap) * Math.min(1.0, clampedDelta * 1.6);
      }
    }

    if (this.widthLimit > 0.0001) {
      effectiveHeadWidth = Math.min(effectiveHeadWidth, this.widthLimit);
    }

    const twinBranchScale = THREE.MathUtils.lerp(1.0, 0.65, this.splitProgress);
    this.headWidthA = effectiveHeadWidth * twinBranchScale;
    this.headWidthB = effectiveHeadWidth * twinBranchScale;
    this.currentWidth = this.headWidthA;

    // 2. Spatial Sine Wave along motion path
    const spatialAngle = agent.pathDistance * (this.waveFreq * 5.0) + this.phaseOffset;
    const waveOffset = (this.waveAmp > 0.0001) ? (this.waveAmp * Math.sin(spatialAngle)) : 0.0;

    // 3. Twin heads calligraphic divergence along guide normal
    const S = this.splitProgress;
    const halfSep = this.splitSeparation * 0.5;
    const offsetA = S * halfSep;
    const offsetB = -S * halfSep;

    this.headA.set(
      agent.pos.x + agent.normal.x * (offsetA + waveOffset),
      agent.pos.y + agent.normal.y * (offsetA + waveOffset)
    );
    this.headB.set(
      agent.pos.x + agent.normal.x * (offsetB + waveOffset),
      agent.pos.y + agent.normal.y * (offsetB + waveOffset)
    );

    return this;
  }

  /**
   * Resets bifurcation controller to initial state.
   */
  reset() {
    this.widthPhase = this.phaseOffset + Math.PI * 0.5;
    this._initInitialWidth();
    this.state = 'CLOSED';
    this.splitProgress = 0.0;
    this.splitTimer = 0.0;
    this.splitDistSinceStart = 0.0;
    this.splitDrainDist = 0.0;
    this.splitDrainSteps = 0;
    this.splitCooldown = 2.5 + (this.phaseOffset * 2.3) % 4.5;
    this.splitMaxCap = this.maxWidth;
    this._wasAboveThreshold = true;
    this.justTriggeredSplit = false;
  }
}
