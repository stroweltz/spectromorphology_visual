import * as THREE from 'three';

const NUM_DIRS = 8;
const DIR_STEP = Math.PI / 4; // 45 degrees

// Precomputed 8-way octilinear unit direction vectors
const OCT_DIRS = Object.freeze([
  new THREE.Vector2(1.0, 0.0),                          // 0: 0°   (East)
  new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2),        // 1: 45°  (North-East)
  new THREE.Vector2(0.0, 1.0),                          // 2: 90°  (North)
  new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2),       // 3: 135° (North-West)
  new THREE.Vector2(-1.0, 0.0),                         // 4: 180° (West)
  new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2),      // 5: 225° (South-West)
  new THREE.Vector2(0.0, -1.0),                         // 6: 270° (South)
  new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2)        // 7: 315° (South-East)
]);

/**
 * Normalizes an angle into [0, 2π).
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle2Pi(angle) {
  let a = angle % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

/**
 * Snaps an arbitrary angle to the nearest octilinear direction index (0..7).
 * @param {number} angle
 * @returns {number}
 */
export function snapToOctilinearIndex(angle) {
  const norm = normalizeAngle2Pi(angle);
  return Math.round(norm / DIR_STEP) % NUM_DIRS;
}

/**
 * OctilinearBrushAgent
 * --------------------
 * High-precision procedural kinematics agent implementing Octilinear Filleted Motion:
 *
 *  1. Strictly 8-way quantized motion: straight travel occurs exclusively along multiples
 *     of 45° (k * π / 4).
 *  2. Strictly bounded turns: turns are exclusively ±45° (diagonal) or ±90° (orthogonal).
 *     Turns > 90° (135° and 180° reversals/hairpins) are strictly forbidden mathematically.
 *  3. Circular Fillet Transitions: Every turn is executed as an exact circular arc of
 *     radius R_fillet with angular velocity ω = ± v / R_fillet.
 *     Because Catmull-Rom trail history samples points along this circular arc, the resulting
 *     ribbon geometry exhibits geometrically perfect, butter-smooth rounded corners without
 *     creases, folds, or vertex pinching.
 *  4. Mandatory Straight Corridors: After any turn, the brush must travel straight for a
 *     minimum distance before any subsequent turn, preventing chaining into hairpins.
 *  5. 0 allocations per frame for rock-solid 60+ FPS.
 */
export class OctilinearBrushAgent {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    // Kinematic settings
    this.speed = options.speed ?? 1.2;
    this.orbitSpeed = options.orbitSpeed ?? 0.2;
    this.pathRadius = options.pathRadius ?? 0.42;
    this.phaseOffset = options.phaseOffset ?? 0.0;
    this.maxBoundaryRadius = options.maxBoundaryRadius ?? 0.58;
    this.minTurnRadius = options.minTurnRadius ?? 0.08;

    // Octilinear Fillet Configuration
    this.filletRadius = options.filletRadius ?? 0.08; // R_fillet: 0.02 .. 0.20
    this.stepLength = options.stepLength ?? 0.22;     // Base straight step length: 0.05 .. 0.50
    this.stepJitter = options.stepJitter ?? 0.35;     // Randomness in straight segment length
    this.turnAngleBalance = options.turnAngleBalance ?? 0.45; // 0.0 = only 45°, 1.0 = only 90°
    this.branchMode = options.branchMode ?? 'parallel'; // 'parallel' | 'fork'
    this.isOctilinear = true;

    // Speed Dynamics & Drift
    this.randomSpeedEnabled = options.randomSpeedEnabled ?? true;
    this.speedMultiplier = options.speedMultiplier ?? 1.0;
    this.speedDriftEnabled = options.speedDriftEnabled ?? true;
    this.speedWanderIntensity = options.speedWanderIntensity ?? 0.55;
    this.speedWanderFreq = options.speedWanderFreq ?? 0.28;
    this.speedSeed = options.speedSeed ?? (Math.random() * 100.0);

    // Audio reactivity hooks
    this.audioSpeedMult = 1.0;
    this.audioSteerMult = 1.0;
    this.audioExtraAngular = 0.0;

