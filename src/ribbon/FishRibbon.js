import * as THREE from 'three';
import { createPaperMaterial } from '../shaders/paperMaterial.js';

export class FishRibbon {
  /**
   * @param {Object} options
   * @param {number} options.segments Number of vertebrae spine segments (e.g. 60)
   * @param {number} options.baseWidth Max ribbon width in world units
   * @param {number} options.color Hex color of the brush stroke
   * @param {number} options.speed Head speed
   * @param {number} options.waveFreq Number of wave cycles along the body
   * @param {number} options.waveAmp Max lateral fish tail sway amplitude
   * @param {number} options.pathRadius Orbit radius in source space
   * @param {number} options.phaseOffset Phase offset for multi-layered strokes
   * @param {number} options.orbitSpeed Orbit revolution speed
   */
  constructor(options = {}) {
    this.segments = options.segments || 64;
    this.speed = options.speed || 1.2;
    this.waveFreq = options.waveFreq || 3.5;
    this.waveAmp = options.waveAmp ?? 0.028; // spatial wave amplitude along motion path (baked into trail)
    this.pathRadius = options.pathRadius || 0.42;
    this.phaseOffset = options.phaseOffset || 0.0;
    this.orbitSpeed = options.orbitSpeed || 0.4;
    this.splitIntensity = options.splitIntensity || 0.0; // legacy compatibility

    // ── Path-Anchored Trail (Фиксация следа: где нарисовано, там и лежит) ──
    // Eliminates lateral sliding, corner-cutting, and undulation.
    // Points committed to history stay 100% frozen in world coordinates where the brush painted them.
    this.fixedPathTrail = options.fixedPathTrail ?? true;

    // ── Bifurcation / Fork into Two Heads (Раздвоение кисти на две головы) ──
    // Probabilistically splits the brush into two distinct heads when stroke thickness dips below a threshold.
    // The invisible central guide axis continues smoothly, while Head A and Head B diverge symmetrically
    // with organic drift and independent movement, capped at the triggering thinness.
    this.bifurcationEnabled = options.bifurcationEnabled ?? true;
    this.splitThreshold = options.splitThreshold ?? 0.38;       // Trigger when head width <= maxWidth * splitThreshold
    this.splitChance = options.splitChance ?? 0.75;             // Probability of triggering when dipping below threshold
    this.splitSeparation = options.splitSeparation ?? 0.065;    // Base distance between twin heads in world units
    this.splitDuration = options.splitDuration ?? 5.5;          // Base duration of split in seconds
    this.splitOpenDuration = 1.3;                               // Seconds to fork apart smoothly
    this.splitCloseDuration = 1.3;                              // Seconds to merge back smoothly
    this.splitMinCooldown = options.splitMinCooldown ?? 7.0;    // Minimum seconds between split events
    this.splitCooldown = 2.5 + (this.phaseOffset * 2.3) % 4.5;  // Stagger initial split opportunity per ribbon
    this.splitState = 'CLOSED';                                 // 'CLOSED', 'OPENING', 'SUSTAINED', 'CLOSING', 'DRAINING'
    this.splitProgress = 0.0;                                   // 0.0 = merged single brush, 1.0 = fully split
    this.splitTimer = 0.0;
    this.splitSegmentsSinceStart = 0;                           // History steps accumulated since split opened
    this.splitDrainSteps = 0;                                   // History steps accumulated since heads merged
    this.currentSplitDuration = this.splitDuration;
    this.splitMaxCap = this.maxWidth;                           // Active upper width ceiling during bifurcation
    this._wasAboveThreshold = true;
    this.splitSeed = options.splitSeed ?? (Math.random() * 100.0);

    // ── Dynamic Stroke Thickness Modulation ──
    // Smoothly breathes between 0.0 and 0.08 over time
    this.maxWidth = options.maxWidth ?? 0.08;
    this.widthLimit = options.widthLimit ?? 0.08; // Global/individual thickness limiter ceiling
    this.widthSpeed = options.widthSpeed ?? 0.22;
    this.widthPhase = options.widthPhase ?? (this.phaseOffset + Math.PI * 0.5);

    // ── Radial Distance Thickness Limiter (Center Taper) ──
    // Constrains maximum stroke thickness when ribbon points are close to the origin (0, 0).
    // Prevents mandala center crowding/clumping and produces delicate filigree lines near the core.
    this.centerTaperStrength = options.centerTaperStrength ?? 0.85; // 0 = disabled, 1 = tapers to 0 at origin
    this.centerTaperRadius = options.centerTaperRadius ?? 0.35;     // Distance from origin where tapering begins

    // ── Brush Tip / Taper (Наконечник кисти) ──
    // Ensures the leading head of the brush is always slender and pointed like a fine brush tip,
    // eliminating blunt, flat edges pushing forward.
    this.headTaperLength = options.headTaperLength ?? 0.15; // fraction of stroke length [0.03 .. 0.35]
    this.headTipWidth = options.headTipWidth ?? 0.02;       // minimum tip thickness ratio [0.0 .. 0.15]

    // ── Asynchronous & Random Speed Dynamics ──
    // Allows each brush to have an independent random movement speed and organic drift over time.
    this.randomSpeedEnabled = options.randomSpeedEnabled ?? true;
    this.speedMultiplier = options.speedMultiplier ?? 1.0;
    this.speedDriftEnabled = options.speedDriftEnabled ?? true;
    this.speedWanderIntensity = options.speedWanderIntensity ?? 0.55;
    this.speedWanderFreq = options.speedWanderFreq ?? 0.28;
    this.speedSeed = options.speedSeed ?? (Math.random() * 100.0);
    this._currentV = 0.0;

    // ── Independent Stroke Thickness Dynamics ──
    // Decouples thickness modulation so each brush breathes at its own independent cadence
    // and unique multi-harmonic pattern instead of pulsing in unison.
    this.independentWidth = options.independentWidth ?? true;
    this.widthSpeedMult = options.widthSpeedMult ?? 1.0;
    this.widthHarmonicPhase = options.widthHarmonicPhase ?? (this.phaseOffset * 2.4);

    // ── Historical Stroke Width Buffers (Main & Split Branches) ──
    // Stores the exact painted thickness for each vertebra (index 0 = head, segments-1 = tail).
    // When the brush head breathes or passes near the center, already-drawn points retain the width
    // they were created with as the stroke flows forward through time.
    this.widths = new Float32Array(this.segments);
    this._newWidths = new Float32Array(this.segments);
    this.splitWidths = new Float32Array(this.segments);
    this._splitNewWidths = new Float32Array(this.segments);

    // Pre-allocated typed arrays for lateral offsets (eliminates GC stutter)
    this._lateralOffsetsA = new Float32Array(this.segments);
    this._lateralOffsetsB = new Float32Array(this.segments);

    // ── Minimum turning radius constraint ──
    // Prevents the head from making sharp U-turns that create visual noise.
    // Governs max angular velocity: |ω_max| = v / minTurnRadius.
    this.minTurnRadius = options.minTurnRadius ?? 0.12;

    // ── Steering Kinematics Agent State (Invisible Guide Axis) ──
    // The invisible brush head is an autonomous self-steering body with forward velocity v,
    // continuous heading angle θ, and strictly bounded angular velocity ω.
    this.headPos = new THREE.Vector2(
      Math.cos(this.phaseOffset) * (this.pathRadius || 0.42),
      Math.sin(this.phaseOffset) * (this.pathRadius || 0.42)
    );
    this._prevHeadPos = this.headPos.clone();

    // Twin brush heads: Head A (main branch) and Head B (split branch)
    this.headA = this.headPos.clone();
    this.headB = this.headPos.clone();
    this._prevHeadAPos = this.headPos.clone();
    this._prevHeadBPos = this.headPos.clone();
    this._prevGuidePos = this.headPos.clone();
    this.pathDistance = 0.0;

    // Initial width calculation at initial head position
    const initR = this.headPos.length();
    const initNormR = Math.min(1.0, initR / Math.max(0.001, this.centerTaperRadius));
    const initSmoothR = initNormR * initNormR * (3.0 - 2.0 * initNormR);
    const initRadial = (this.centerTaperStrength > 0.001)
      ? (1.0 - this.centerTaperStrength * (1.0 - initSmoothR))
      : 1.0;
    const initW = this.maxWidth * (0.5 - 0.5 * Math.cos(this.widthPhase)) * initRadial;
    this.widths.fill(initW);
    this.splitWidths.fill(initW);
    this.currentWidth = initW;
    this.baseWidth = this.currentWidth;

    // Initial heading: tangent to circular orbit (counter-clockwise)
    this.headingAngle = this.phaseOffset + Math.PI * 0.5;
    this.angularVelocity = 0.0;
    this.maxBoundaryRadius = options.maxBoundaryRadius ?? 0.58; // Soft perimeter boundary of the mandala field

    // Audio reactivity / external modulation hooks (for future sound driver)
    this.audioSpeedMult = 1.0;
    this.audioSteerMult = 1.0;
    this.audioExtraAngular = 0.0;

    // Material
    this.material = createPaperMaterial(options.color || 0xff385c);
    this.splitMaterial = createPaperMaterial(options.splitColor || options.color || 0xff8533);

    // Spine points (positions along the backbone)
    this.spine = [];
    const initDir = new THREE.Vector2(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    const initSegDist = 0.018 * (this.speed / 1.0);
    for (let i = 0; i < this.segments; i++) {
      const p = this.headPos.clone().addScaledVector(initDir, -i * initSegDist);
      this.spine.push(p);
    }

    // Secondary spine for the split/divergent branch
    this.splitSpine = [];
    for (let i = 0; i < this.segments; i++) {
      this.splitSpine.push(this.spine[i].clone());
    }

    // ── Preallocated centerline vectors for smooth normal extrusion ──
    this._centerline = [];
    this._splitCenterline = [];
    for (let i = 0; i < this.segments; i++) {
      this._centerline.push(this.spine[i].clone());
      this._splitCenterline.push(this.spine[i].clone());
    }

    // ── Immutable Path History Ring Buffers (Anchored to world space) ──
    const historyCap = this.segments + 2;
    this._historyA = [];
    this._historyB = [];
    this._historyWidthsA = new Float32Array(historyCap);
    this._historyWidthsB = new Float32Array(historyCap);
    this._accumDistA = 0.0;
    this._accumDistB = 0.0;
    this._prevRecordedPosA = this.headA.clone();
    this._prevRecordedPosB = this.headB.clone();

    for (let i = 0; i < historyCap; i++) {
      const idx = Math.min(i, this.segments - 1);
      this._historyA.push(this.spine[idx].clone());
      this._historyB.push(this.splitSpine[idx].clone());
    }
    this._historyWidthsA.fill(initW);
    this._historyWidthsB.fill(initW);

    // Dynamic wave phase synchronized with movement speed
    this.wavePhase = this.phaseOffset;

    // ── Reusable temp vectors (avoid per-frame allocations / GC pressure) ──
    this._tmpDir      = new THREE.Vector2();
    this._tmpTangent  = new THREE.Vector2();
    this._tmpNormal   = new THREE.Vector2();
    this._tmpCenter   = new THREE.Vector2();
    this._tmpLeft     = new THREE.Vector2();
    this._tmpRight    = new THREE.Vector2();
    this._tmpHead     = new THREE.Vector2();

    // ── Max instances for mandala sectors × 2 (mirror) ──
    this._maxInstances = 64;
    this._instanceCount = 1;

    // Build Main InstancedMesh (replaces plain Mesh)
    this.geometry = this._createRibbonGeometry(this.segments);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this._maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 1;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    // Build Split Branch InstancedMesh
    this.splitGeometry = this._createRibbonGeometry(this.segments);
    this.splitMesh = new THREE.InstancedMesh(this.splitGeometry, this.splitMaterial, this._maxInstances);
    this.splitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splitMesh.count = 0;
    this.splitMesh.frustumCulled = false;
    this.splitMesh.visible = false;
    this.splitMesh.renderOrder = 2;
    this.splitMesh.position.z = 0.0005; // deterministic tiny z offset prevents z-fighting and shimmering

    // Set identity matrix for the initial single instance
    const dummy = new THREE.Object3D();
    dummy.updateMatrix();
    this.mesh.setMatrixAt(0, dummy.matrix);
    this.splitMesh.setMatrixAt(0, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.splitMesh.instanceMatrix.needsUpdate = true;

    // Group containing both main and split branches
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.add(this.splitMesh);
  }

  /**
   * Rebuild instance matrices for mandala-style symmetry.
   *
   * Each ribbon is rendered `sectors` times (optionally × 2 with mirror),
   * each rotated by 2π/N × i around the origin.
   *
   * @param {number}  sectors – number of rotational copies (2–32)
   * @param {boolean} mirror  – add a Y-reflected set for bilateral symmetry
   */
  updateInstances(sectors, mirror) {
    const sectorAngle = (Math.PI * 2) / Math.max(2, sectors);
    const dummy = new THREE.Object3D();
    let idx = 0;

    // Non-mirrored rotational copies
    for (let i = 0; i < sectors; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, sectorAngle * i);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, dummy.matrix);
      this.splitMesh.setMatrixAt(idx, dummy.matrix);
      idx++;
    }

    // Mirrored copies: reflect across X-axis (scale Y by -1), then rotate
    if (mirror) {
      for (let i = 0; i < sectors; i++) {
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, 0, sectorAngle * i);
        dummy.scale.set(1, -1, 1);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(idx, dummy.matrix);
        this.splitMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }

    this.mesh.count = idx;
    this._instanceCount = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.splitMesh.instanceMatrix.needsUpdate = true;
  }

