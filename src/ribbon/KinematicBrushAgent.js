import * as THREE from 'three';

/**
 * KinematicBrushAgent
 * -------------------
 * Represents an autonomous, self-steering brush head moving across the canvas.
 *
 * Kinematic model:
 *  - Linear velocity v: computed from orbitSpeed, individual speed multipliers,
 *    multi-harmonic speed wandering, and audio speed modulation.
 *  - Angular velocity ω: driven by multi-harmonic wandering and a soft centripetal
 *    restoring force keeping the brush within the mandala perimeter.
 *  - Curvature constraint: strictly enforces |ω| ≤ v / R_min, guaranteeing that
 *    the turning radius R = v / |ω| is always ≥ minTurnRadius.
 *  - Angular inertia: smooth acceleration into turns, eliminating sharp snaps.
 *  - Arclength distance: accumulates true path length for spatial sinusoid synthesis.
 */
export class KinematicBrushAgent {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.speed = options.speed ?? 1.2;
    this.orbitSpeed = options.orbitSpeed ?? 0.2;
    this.pathRadius = options.pathRadius ?? 0.42;
    this.phaseOffset = options.phaseOffset ?? 0.0;
    this.maxBoundaryRadius = options.maxBoundaryRadius ?? 0.58;
    this.minTurnRadius = options.minTurnRadius ?? 0.08;

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
    this.headingAngle = this.phaseOffset + Math.PI * 0.5;
    this.angularVelocity = 0.0;
    this.currentV = 0.0;
    this.pathDistance = 0.0;

    // Direction vectors (cached)
    this.tangent = new THREE.Vector2(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal = new THREE.Vector2(-this.tangent.y, this.tangent.x);
  }

  /**
   * Computes forward velocity considering master orbitSpeed, individual speed multipliers,
   * organic wandering drift, and external audio modulation.
   * @param {number} time - elapsed time in seconds
   * @returns {number} forward velocity
   */
  computeVelocity(time) {
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
   * Advances the autonomous brush head forward by dt.
   * @param {number} time - elapsed time in seconds
   * @param {number} dt   - delta time in seconds
   * @returns {KinematicBrushAgent} this instance
   */
  update(time, dt) {
    const clampedDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);
    const v = this.computeVelocity(time);
    this.currentV = v;

    if (v >= 0.0001) {
      // 1. Multi-harmonic organic wandering (irrational frequencies prevent periodic loops)
      const phi = this.phaseOffset;
      const wander =
        Math.sin(time * 0.85 + phi) * 1.5 +
        Math.sin(time * 1.93 + phi * 1.618) * 0.9 +
        Math.sin(time * 0.37 + phi * 2.718) * 0.7;

      // 2. Gentle centripetal boundary steering
      const r = this.pos.length();
      const rOuter = this.maxBoundaryRadius;
      const rSoft = rOuter * 0.75;
      let boundarySteer = 0.0;

      if (r > 0.001) {
        const invR = 1.0 / r;
        const rx = this.pos.x * invR;
        const ry = this.pos.y * invR;

        const hx = Math.cos(this.headingAngle);
        const hy = Math.sin(this.headingAngle);

        // Radial velocity: > 0 moving outward, <= 0 moving inward
        const vOut = hx * rx + hy * ry;

        // 2D cross product (radial x heading)
        const cross = rx * hy - ry * hx;
        const turnDir = cross >= 0 ? 1.0 : -1.0;

        if (r > rSoft) {
          const excess = (r - rSoft) / Math.max(0.01, rOuter - rSoft);
          if (vOut > 0.0) {
            const urgency = 0.6 + excess * 1.5;
            boundarySteer = turnDir * urgency * Math.max(0.2, vOut);
          } else if (r > rOuter) {
            const mildUrgency = Math.min(1.0, (r - rOuter) * 1.5);
            boundarySteer = turnDir * mildUrgency * 0.4;
          }
        }
      }

      // Combine wander and boundary return
      const wanderWeight = r > rOuter ? THREE.MathUtils.clamp(1.0 - (r - rOuter) * 0.8, 0.45, 1.0) : 1.0;
      let desiredOmega =
        wander * wanderWeight * this.audioSteerMult +
        boundarySteer +
        this.audioExtraAngular;

      // 3. Strict curvature constraint |ω| ≤ v / R_min
      if (this.minTurnRadius > 0.001) {
        const maxOmega = v / this.minTurnRadius;
        desiredOmega = THREE.MathUtils.clamp(desiredOmega, -maxOmega, maxOmega);
      }

      // 4. Angular inertia (smooth acceleration into turns)
      const steerInertiaRate = 9.0;
      this.angularVelocity += (desiredOmega - this.angularVelocity) * Math.min(1.0, clampedDt * steerInertiaRate);

      // Re-verify physical clamp after inertia
      if (this.minTurnRadius > 0.001) {
        const maxOmega = v / this.minTurnRadius;
        this.angularVelocity = THREE.MathUtils.clamp(this.angularVelocity, -maxOmega, maxOmega);
      }

      // 5. Integrate heading angle and step position
      this.headingAngle += this.angularVelocity * clampedDt;
      this.pos.x += Math.cos(this.headingAngle) * v * clampedDt;
      this.pos.y += Math.sin(this.headingAngle) * v * clampedDt;

      // Outer elastic tether for extreme excursions
      if (r > 1.25) {
        const elasticPull = Math.min(1.0, (r - 1.25) * 1.5);
        this.pos.lerp(new THREE.Vector2(0, 0), elasticPull * clampedDt * 2.0);
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
   * Resets the agent to initial orbit position and tangent heading.
   */
  reset() {
    this.pos.set(
      Math.cos(this.phaseOffset) * this.pathRadius,
      Math.sin(this.phaseOffset) * this.pathRadius
    );
    this._prevPos.copy(this.pos);
    this.headingAngle = this.phaseOffset + Math.PI * 0.5;
    this.angularVelocity = 0.0;
    this.currentV = 0.0;
    this.pathDistance = 0.0;
    this.tangent.set(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    this.normal.set(-this.tangent.y, this.tangent.x);
  }
}