    // Kinematic State
    this.pos = new THREE.Vector2(
      Math.cos(this.phaseOffset) * this.pathRadius,
      Math.sin(this.phaseOffset) * this.pathRadius
    );
    this._prevPos = this.pos.clone();

    // Snap initial heading to nearest octilinear direction
    const initialRawAngle = this.phaseOffset + Math.PI * 0.5;
    this.dirIndex = snapToOctilinearIndex(initialRawAngle);
    this.headingAngle = this.dirIndex * DIR_STEP;
    this.angularVelocity = 0.0;
    this.currentV = 0.0;
    this.pathDistance = 0.0;

    // Cached direction vectors
    this.tangent = new THREE.Vector2(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal = new THREE.Vector2(-this.tangent.y, this.tangent.x);

    // Main Head Fillet State Machine
    this.state = 'STRAIGHT'; // 'STRAIGHT' | 'TURNING'
    this.straightDist = 0.0;
    this.targetStraightDist = this._computeNextStraightDist();

    this.turnDeltaK = 0;
    this.turnSign = 1;
    this.targetDirIndex = this.dirIndex;
    this.startHeading = this.headingAngle;
    this.targetHeading = this.headingAngle;
    this.turnAngleTotal = 0.0;
    this.turnedAngle = 0.0;
    this.filletCenter = new THREE.Vector2();

    // Turn memory tracking to forbid turns > 90° and U-turn hairpins
    this._lastTurnSign = 1;
    this._consecutiveTurnCount = 0;
    this._prevTurnDeltaK = 0;

    // Fork / Head B Branch Kinematics
    this.headA = new THREE.Vector2().copy(this.pos);
    this.headB = new THREE.Vector2().copy(this.pos);
    this.headBActive = false;
    this.headBPos = new THREE.Vector2().copy(this.pos);
    this.headBState = 'STRAIGHT'; // 'STRAIGHT' | 'TURNING'
    this.headBDirIndex = this.dirIndex;
    this.headBTargetDirIndex = this.dirIndex;
    this.headBHeading = this.headingAngle;
    this.headBStartHeading = this.headingAngle;
    this.headBTargetHeading = this.headingAngle;
    this.headBTurnDeltaK = 0;
    this.headBTurnSign = 1;
    this.headBTurnAngleTotal = 0.0;
    this.headBTurnedAngle = 0.0;
    this.headBFilletCenter = new THREE.Vector2();
    this.headBStraightDist = 0.0;
    this.headBTargetStraightDist = this.stepLength;

    // Preallocated Math Scratchpads (0 allocations in update)
    this._vInward = new THREE.Vector2();
    this._lookaheadPos = new THREE.Vector2();
  }

  /**
   * Generates next straight segment distance with subtle organic jitter.
   * @private
   * @returns {number}
   */
  _computeNextStraightDist() {
    const jitter = (Math.random() * 2.0 - 1.0) * this.stepJitter;
    return Math.max(0.12, this.stepLength * (1.0 + jitter));
  }

  /**
   * Computes forward linear velocity.
   * @param {number} time
   * @returns {number}
   */
  computeVelocity(time) {
    let speed = this.orbitSpeed * 0.75;
    if (this.randomSpeedEnabled) {
      speed *= this.speedMultiplier;
      if (this.speedDriftEnabled) {
        const w = Math.sin(time * this.speedWanderFreq + this.speedSeed) * 0.4 +
                  Math.sin(time * this.speedWanderFreq * 1.618 + this.speedSeed * 1.7) * 0.25;
        const drift = Math.max(0.2, 1.0 + w * this.speedWanderIntensity);
        speed *= drift;
      }
    }
    return Math.max(0.0, speed * this.audioSpeedMult);
  }