  _createRibbonGeometry(segments) {
    const vertexCount = segments * 2;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];

    // Pre-calculate UV coordinates once (they are constant throughout runtime)
    for (let i = 0; i < segments; i++) {
      const s = i / (segments - 1);
      const vIdx = i * 2;
      uvs[vIdx * 2 + 0] = s;
      uvs[vIdx * 2 + 1] = 1.0;
      uvs[(vIdx + 1) * 2 + 0] = s;
      uvs[(vIdx + 1) * 2 + 1] = -1.0;
    }

    for (let i = 0; i < segments - 1; i++) {
      const p1 = i * 2;
      const p2 = i * 2 + 1;
      const p3 = (i + 1) * 2;
      const p4 = (i + 1) * 2 + 1;
      indices.push(p1, p2, p3);
      indices.push(p2, p4, p3);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.StaticDrawUsage));
    geom.setIndex(indices);
    return geom;
  }

  /**
   * Resets the brush head to its initial orbit position and straightens the spine.
   */
  reset() {
    const initR = this.pathRadius || 0.42;
    this.headPos.set(
      Math.cos(this.phaseOffset) * initR,
      Math.sin(this.phaseOffset) * initR
    );
    this.headingAngle = this.phaseOffset + Math.PI * 0.5;
    this.angularVelocity = 0.0;
    this.wavePhase = this.phaseOffset;
    this.widthPhase = this.phaseOffset + Math.PI * 0.5;
    this.currentWidth = this.maxWidth * (0.5 - 0.5 * Math.cos(this.widthPhase));
    this.baseWidth = this.currentWidth;

    this.headA.copy(this.headPos);
    this.headB.copy(this.headPos);
    this._prevHeadPos.copy(this.headPos);
    this._prevHeadAPos.copy(this.headPos);
    this._prevHeadBPos.copy(this.headPos);
    this._prevGuidePos.copy(this.headPos);
    this._prevRecordedPosA.copy(this.headPos);
    this._prevRecordedPosB.copy(this.headPos);
    this._accumDistA = 0.0;
    this._accumDistB = 0.0;
    this.pathDistance = 0.0;

    this.splitState = 'CLOSED';
    this.splitProgress = 0.0;
    this.splitTimer = 0.0;
    this.splitSegmentsSinceStart = 0;
    this.splitDrainSteps = 0;
    this.splitCooldown = 2.5 + (this.phaseOffset * 2.3) % 4.5;
    this.splitMaxCap = this.maxWidth;
    this.splitMesh.visible = false;
    this._wasAboveThreshold = true;

    const initDir = new THREE.Vector2(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    const initSegDist = 0.018 * (this.speed / 1.0);
    for (let i = 0; i < this.segments; i++) {
      this.spine[i].copy(this.headPos).addScaledVector(initDir, -i * initSegDist);
      this.splitSpine[i].copy(this.spine[i]);
      this._centerline[i].copy(this.spine[i]);
      this._splitCenterline[i].copy(this.spine[i]);
      this._historyA[i].copy(this.spine[i]);
      this._historyB[i].copy(this.splitSpine[i]);
      this._historyWidthsA[i] = this.currentWidth;
      this._historyWidthsB[i] = this.currentWidth;
    }
    this.widths.fill(this.currentWidth);
    this.splitWidths.fill(this.currentWidth);
  }

  /**
   * Triggers bifurcation into two heads.
   * Locks the stroke thickness cap to the triggering thinness until the heads rejoin.
   *
   * @param {number} [currentWidth] - current brush thickness
   * @param {boolean} [force=false]  - whether to override cooldown/state
   */
  triggerSplit(currentWidth, force = false) {
    if (this.splitState !== 'CLOSED' && !force) return;
    this.splitState = 'OPENING';
    this.splitProgress = (force && this.splitProgress > 0) ? this.splitProgress : 0.0;
    this.splitTimer = 0.0;
    this.splitSegmentsSinceStart = 0;
    this.splitDrainSteps = 0;
    this.currentSplitDuration = this.splitDuration * (0.85 + Math.random() * 0.3);
    const thresholdWidth = this.maxWidth * this.splitThreshold;
    const w = (currentWidth !== undefined && currentWidth > 0) ? currentWidth : thresholdWidth;
    this.splitMaxCap = Math.min(w, thresholdWidth);
    this._wasAboveThreshold = false;
  }

  /**
   * Updates the thickness limiter ceiling for this ribbon.
   * Immediately clamps current and historical width buffers so changes take effect in real time.
   * @param {number} limit - maximum allowable stroke thickness
   */
  setWidthLimit(limit) {
    this.widthLimit = limit;
    if (this.splitMaxCap > limit) this.splitMaxCap = limit;
    for (let i = 0; i < this.segments; i++) {
      if (this.widths[i] > limit) this.widths[i] = limit;
      if (this.splitWidths[i] > limit) this.splitWidths[i] = limit;
      if (this._historyWidthsA && this._historyWidthsA[i] > limit) this._historyWidthsA[i] = limit;
      if (this._historyWidthsB && this._historyWidthsB[i] > limit) this._historyWidthsB[i] = limit;
    }
  }

  /**
   * Advects historical stroke width values along a spine.
   */
  _advectWidths(widths, newWidths, headWidth, shift) {
    newWidths[0] = headWidth;
    if (shift > 0.00001) {
      const segs = this.segments;
      for (let i = 1; i < segs; i++) {
        const srcIndex = i - shift;
        if (srcIndex <= 0.0) {
          const alpha = Math.max(0.0, Math.min(1.0, i / Math.max(0.0001, shift)));
          newWidths[i] = THREE.MathUtils.lerp(headWidth, widths[0], alpha);
        } else {
          const k = Math.floor(srcIndex);
          const f = srcIndex - k;
          if (k + 1 < segs) {
            newWidths[i] = THREE.MathUtils.lerp(widths[k], widths[k + 1], f);
          } else {
            newWidths[i] = widths[segs - 1];
          }
        }
      }
    } else {
      for (let i = 1; i < this.segments; i++) {
        newWidths[i] = widths[i];
      }
    }
    widths.set(newWidths);
  }

  /**
   * Computes forward velocity considering master orbitSpeed, individual speed multipliers,
   * organic wandering drift, and external audio modulation.
   */
  _computeVelocity(time) {
    let speed = this.orbitSpeed * 0.75;
    if (this.randomSpeedEnabled) {
      speed *= this.speedMultiplier;
      if (this.speedDriftEnabled) {
        // Multi-harmonic smooth organic speed wandering unique to each ribbon
        const w = Math.sin(time * this.speedWanderFreq + this.speedSeed) * 0.4 +
                  Math.sin(time * this.speedWanderFreq * 1.618 + this.speedSeed * 1.7) * 0.25;
        const drift = Math.max(0.2, 1.0 + w * this.speedWanderIntensity);
        speed *= drift;
      }
    }
    return Math.max(0.0, speed * this.audioSpeedMult);
  }

  /**
   * Updates the autonomous brush agent using steering kinematics.
   *
   * Kinematic model:
   *  - Linear velocity:  v = _computeVelocity(time)
   *  - Angular velocity: ω is driven by smooth multi-harmonic wandering and a soft
   *                      centripetal restoring force keeping the brush inside the mandala.
   *  - Curvature limit:  |ω| ≤ v / R_min, mathematically guaranteeing that the turning
   *                      radius R = v / |ω| is strictly ≥ minTurnRadius at every point.
   *
   * @param {number} time – elapsed time in seconds
   * @param {number} dt   – delta time since last frame
   * @returns {THREE.Vector2} updated head position
   */
  _updateHeadAgent(time, dt) {
    // Clamp dt to avoid huge jumps on tab switch / lag spike
    const clampedDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);

    // 1. Forward linear velocity (with individual multiplier and drift)
    const v = this._computeVelocity(time);
    this._currentV = v;

    if (v < 0.0001) {
      return this.headPos;
    }

    // 2. Multi-harmonic organic wandering (irrational ratio frequencies ensure non-repeating curves)
    const phi = this.phaseOffset;
    const wander =
      Math.sin(time * 0.85 + phi) * 1.5 +
      Math.sin(time * 1.93 + phi * 1.618) * 0.9 +
      Math.sin(time * 0.37 + phi * 2.718) * 0.7;

    // 3. Gentle centripetal boundary steering
    // When approaching the outer realm and heading outward, smoothly bias angular velocity
    // so the brush curves into a tangential/inward path without hitting an invisible wall.
    // Brushes are allowed to venture off-screen; their turn curvature strictly obeys minTurnRadius.
    const r = this.headPos.length();
    const rOuter = this.maxBoundaryRadius;
    const rSoft = rOuter * 0.75;
    let boundarySteer = 0.0;

    if (r > 0.001) {
      // Unit radial vector (pointing outward from origin)
      const invR = 1.0 / r;
      const rx = this.headPos.x * invR;
      const ry = this.headPos.y * invR;

      // Unit heading vector
      const hx = Math.cos(this.headingAngle);
      const hy = Math.sin(this.headingAngle);

      // Radial velocity component: > 0 moving outward, <= 0 moving inward
      const vOut = hx * rx + hy * ry;

      // 2D cross product (radial x heading):
      // cross = rx * hy - ry * hx = sin(headingAngle - radialAngle)
      // Positive cross means heading is counter-clockwise of radial -> turning CCW (+omega) turns inward.
      // Negative cross means heading is clockwise of radial -> turning CW (-omega) turns inward.
      const cross = rx * hy - ry * hx;
      const turnDir = cross >= 0 ? 1.0 : -1.0;

      if (r > rSoft) {
        const excess = (r - rSoft) / Math.max(0.01, rOuter - rSoft);
        if (vOut > 0.0) {
          // Gently curve inward away from radial direction.
          // Steering urgency scales smoothly with distance and outward velocity.
          const urgency = 0.6 + excess * 1.5;
          boundarySteer = turnDir * urgency * Math.max(0.2, vOut);
        } else if (r > rOuter) {
          // Already heading inward or tangential, but outside primary boundary:
          // Keep a very mild inward bias until comfortably inside
          const mildUrgency = Math.min(1.0, (r - rOuter) * 1.5);
          boundarySteer = turnDir * mildUrgency * 0.4;
        }
      }
    }

    // Combine wander and boundary return
    // Wander retains organic life even outside, never abruptly clamped to zero
    const wanderWeight = r > rOuter ? THREE.MathUtils.clamp(1.0 - (r - rOuter) * 0.8, 0.45, 1.0) : 1.0;
    let desiredOmega =
      wander * wanderWeight * this.audioSteerMult +
      boundarySteer +
      this.audioExtraAngular;

    // 4. Strict curvature / minimum turning radius constraint:
    //    R = v / |ω|  =>  |ω_max| = v / R_min
    if (this.minTurnRadius > 0.001) {
      const maxOmega = v / this.minTurnRadius;
      desiredOmega = THREE.MathUtils.clamp(desiredOmega, -maxOmega, maxOmega);
    }

    // 5. Angular inertia (smooth acceleration into turns, avoids instant angular snaps)
    const steerInertiaRate = 9.0;
    this.angularVelocity += (desiredOmega - this.angularVelocity) * Math.min(1.0, clampedDt * steerInertiaRate);

    // Re-verify physical clamp after inertia
    if (this.minTurnRadius > 0.001) {
      const maxOmega = v / this.minTurnRadius;
      this.angularVelocity = THREE.MathUtils.clamp(this.angularVelocity, -maxOmega, maxOmega);
    }

    // 6. Integrate heading angle and step position forward (100% smooth, continuous trajectory)
    this.headingAngle += this.angularVelocity * clampedDt;
    this.headPos.x += Math.cos(this.headingAngle) * v * clampedDt;
    this.headPos.y += Math.sin(this.headingAngle) * v * clampedDt;

    // Soft elastic safety tether ONLY for extreme deep outer space (r > 1.25)
    // Never snaps or clamps position; guarantees safe return even under wild user input
    if (r > 1.25) {
      const elasticPull = Math.min(1.0, (r - 1.25) * 1.5);
      this.headPos.lerp(new THREE.Vector2(0, 0), elasticPull * clampedDt * 2.0);
    }

    return this.headPos;
  }

  /**
   * Updates kinematics, bifurcation state machine, and ribbon vertex buffers.
   */
  update(time, delta) {
    this.material.uniforms.uTime.value = time;
    this.splitMaterial.uniforms.uTime.value = time;

    const clampedDelta = Math.min(Math.max(delta || 0.016, 0.001), 0.05);

    // 0. Dynamic stroke thickness modulation (independent or synchronized)
    const effectiveWidthSpeed = this.widthSpeed * (this.independentWidth ? this.widthSpeedMult : 1.0);
    this.widthPhase += effectiveWidthSpeed * clampedDelta;

    let widthCycle;
    if (this.independentWidth) {
      // Multi-harmonic organic breathing:
      // Golden ratio harmonics (1.618 and 0.618) with phase offsets guarantee
      // that each brush breathes at its own unique, non-repeating cadence.
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
      const r = this.headPos.length();
      const normR = Math.min(1.0, r / Math.max(0.001, this.centerTaperRadius));
      const smoothR = normR * normR * (3.0 - 2.0 * normR); // Cubic Hermite smoothstep [0, 1]
      const radialFactor = 1.0 - this.centerTaperStrength * (1.0 - smoothR);
      rawHeadWidth *= radialFactor;
    }

    // ── 1. Bifurcation State Machine & Probability Trigger ──
    // Feature condition: only has a probability of occurring when the stroke thickness
    // dips below a configured threshold ratio.
    const thresholdWidth = this.maxWidth * this.splitThreshold;
    const isBelowThreshold = (rawHeadWidth <= thresholdWidth);

    if (this.bifurcationEnabled) {
      if (this.splitState === 'CLOSED') {
        this.splitCooldown -= clampedDelta;
        if (isBelowThreshold) {
          // Negative edge trigger: crossing into the thin zone
          if (this._wasAboveThreshold && this.splitCooldown <= 0.0) {
            if (Math.random() < this.splitChance) {
              this.triggerSplit(rawHeadWidth);
            } else {
              // Dice roll failed: set short cooldown before testing next opportunity
              this.splitCooldown = 3.5;
            }
          }
          this._wasAboveThreshold = false;
        } else {
          this._wasAboveThreshold = true;
        }
      }
    } else if (this.splitState !== 'CLOSED') {
      // If disabled mid-split, smoothly close
      if (this.splitState !== 'DRAINING') {
        this.splitState = 'CLOSING';
      }
    }

    // Advance split lifecycle
    if (this.splitState === 'OPENING') {
      this.splitTimer += clampedDelta;
      const t = Math.min(1.0, this.splitTimer / Math.max(0.01, this.splitOpenDuration));
      this.splitProgress = t * t * (3.0 - 2.0 * t); // Smoothstep 0 -> 1
      if (t >= 1.0) {
        this.splitState = 'SUSTAINED';
        this.splitTimer = 0.0;
      }
    } else if (this.splitState === 'SUSTAINED') {
      this.splitProgress = 1.0;
      this.splitTimer += clampedDelta;
      if (this.splitTimer >= this.currentSplitDuration) {
        this.splitState = 'CLOSING';
        this.splitTimer = 0.0;
      }
    } else if (this.splitState === 'CLOSING') {
      this.splitTimer += clampedDelta;
      const t = Math.min(1.0, this.splitTimer / Math.max(0.01, this.splitCloseDuration));
      this.splitProgress = 1.0 - t * t * (3.0 - 2.0 * t); // Smoothstep 1 -> 0
      if (t >= 1.0) {
        this.splitProgress = 0.0;
        this.splitState = 'DRAINING';
        this.splitDrainSteps = 0;
        this.splitTimer = 0.0;
      }
    }

    // ── Thickness Capping Rule ──
    // "при активации раздвоения эта толщина не будет увеличена (будет новым временным порогом
    // толщины до той поры, пока две головы вновь не схлопнутся)"
    let effectiveHeadWidth = rawHeadWidth;
    if (this.splitState !== 'CLOSED' && this.splitState !== 'DRAINING') {
      effectiveHeadWidth = Math.min(rawHeadWidth, this.splitMaxCap);
    } else {
      // Once closed or draining (heads merged), smoothly release the cap back up to maxWidth
      if (this.splitMaxCap < this.maxWidth) {
        this.splitMaxCap += (this.maxWidth - this.splitMaxCap) * Math.min(1.0, clampedDelta * 1.6);
      }
    }

    // Apply global thickness limiter ceiling
    if (this.widthLimit > 0.0001) {
      effectiveHeadWidth = Math.min(effectiveHeadWidth, this.widthLimit);
    }

    // "в режиме раздвоения их толщины должны быть заведомо поменьше, чтобы не перекрывать промежуток между ними"
    const twinBranchScale = THREE.MathUtils.lerp(1.0, 0.62, this.splitProgress);
    const headWidthA = effectiveHeadWidth * twinBranchScale * (1.0 + 0.12 * Math.sin(time * 2.2 + this.splitSeed));
    const headWidthB = effectiveHeadWidth * twinBranchScale * (1.0 - 0.12 * Math.sin(time * 2.2 + this.splitSeed));
    this.currentWidth = headWidthA;
    this.baseWidth = this.currentWidth;

    // ── 2. Invisible Guide Kinematics & Spatial Sine Wave ──
    // The central guide agent follows its continuous physical trajectory uninterrupted.
    const guidePos = this._updateHeadAgent(time, delta);

    // Accumulate distance traveled by the guide agent along the path:
    const guideStep = guidePos.distanceTo(this._prevGuidePos);
    this._prevGuidePos.copy(guidePos);
    this.pathDistance += guideStep;

    // Tangent and normal vectors of the invisible guide axis
    const tx = Math.cos(this.headingAngle);
    const ty = Math.sin(this.headingAngle);
    const nx = -ty;
    const ny = tx;

    // Spatial Sine Wave along motion path (Зафиксированная синусоида):
    // Driven strictly by arclength pathDistance (NOT elapsed time).
    // As the brush travels forward, the tip weaves in a calligraphic sinusoid.
    // Because this depends solely on distance s, once points are committed to history,
    // every wave crest is 100% frozen in space without wiggling or swimming!
    const spatialAngle = this.pathDistance * (this.waveFreq * 5.0) + this.phaseOffset;
    const waveOffset = (this.waveAmp > 0.0001) ? (this.waveAmp * Math.sin(spatialAngle)) : 0.0;

    // Twin heads diverge symmetrically from the central guide axis:
    // "им нужно двигаться примерно в одну сторону, чтобы в будущем сойтись, но пока это не произошло,
    // могут быть небольшие разницы в движении (отдаления и приближения к общей оси)."
    const S = this.splitProgress;
    const halfSep = this.splitSeparation * 0.5;

    // Independent organic drift for each head (small distances away/towards axis + leading/lagging)
    const wanderA = halfSep * 0.28 * Math.sin(time * 1.7 + this.splitSeed);
    const wanderB = halfSep * 0.28 * Math.sin(time * 2.4 + this.splitSeed * 1.5);
    const leadA   = halfSep * 0.22 * Math.sin(time * 1.3 + this.splitSeed);
    const leadB   = -leadA;

    const offsetA = S * (halfSep + wanderA);
    const offsetB = -S * (halfSep + wanderB);
    const fwdA    = S * leadA;
    const fwdB    = S * leadB;

    this.headA.set(
      guidePos.x + nx * (offsetA + waveOffset) + tx * fwdA,
      guidePos.y + ny * (offsetA + waveOffset) + ty * fwdA
    );
    this.headB.set(
      guidePos.x + nx * (offsetB + waveOffset) + tx * fwdB,
      guidePos.y + ny * (offsetB + waveOffset) + ty * fwdB
    );

    this.spine[0].copy(this.headA);
    this.splitSpine[0].copy(this.headB);

    // Forward speed (from kinematics)
    const v = this._currentV;
    const segDist = 0.018 * (this.speed / 1.0);

    if (this.fixedPathTrail) {
      // ── 3. Fixed Path Trail (Immutable Trajectory History) ──
      // Samples spine points directly from the exact historical path of the brush head.
      // Once deposited on the paper at (x, y), points NEVER cut corners or slide laterally.

      // Head A history accumulation:
      const dStepA = this.headA.distanceTo(this._prevHeadAPos);
      this._prevHeadAPos.copy(this.headA);
      this._accumDistA += dStepA;

      const safeSegDist = Math.max(0.001, segDist);
      const historyCap = this._historyA.length;
      let itersA = 20;
      while (this._accumDistA >= safeSegDist && itersA-- > 0) {
        const t = THREE.MathUtils.clamp(safeSegDist / Math.max(0.00001, this._accumDistA), 0.0, 1.0);
        this._tmpHead.lerpVectors(this._prevRecordedPosA, this.headA, t);
        this._prevRecordedPosA.copy(this._tmpHead);
        this._accumDistA -= safeSegDist;

        for (let i = historyCap - 1; i > 0; i--) {
          this._historyA[i].copy(this._historyA[i - 1]);
          this._historyWidthsA[i] = this._historyWidthsA[i - 1];
        }
        this._historyA[0].copy(this._tmpHead);
        this._historyWidthsA[0] = headWidthA;
      }

      // Head B history accumulation:
      const dStepB = this.headB.distanceTo(this._prevHeadBPos);
      this._prevHeadBPos.copy(this.headB);
      this._accumDistB += dStepB;

      let itersB = 20;
      while (this._accumDistB >= safeSegDist && itersB-- > 0) {
        const t = THREE.MathUtils.clamp(safeSegDist / Math.max(0.00001, this._accumDistB), 0.0, 1.0);
        this._tmpHead.lerpVectors(this._prevRecordedPosB, this.headB, t);
        this._prevRecordedPosB.copy(this._tmpHead);
        this._accumDistB -= safeSegDist;

        for (let i = historyCap - 1; i > 0; i--) {
          this._historyB[i].copy(this._historyB[i - 1]);
          this._historyWidthsB[i] = this._historyWidthsB[i - 1];
        }
        this._historyB[0].copy(this._tmpHead);
        this._historyWidthsB[0] = headWidthB;

        if (this.splitState !== 'CLOSED') {
          this.splitSegmentsSinceStart++;
        }
        if (this.splitState === 'DRAINING') {
          this.splitDrainSteps++;
          if (this.splitDrainSteps >= Math.min(this.segments, this.splitSegmentsSinceStart)) {
            this.splitState = 'CLOSED';
            this.splitProgress = 0.0;
            this.splitCooldown = this.splitMinCooldown * (0.8 + Math.random() * 0.4);
          }
        }
      }

      // Continuous sub-segment sliding phase [0, 1) along the historical polyline
      const fracA = THREE.MathUtils.clamp(this._accumDistA / safeSegDist, 0.0, 1.0);
      const fracB = THREE.MathUtils.clamp(this._accumDistB / safeSegDist, 0.0, 1.0);

      // Vertebra 0: Active leading head tip
      this.spine[0].copy(this.headA);
      this.widths[0] = headWidthA;

      // Vertebrae 1..N-1: Continuous sliding interpolation along the fixed path trail.
      // Eliminates integer step quantization / inchworm teleportation!
      // Each vertebra smoothly slides between historical points without ever snapping.
      for (let i = 1; i < this.segments; i++) {
        this.spine[i].lerpVectors(this._historyA[i], this._historyA[i - 1], fracA);
        this.widths[i] = THREE.MathUtils.lerp(this._historyWidthsA[i], this._historyWidthsA[i - 1], fracA);
      }

      this.splitSpine[0].copy(this.headB);

      const isSplitActive = (this.splitState !== 'CLOSED');
      const startDrain = this.splitDrainSteps;
      const endFork = this.splitSegmentsSinceStart;

      // Leading head vertebra (index 0)
      if (!isSplitActive || (this.splitState === 'DRAINING' && startDrain > 0)) {
        this.splitWidths[0] = 0.0;
      } else {
        this.splitWidths[0] = headWidthB;
      }

      for (let i = 1; i < this.segments; i++) {
        this.splitSpine[i].lerpVectors(this._historyB[i], this._historyB[i - 1], fracB);

        if (!isSplitActive) {
          this.splitWidths[i] = 0.0;
        } else {
          const histIdx = i - 1;
          const wSample = THREE.MathUtils.lerp(this._historyWidthsB[i], this._historyWidthsB[i - 1], fracB);

          // Segments in front of the merge junction: width = 0 (stroke A is already drawing this!)
          if (this.splitState === 'DRAINING' && histIdx < startDrain) {
            this.splitWidths[i] = 0.0;
          }
          // Smooth taper at the merge junction (tail melting seamlessly into main stroke)
          else if (this.splitState === 'DRAINING' && histIdx <= startDrain + 2) {
            const tDrain = (histIdx - startDrain + 1) / 4.0;
            const smoothTDrain = tDrain * tDrain * (3.0 - 2.0 * tDrain);
            this.splitWidths[i] = wSample * smoothTDrain;
          }
          // Segments before the split occurred: width = 0
          else if (histIdx >= endFork) {
            this.splitWidths[i] = 0.0;
          }
          // Smooth taper at the fork root (where secondary branch organically buds out of main stem)
          else if (histIdx >= endFork - 2) {
            const tFork = (endFork - histIdx) / 3.0;
            const smoothTFork = tFork * tFork * (3.0 - 2.0 * tFork);
            this.splitWidths[i] = wSample * smoothTFork;
          }
          // Active fork body: full recorded width
          else {
            this.splitWidths[i] = wSample;
          }
        }
      }
    } else {
      // Legacy IK kinematic drag (if user toggles off fixedPathTrail)
      const substeps = (v > 0.45) ? 2 : 1;
      for (let step = 0; step < substeps; step++) {
        for (let i = 1; i < this.segments; i++) {
          const prevA = this.spine[i - 1];
          const currA = this.spine[i];
          this._tmpDir.subVectors(currA, prevA);
          const lenA = this._tmpDir.length();
          if (lenA > 0.0001) {
            this._tmpDir.multiplyScalar(segDist / lenA);
            currA.copy(prevA).add(this._tmpDir);
          } else {
            currA.copy(prevA);
          }

          const prevB = this.splitSpine[i - 1];
          const currB = this.splitSpine[i];
          this._tmpDir.subVectors(currB, prevB);
          const lenB = this._tmpDir.length();
          if (lenB > 0.0001) {
            this._tmpDir.multiplyScalar(segDist / lenB);
            currB.copy(prevB).add(this._tmpDir);
          } else {
            currB.copy(prevB);
          }
        }
      }

      const dStepA = this.headA.distanceTo(this._prevHeadAPos);
      this._prevHeadAPos.copy(this.headA);
      const shiftA = (segDist > 0.0001) ? (dStepA / segDist) : 0.0;
      this._advectWidths(this.widths, this._newWidths, headWidthA, shiftA);

      const dStepB = this.headB.distanceTo(this._prevHeadBPos);
      this._prevHeadBPos.copy(this.headB);
      const shiftB = (segDist > 0.0001) ? (dStepB / segDist) : 0.0;
      this._advectWidths(this.splitWidths, this._splitNewWidths, headWidthB, shiftB);

      if (this.splitState !== 'CLOSED') {
        this.splitSegmentsSinceStart += Math.round(shiftB);
      }
      if (this.splitState === 'DRAINING') {
        this.splitDrainSteps += shiftB;
        if (this.splitDrainSteps >= this.segments) {
          this.splitState = 'CLOSED';
          this.splitProgress = 0.0;
          this.splitCooldown = this.splitMinCooldown * (0.8 + Math.random() * 0.4);
        }
      }
    }

    // ── 5. Lateral Offsets ──
    // When fixedPathTrail is active, the spatial sinusoid is already baked into headA/headB and the history buffer.
    // Thus lateralOffsets is strictly 0.0, guaranteeing that already-drawn points never wobble or swim in time.
    if (!this.fixedPathTrail && this.waveAmp > 0.0001) {
      const waveSpeed = v * 11.0 + 0.6;
      this.wavePhase += waveSpeed * clampedDelta;
      const speedFactor = THREE.MathUtils.clamp(v / 0.35, 0.25, 1.15);
      for (let i = 0; i < this.segments; i++) {
        const s = i / (this.segments - 1);
        const amp = this.waveAmp * speedFactor * Math.sin(Math.pow(s, 0.85) * Math.PI * 0.5) * (1.0 - 0.22 * s);
        this._lateralOffsetsA[i] = amp * Math.sin(this.waveFreq * s * Math.PI * 2.0 - this.wavePhase);
        this._lateralOffsetsB[i] = amp * Math.sin(this.waveFreq * s * Math.PI * 2.0 - (this.wavePhase + 0.35));
      }
    } else {
      // 100% frozen: points stay stationary on the canvas (pre-zeroed typed arrays, 0 allocations)
      this._lateralOffsetsA.fill(0.0);
      this._lateralOffsetsB.fill(0.0);
    }

    // ── 6. Update Main Ribbon Mesh Vertices ──
    this._updateMeshGeometry(this.geometry, this.spine, this._lateralOffsetsA, this.widths, this._centerline);

    // ── 7. Update Split Branch Ribbon Mesh Vertices ──
    if (this.splitState !== 'CLOSED') {
      this.splitMesh.visible = true;
      this.splitMesh.count = this.mesh.count;

      // Smooth fade-in/out near fork opening/closing to eliminate color fighting/flickering
      let forkAlpha = 1.0;
      if (this.splitState === 'OPENING' || this.splitState === 'CLOSING') {
        const normS = THREE.MathUtils.clamp(this.splitProgress / 0.18, 0.0, 1.0);
        forkAlpha = normS * normS * (3.0 - 2.0 * normS);
      }
      this.splitMaterial.uniforms.uOpacity.value = 0.92 * forkAlpha;
      this._updateMeshGeometry(this.splitGeometry, this.splitSpine, this._lateralOffsetsB, this.splitWidths, this._splitCenterline);
    } else {
      this.splitMesh.visible = false;
    }
  }

  _updateMeshGeometry(geometry, spine, lateralOffsets, widthsBuffer, centerline) {
    const posAttr = geometry.attributes.position;
    const positions = posAttr.array;
    const segs = this.segments;

    // Pass 1: Compute continuous undulating centerline positions
    for (let i = 0; i < segs; i++) {
      const curr = spine[i];

      // Central difference tangent of spine
      if (i === 0) {
        this._tmpTangent.subVectors(spine[1], curr);
        if (this._tmpTangent.lengthSq() < 0.000001) {
          this._tmpTangent.set(-Math.cos(this.headingAngle), -Math.sin(this.headingAngle));
        } else {
          this._tmpTangent.normalize();
        }
      } else if (i === segs - 1) {
        this._tmpTangent.subVectors(curr, spine[i - 1]).normalize();
      } else {
        this._tmpTangent.subVectors(spine[i + 1], spine[i - 1]).normalize();
      }
      this._tmpNormal.set(-this._tmpTangent.y, this._tmpTangent.x);

      // Base centerline with lateral undulation offset
      const c = centerline[i];
      c.copy(curr).addScaledVector(this._tmpNormal, lateralOffsets[i]);
    }

    // Pass 2: Extrude ribbon vertices perpendicular to the undulating centerline
    for (let i = 0; i < segs; i++) {
      const s = i / (segs - 1);
      const c = centerline[i];

      // Tangent along undulating centerline
      if (i === 0) {
        this._tmpTangent.subVectors(centerline[1], c);
        if (this._tmpTangent.lengthSq() < 0.000001) {
          this._tmpTangent.set(-Math.cos(this.headingAngle), -Math.sin(this.headingAngle));
        } else {
          this._tmpTangent.normalize();
        }
      } else if (i === segs - 1) {
        this._tmpTangent.subVectors(c, centerline[i - 1]).normalize();
      } else {
        this._tmpTangent.subVectors(centerline[i + 1], centerline[i - 1]).normalize();
      }
      this._tmpNormal.set(-this._tmpTangent.y, this._tmpTangent.x);

      // Width of this specific vertebra as recorded when it was drawn
      const vertebraWidth = widthsBuffer[i];

      // 1. Smooth head taper (pointed brush tip / наконечник кисти)
      // Keeps the front leading end always thin and pointed like a fine calligraphy brush tip,
      // preventing a blunt edge from plowing forward.
      let headTaper = 1.0;
      if (this.headTaperLength > 0.001 && s < this.headTaperLength) {
        const t = s / this.headTaperLength; // 0.0 at tip -> 1.0 at full body
        const sinT = Math.sin(t * Math.PI * 0.5);
        const curve = Math.pow(sinT, 1.4);
        headTaper = this.headTipWidth + (1.0 - this.headTipWidth) * curve;
      }

      // 2. Smooth tail taper: graceful exit over the final 12% of the ribbon tail
      let tailTaper = 1.0;
      if (s > 0.88) {
        const t = (s - 0.88) / 0.12;
        tailTaper = Math.cos(t * Math.PI * 0.5); // 1.0 -> 0.0 smooth
      }

      const halfWidth = (vertebraWidth * 0.5) * headTaper * tailTaper;

      // Left / right vertices along true normal
      this._tmpLeft.copy(c).addScaledVector(this._tmpNormal,  halfWidth);
      this._tmpRight.copy(c).addScaledVector(this._tmpNormal, -halfWidth);

      // Write positions
      const vIdx = i * 2;
      positions[vIdx * 3 + 0] = this._tmpLeft.x;
      positions[vIdx * 3 + 1] = this._tmpLeft.y;
      positions[vIdx * 3 + 2] = 0.0;

      positions[(vIdx + 1) * 3 + 0] = this._tmpRight.x;
      positions[(vIdx + 1) * 3 + 1] = this._tmpRight.y;
      positions[(vIdx + 1) * 3 + 2] = 0.0;
    }

    posAttr.needsUpdate = true;
  }
}