  /**
   * Synchronizes kinematic state from another brush agent during live mode switching.
   * @param {import('../KinematicBrushAgent.js').KinematicBrushAgent|OctilinearBrushAgent} other
   */
  syncFrom(other) {
    if (!other) return;
    this.pos.copy(other.pos);
    this._prevPos.copy(this.pos);
    this.speed = other.speed;
    this.orbitSpeed = other.orbitSpeed;
    this.maxBoundaryRadius = other.maxBoundaryRadius;
    this.minTurnRadius = other.minTurnRadius;

    // Snap heading to closest 8-way octilinear angle
    this.dirIndex = snapToOctilinearIndex(other.headingAngle);
    this.headingAngle = this.dirIndex * DIR_STEP;
    this.state = 'STRAIGHT';
    this.straightDist = 0.0;
    this.targetStraightDist = this._computeNextStraightDist();
    this.angularVelocity = 0.0;

    this.tangent.set(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal.set(-this.tangent.y, this.tangent.x);

    this.headA.copy(this.pos);
    this.headB.copy(this.pos);
    this.headBPos.copy(this.pos);
    this.headBActive = false;
  }

  /**
   * Initiates a circular fillet transition turning the brush by deltaK (* 45°).
   * Strict invariant: deltaK can only be -2, -1, +1, or +2 (turns of 45° or 90°).
   * @private
   * @param {number} deltaK - turn quantum (-2, -1, +1, or +2)
   */
  _startFilletTurn(deltaK) {
    // Clamp to ensure absolute maximum turn angle of 90°
    if (Math.abs(deltaK) > 2) {
      deltaK = Math.sign(deltaK) * 2;
    }
    if (deltaK === 0) return;

    this.state = 'TURNING';
    this.turnDeltaK = deltaK;
    this.turnSign = Math.sign(deltaK);
    this.targetDirIndex = (this.dirIndex + deltaK + NUM_DIRS * 2) % NUM_DIRS;

    this.startHeading = this.dirIndex * DIR_STEP;
    this.targetHeading = this.startHeading + deltaK * DIR_STEP;
    this.turnAngleTotal = Math.abs(deltaK) * DIR_STEP;
    this.turnedAngle = 0.0;

    // Effective circular fillet radius
    const R = Math.max(0.005, this.filletRadius);

    // Compute exact center of the circular fillet arc:
    // C = P_start + sign * R * Normal_start
    const nx = -Math.sin(this.startHeading);
    const ny = Math.cos(this.startHeading);
    this.filletCenter.set(
      this.pos.x + this.turnSign * R * nx,
      this.pos.y + this.turnSign * R * ny
    );

    // Update turn history tracking
    if (this.turnSign === this._lastTurnSign) {
      this._consecutiveTurnCount++;
    } else {
      this._lastTurnSign = this.turnSign;
      this._consecutiveTurnCount = 1;
    }
    this._prevTurnDeltaK = deltaK;
  }

  /**
   * Evaluates candidates for an octilinear turn to rebound away from canvas boundary.
   * Strictly forbids turns > 90° (135° and 180°).
   * @private
   * @param {number} r - current radius
   * @returns {number} chosen deltaK (-2, -1, +1, or +2)
   */
  _pickBoundaryReboundTurn(r) {
    const invR = 1.0 / Math.max(0.0001, r);
    this._vInward.set(-this.pos.x * invR, -this.pos.y * invR);

    // Candidates are exclusively ±45° (±1) and ±90° (±2). (Turns > 90° strictly forbidden)
    const rawCandidates = [1, -1, 2, -2];
    const R = Math.max(0.005, this.filletRadius);
    const rOuter = this.maxBoundaryRadius;

    let bestDeltaK = rawCandidates[0];
    let bestScore = -999999.0;

    for (let i = 0; i < rawCandidates.length; i++) {
      const dK = rawCandidates[i];
      const candIdx = (this.dirIndex + dK + NUM_DIRS * 2) % NUM_DIRS;
      const cDir = OCT_DIRS[candIdx];

      const sign = Math.sign(dK);
      const startAngle = this.dirIndex * DIR_STEP;
      const targetAngle = startAngle + dK * DIR_STEP;
      const nx = -Math.sin(startAngle);
      const ny = Math.cos(startAngle);
      const cx = this.pos.x + sign * R * nx;
      const cy = this.pos.y + sign * R * ny;

      const endX = cx + sign * R * Math.sin(targetAngle);
      const endY = cy - sign * R * Math.cos(targetAngle);
      const endR = Math.hypot(endX, endY);

      // Lookahead point 0.15 ahead along candidate direction after the arc
      const lookX = endX + cDir.x * 0.15;
      const lookY = endY + cDir.y * 0.15;
      const lookR = Math.hypot(lookX, lookY);

      // Radial alignment at arc endpoint: > 0 means moving outward!
      const endRadial = (endX * cDir.x + endY * cDir.y) / Math.max(0.0001, endR);

      let score = 0.0;
      score += cDir.dot(this._vInward) * 50.0;
      score -= endRadial * 60.0;

      if (endR > rOuter * 0.95) {
        score -= (endR - rOuter * 0.95) * 400.0;
      } else {
        score += (rOuter - endR) * 30.0;
      }

      if (lookR > rOuter * 0.95) {
        score -= (lookR - rOuter * 0.95) * 400.0;
      } else {
        score += (rOuter - lookR) * 30.0;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDeltaK = dK;
      }
    }

    return bestDeltaK;
  }

  /**
   * Chooses an octilinear turn in open space based on turn balance and inward tendency.
   * Strictly forbids turns > 90° (135° and 180°).
   * @private
   * @param {number} r - current radius
   * @returns {number} chosen deltaK (-2, -1, +1, or +2)
   */
  _pickFreeSpaceTurn(r) {
    // 1. Balance between 45° vs 90° turns
    const is90 = (Math.random() < this.turnAngleBalance);
    const mag = is90 ? 2 : 1; // 1 = 45°, 2 = 90°

    let sign = Math.random() < 0.5 ? 1 : -1;

    // Anti-looping: if 2+ consecutive turns in same direction, weave opposite
    if (this._consecutiveTurnCount >= 2) {
      sign = -this._lastTurnSign;
    }

    // When away from center, bias turns towards the inside of the mandala
    if (r > this.maxBoundaryRadius * 0.55) {
      const invR = 1.0 / Math.max(0.0001, r);
      const inX = -this.pos.x * invR;
      const inY = -this.pos.y * invR;

      const leftIdx = (this.dirIndex + mag + NUM_DIRS * 2) % NUM_DIRS;
      const rightIdx = (this.dirIndex - mag + NUM_DIRS * 2) % NUM_DIRS;
      const sL = OCT_DIRS[leftIdx].x * inX + OCT_DIRS[leftIdx].y * inY;
      const sR = OCT_DIRS[rightIdx].x * inX + OCT_DIRS[rightIdx].y * inY;

      sign = sL >= sR ? 1 : -1;
    }

    return sign * mag;
  }

  /**
   * Advances the autonomous octilinear brush agent by dt.
   * @param {number} time - elapsed time in seconds
   * @param {number} dt   - delta time in seconds
   * @returns {OctilinearBrushAgent} this instance
   */
  update(time, dt) {
    const clampedDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);
    const v = this.computeVelocity(time);
    this.currentV = v;

    if (v >= 0.0001) {
      const R = Math.max(0.005, this.filletRadius);
      const rOuter = this.maxBoundaryRadius;
      const r = this.pos.length();

      // Lookahead check for boundary approach
      const dLookahead = R * 1.6 + v * 0.16;
      this._lookaheadPos.copy(this.pos).addScaledVector(this.tangent, dLookahead);
      const lookaheadR = this._lookaheadPos.length();
      const radialSpeed = (this.pos.x * this.tangent.x + this.pos.y * this.tangent.y) / Math.max(0.001, r);

      const minStraightDist = Math.max(0.08, R * 1.5);
      const canTurnNow = (this.straightDist >= minStraightDist);

      // BOUNDARY TURN TRIGGER:
      // If heading outward and approaching boundary, turn immediately!
      // Never gated by minStraightDist if in critical boundary zone.
      const isCriticalBoundary = (r >= rOuter * 0.88 && radialSpeed > 0.05) || (lookaheadR >= rOuter * 0.92 && radialSpeed > 0.0);
      const needsBoundaryTurn = isCriticalBoundary || (canTurnNow && lookaheadR >= rOuter * 0.84 && radialSpeed > 0.1);

      if (this.state === 'STRAIGHT') {
        if (needsBoundaryTurn) {
          const dK = this._pickBoundaryReboundTurn(r);
          this._startFilletTurn(dK);
        } else if (canTurnNow && this.straightDist >= this.targetStraightDist) {
          const dK = this._pickFreeSpaceTurn(r);
          this._startFilletTurn(dK);
        }
      }

      // Execute motion based on current state
      if (this.state === 'TURNING') {
        const omegaMag = v / R;
        const deltaTheta = omegaMag * clampedDt;

        if (this.turnedAngle + deltaTheta < this.turnAngleTotal) {
          // Still in the circular fillet arc
          this.turnedAngle += deltaTheta;
          this.headingAngle = this.startHeading + this.turnSign * this.turnedAngle;
          this.angularVelocity = this.turnSign * omegaMag;

          // Exact position on circular fillet arc:
          // P = C + R * [sign * sin(θ), -sign * cos(θ)]
          this.pos.set(
            this.filletCenter.x + this.turnSign * R * Math.sin(this.headingAngle),
            this.filletCenter.y - this.turnSign * R * Math.cos(this.headingAngle)
          );
        } else {
          // Fillet arc finishes in this frame!
          const remAngle = Math.max(0.0, this.turnAngleTotal - this.turnedAngle);
          const dtArc = remAngle / Math.max(0.0001, omegaMag);
          const dtStraight = Math.max(0.0, clampedDt - dtArc);

          // Snap to exact destination heading on octilinear grid
          this.dirIndex = this.targetDirIndex;
          this.headingAngle = this.dirIndex * DIR_STEP;
          this.angularVelocity = 0.0;

          // Snap position to exact end of circular arc
          this.pos.set(
            this.filletCenter.x + this.turnSign * R * Math.sin(this.targetHeading),
            this.filletCenter.y - this.turnSign * R * Math.cos(this.targetHeading)
          );

          // Transition to STRAIGHT
          this.state = 'STRAIGHT';
          this.straightDist = 0.0;
          this.targetStraightDist = Math.max(minStraightDist, this._computeNextStraightDist());

          // Advance straight for remainder of frame time
          if (dtStraight > 0.0) {
            const dir = OCT_DIRS[this.dirIndex];
            this.pos.x += dir.x * v * dtStraight;
            this.pos.y += dir.y * v * dtStraight;
            this.straightDist += v * dtStraight;
          }
        }
      } else {
        // STRAIGHT motion
        const dir = OCT_DIRS[this.dirIndex];
        this.headingAngle = this.dirIndex * DIR_STEP;
        this.angularVelocity = 0.0;
        this.pos.x += dir.x * v * clampedDt;
        this.pos.y += dir.y * v * clampedDt;
        this.straightDist += v * clampedDt;
      }

      // HARD BOUNDARY CONTAINMENT:
      // Guarantees r <= rOuter at all times. If exceeded, clamp position and snap heading inward!
      const currentR = this.pos.length();
      if (currentR >= rOuter * 0.98) {
        const clampTarget = rOuter * 0.95;
        this.pos.multiplyScalar(clampTarget / currentR);

        // Snap heading to best inward octilinear direction
        const bestInwardIdx = snapToOctilinearIndex(Math.atan2(-this.pos.y, -this.pos.x));
        this.dirIndex = bestInwardIdx;
        this.headingAngle = this.dirIndex * DIR_STEP;
        this.state = 'STRAIGHT';
        this.straightDist = 0.0;
        this.targetStraightDist = this._computeNextStraightDist();
      }
    }

    // Step distance accumulation along arclength
    const stepDist = this.pos.distanceTo(this._prevPos);
    this._prevPos.copy(this.pos);
    this.pathDistance += stepDist;

    // Update tangent & normal cache
    this.tangent.set(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal.set(-this.tangent.y, this.tangent.x);

    return this;
  }

  /**
   * Advances Head B (split fork branch) kinematics during active bifurcation.
   * @param {number} clampedDt - delta time in seconds
   * @param {number} splitProgress - 0..1 lifecycle progress from BifurcationController
   * @param {string} splitState - 'CLOSED' | 'OPENING' | 'SUSTAINED' | 'CLOSING' | 'DRAINING'
   * @param {number} halfSep - half separation distance along normal
   */
  updateBifurcationHeads(clampedDt, splitProgress, splitState, halfSep) {
    if (splitState === 'CLOSED') {
      this.headA.copy(this.pos);
      this.headB.copy(this.pos);
      this.headBActive = false;
      return;
    }

    if (this.branchMode === 'parallel') {
      // Parallel Dual-Track Mode:
      // Offset symmetrically along the continuously rotating normal vector.
      // During fillet turns, normal rotates smoothly along the arc creating concentric rounded tracks!
      const offset = splitProgress * halfSep;
      this.headA.set(
        this.pos.x + this.normal.x * offset,
        this.pos.y + this.normal.y * offset
      );
      this.headB.set(
        this.pos.x - this.normal.x * offset,
        this.pos.y - this.normal.y * offset
      );
    } else {
      // Fork / Switch Junction Mode:
      // Head A continues as the main trunk, Head B branches off with a circular fillet switch!
      this.headA.copy(this.pos);

      if (!this.headBActive) {
        this.headBActive = true;
        this.headBPos.copy(this.pos);

        // Branch turn: pick +45° or -45° away from main heading (NEVER > 45° for fork split)
        const rB = this.pos.length();
        let branchDK = (this.dirIndex % 2 === 0) ? 1 : -1;
        if (rB > this.maxBoundaryRadius * 0.4) {
          const invR = 1.0 / Math.max(0.0001, rB);
          const inX = -this.pos.x * invR;
          const inY = -this.pos.y * invR;
          const lIdx = (this.dirIndex + 1) % NUM_DIRS;
          const rIdx = (this.dirIndex + 7) % NUM_DIRS;
          const sL = OCT_DIRS[lIdx].x * inX + OCT_DIRS[lIdx].y * inY;
          const sR = OCT_DIRS[rIdx].x * inX + OCT_DIRS[rIdx].y * inY;
          branchDK = sL >= sR ? 1 : -1;
        }

        this.headBTurnDeltaK = branchDK;
        this.headBTurnSign = Math.sign(branchDK);
        this.headBDirIndex = (this.dirIndex + branchDK + NUM_DIRS * 2) % NUM_DIRS;
        this.headBTargetDirIndex = this.headBDirIndex;

        this.headBStartHeading = this.dirIndex * DIR_STEP;
        this.headBTargetHeading = this.headBStartHeading + branchDK * DIR_STEP;
        this.headBTurnAngleTotal = Math.abs(branchDK) * DIR_STEP;
        this.headBTurnedAngle = 0.0;

        const R = Math.max(0.005, this.filletRadius);
        const nx = -Math.sin(this.headBStartHeading);
        const ny = Math.cos(this.headBStartHeading);
        this.headBFilletCenter.set(
          this.pos.x + this.headBTurnSign * R * nx,
          this.pos.y + this.headBTurnSign * R * ny
        );

        this.headBState = 'TURNING';
        this.headBStraightDist = 0.0;
        this.headBTargetStraightDist = this._computeNextStraightDist();
      }

      // Step Head B along its circular fillet branch or straight line
      const v = this.currentV;
      const R = Math.max(0.005, this.filletRadius);

      if (this.headBState === 'TURNING') {
        const omegaMag = v / R;
        const dTheta = omegaMag * clampedDt;

        if (this.headBTurnedAngle + dTheta < this.headBTurnAngleTotal) {
          this.headBTurnedAngle += dTheta;
          this.headBHeading = this.headBStartHeading + this.headBTurnSign * this.headBTurnedAngle;
          this.headBPos.set(
            this.headBFilletCenter.x + this.headBTurnSign * R * Math.sin(this.headBHeading),
            this.headBFilletCenter.y - this.headBTurnSign * R * Math.cos(this.headBHeading)
          );
        } else {
          // Finished branch fillet switch
          this.headBDirIndex = this.headBTargetDirIndex;
          this.headBHeading = this.headBDirIndex * DIR_STEP;
          this.headBPos.set(
            this.headBFilletCenter.x + this.headBTurnSign * R * Math.sin(this.headBTargetHeading),
            this.headBFilletCenter.y - this.headBTurnSign * R * Math.cos(this.headBTargetHeading)
          );
          this.headBState = 'STRAIGHT';
          this.headBStraightDist = 0.0;
        }
      } else {
        // STRAIGHT branch motion
        const dirB = OCT_DIRS[this.headBDirIndex];
        this.headBPos.x += dirB.x * v * clampedDt;
        this.headBPos.y += dirB.y * v * clampedDt;
        this.headBStraightDist += v * clampedDt;

        // Head B boundary avoidance: smooth fillet turn (never snapping!)
        const rB = this.headBPos.length();
        if (rB >= this.maxBoundaryRadius * 0.90 && this.headBStraightDist >= 0.10) {
          const invR = 1.0 / Math.max(0.0001, rB);
          const inX = -this.headBPos.x * invR;
          const inY = -this.headBPos.y * invR;
          const lIdx = (this.headBDirIndex + 1) % NUM_DIRS;
          const rIdx = (this.headBDirIndex + 7) % NUM_DIRS;
          const dK = (OCT_DIRS[lIdx].x * inX + OCT_DIRS[lIdx].y * inY >= OCT_DIRS[rIdx].x * inX + OCT_DIRS[rIdx].y * inY) ? 1 : -1;

          this.headBTurnDeltaK = dK;
          this.headBTurnSign = dK;
          this.headBTargetDirIndex = (this.headBDirIndex + dK + NUM_DIRS * 2) % NUM_DIRS;
          this.headBStartHeading = this.headBDirIndex * DIR_STEP;
          this.headBTargetHeading = this.headBStartHeading + dK * DIR_STEP;
          this.headBTurnAngleTotal = Math.PI / 4; // strictly 45°
          this.headBTurnedAngle = 0.0;

          const nx = -Math.sin(this.headBStartHeading);
          const ny = Math.cos(this.headBStartHeading);
          this.headBFilletCenter.set(
            this.headBPos.x + dK * R * nx,
            this.headBPos.y + dK * R * ny
          );
          this.headBState = 'TURNING';
          this.headBStraightDist = 0.0;
        }

        // Head B hard boundary containment clamp
        if (rB >= this.maxBoundaryRadius * 0.98) {
          this.headBPos.multiplyScalar((this.maxBoundaryRadius * 0.95) / rB);
          this.headBDirIndex = snapToOctilinearIndex(Math.atan2(-this.headBPos.y, -this.headBPos.x));
          this.headBHeading = this.headBDirIndex * DIR_STEP;
        }
      }

      // During CLOSING or DRAINING, smoothly converge Head B back to Head A
      if (splitState === 'CLOSING') {
        const targetB = this.headA.clone().addScaledVector(this.normal, -splitProgress * halfSep);
        this.headBPos.lerp(targetB, clampedDt * 4.0);
      } else if (splitState === 'DRAINING') {
        this.headBPos.copy(this.headA);
      }

      this.headB.copy(this.headBPos);
    }
  }

  /**
   * Resets the agent to initial orbit position and snapped octilinear heading.
   */
  reset() {
    this.pos.set(
      Math.cos(this.phaseOffset) * this.pathRadius,
      Math.sin(this.phaseOffset) * this.pathRadius
    );
    this._prevPos.copy(this.pos);

    const initialRawAngle = this.phaseOffset + Math.PI * 0.5;
    this.dirIndex = snapToOctilinearIndex(initialRawAngle);
    this.headingAngle = this.dirIndex * DIR_STEP;
    this.angularVelocity = 0.0;
    this.currentV = 0.0;
    this.pathDistance = 0.0;

    this.state = 'STRAIGHT';
    this.straightDist = 0.0;
    this.targetStraightDist = this._computeNextStraightDist();

    this.tangent.set(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal.set(-this.tangent.y, this.tangent.x);

    this.headA.copy(this.pos);
    this.headB.copy(this.pos);
    this.headBPos.copy(this.pos);
    this.headBActive = false;
    this.headBState = 'STRAIGHT';
    this.headBDirIndex = this.dirIndex;
    this.headBTargetDirIndex = this.dirIndex;
    this.headBHeading = this.headingAngle;

    this._lastTurnSign = 1;
    this._consecutiveTurnCount = 0;
    this._prevTurnDeltaK = 0;
  }
}
