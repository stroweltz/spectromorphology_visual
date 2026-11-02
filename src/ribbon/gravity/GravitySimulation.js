import * as THREE from 'three';

/**
 * GravitySimulation
 * -----------------
 * Modular, zero-allocation N-body orbital physics engine for procedural Three.js ribbons.
 * Simulates 4, 5, or 6 gravitational bodies moving under:
 *   1. Plummer-softened central attractor at the origin (F_center = -GM * r / (r^2 + eps^2)^(3/2)).
 *   2. Soft core repulsion preventing collapse onto the central singularity.
 *   3. Mutual N-body Plummer-softened pairwise gravitation.
 *   4. Soft boundary localization (non-linear centripetal restoring bowl keeping bodies in the mandala).
 *   5. Adaptive orbital energy regulation (Keplerian target speed stabilization).
 *   6. Dynamic Association & Dissociation mechanics:
 *      - Association: capture into a mutual binary orbit dance around common barycenter.
 *      - Harmonic resonance pulse modulating brush ribbon thickness.
 *      - Dissociation: slingshot boost ejection into high-eccentricity loops upon periastron passage.
 *   7. Tidal Bifurcation (Roche / periastron splitting):
 *      - Triggers twin-head ribbon separation during close encounters / periastron passages.
 *
 * Performance guarantee: 0 allocations in the update loop (all typed arrays and scratchpads preallocated).
 */

export const MAX_GRAVITY_BODIES = 6;

export class GravitySimulation {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.maxBodies = MAX_GRAVITY_BODIES;
    this.bodyCount = Math.min(MAX_GRAVITY_BODIES, Math.max(4, options.bodyCount || 5));

    // Simulation Parameters
    this.G = options.G ?? 1.25;                         // Gravitational constant
    this.centralMass = options.centralMass ?? 3.2;       // Central attractor mass M
    this.softening = options.softening ?? 0.09;         // Plummer softening eps
    this.softeningSq = this.softening * this.softening;
    this.coreRadius = 0.06;                             // Minimum core radius (prevents singularity collapse)
    this.coreStiffness = 35.0;

    this.nBodyG = options.nBodyG ?? 0.45;               // Mutual N-body coupling strength
    this.nBodySoftening = options.nBodySoftening ?? 0.08;
    this.nBodySofteningSq = this.nBodySoftening * this.nBodySoftening;

    this.boundaryRadius = options.boundaryRadius ?? 0.62; // Mandala perimeter
    this.boundaryStiffness = options.boundaryStiffness ?? 24.0;
    this.boundaryDamping = 8.0;

    this.timeScale = options.timeScale ?? 1.0;
    this.energyBalance = options.energyBalance ?? 0.35; // Adaptive Keplerian injection/drag
    this.damping = options.damping ?? 0.015;

    // Association & Dissociation parameters
    this.assocDistance = options.assocDistance ?? 0.16; // R_assoc critical distance
    this.slingshotPower = options.slingshotPower ?? 2.0; // Boost upon dissociation
    this.binaryOrbitTorque = 1.4;                       // Mutual spin torque during pairing
    this.maxAssocTime = 2.0;                            // Max binary dance duration before slingshot
    this.tidalBifurcationEnabled = options.tidalBifurcation ?? true;

    // ── Preallocated Typed Arrays (Zero Allocations Per Frame) ──
    this.pos = new Float32Array(MAX_GRAVITY_BODIES * 2);           // [x0, y0, x1, y1, ...]
    this.vel = new Float32Array(MAX_GRAVITY_BODIES * 2);           // [vx0, vy0, ...]
    this.acc = new Float32Array(MAX_GRAVITY_BODIES * 2);           // [ax0, ay0, ...]
    this.mass = new Float32Array(MAX_GRAVITY_BODIES);              // [m0, m1, ...]
    this.speed = new Float32Array(MAX_GRAVITY_BODIES);             // linear speed |v|
    this.heading = new Float32Array(MAX_GRAVITY_BODIES);           // heading angle theta
    this.angularVel = new Float32Array(MAX_GRAVITY_BODIES);        // omega
    this.pathDistance = new Float32Array(MAX_GRAVITY_BODIES);      // integrated arc length
    this.resonance = new Float32Array(MAX_GRAVITY_BODIES);         // 0.0..1.0 resonance thickness pulse
    this.tidalSplit = new Uint8Array(MAX_GRAVITY_BODIES);          // 1 if tidally bifurcated

    // Pair State Matrices (flattened 6x6)
    const pairCount = MAX_GRAVITY_BODIES * MAX_GRAVITY_BODIES;
    this.pairActive = new Uint8Array(pairCount);
    this.pairAssocTime = new Float32Array(pairCount);
    this.pairCooldown = new Float32Array(pairCount);
    this.pairPrevDist = new Float32Array(pairCount);

    // Scratchpad variables for inner loops (0 GC)
    this._dx = 0;
    this._dy = 0;
    this._dist = 0;
    this._distSq = 0;

    // Initialize mass distribution and initial orbital states
    this.initDefaultMasses();
    this.resetAllOrbits();
  }

  /**
   * Sets up individual body masses with subtle organic variations.
   */
  initDefaultMasses() {
    // Masses vary subtly around 1.0 to break perfect artificial symmetry
    const baseMasses = [1.05, 0.95, 1.10, 0.90, 1.02, 0.98];
    for (let i = 0; i < MAX_GRAVITY_BODIES; i++) {
      this.mass[i] = baseMasses[i] || 1.0;
    }
  }

  /**
   * Configures active body count (4, 5, or 6).
   * @param {number} count
   */
  setBodyCount(count) {
    const prev = this.bodyCount;
    this.bodyCount = Math.min(MAX_GRAVITY_BODIES, Math.max(4, parseInt(count, 10) || 5));
    if (this.bodyCount !== prev) {
      this.resetAllOrbits();
    }
  }

  /**
   * Resets all bodies to balanced, majestic elliptical Keplerian orbits.
   */
  resetAllOrbits() {
    const N = this.bodyCount;
    const epsSq = this.softening * this.softening;

    for (let i = 0; i < MAX_GRAVITY_BODIES; i++) {
      this.acc[i * 2 + 0] = 0;
      this.acc[i * 2 + 1] = 0;
      this.pathDistance[i] = 0;
      this.resonance[i] = 0;
      this.tidalSplit[i] = 0;

      if (i < N) {
        // Multi-tier orbital radii: distributing bodies between inner, mid, and outer shells
        const tier = i % 3;
        const baseRadius = 0.28 + tier * 0.12 + (i / N) * 0.06;
        const angle = (i / N) * Math.PI * 2 + (tier * 0.4);

        const x = Math.cos(angle) * baseRadius;
        const y = Math.sin(angle) * baseRadius;
        this.pos[i * 2 + 0] = x;
        this.pos[i * 2 + 1] = y;

        // Circular velocity v_circ = sqrt(G * M * r^2 / (r^2 + eps^2)^(3/2))
        const rSq = x * x + y * y;
        const r = Math.sqrt(rSq);
        const denom = Math.pow(rSq + epsSq, 1.5);
        const vCirc = Math.sqrt(Math.max(0.01, (this.G * this.centralMass * rSq) / denom));

        // Choreographed prograde vs eccentric velocities
        // Body 0, 1, 2 co-rotate; one body (e.g., body 3 or last body) has high eccentricity for slingshots
        let e = 0.25;
        let dir = 1.0;
        if (i === 3 && N >= 5) {
          // Counter-rotating body creates dramatic high-speed close encounters
          dir = -0.92;
          e = 0.35;
        } else if (i % 2 === 1) {
          e = 0.38;
        }

        const vx = -Math.sin(angle) * vCirc * (1.0 + e) * dir;
        const vy =  Math.cos(angle) * vCirc * (1.0 - e * 0.5) * dir;

        this.vel[i * 2 + 0] = vx;
        this.vel[i * 2 + 1] = vy;
        this.speed[i] = Math.sqrt(vx * vx + vy * vy);
        this.heading[i] = Math.atan2(vy, vx);
        this.angularVel[i] = 0.0;
      } else {
        // Inactive bodies parked safely at origin
        this.pos[i * 2 + 0] = 0;
        this.pos[i * 2 + 1] = 0;
        this.vel[i * 2 + 0] = 0;
        this.vel[i * 2 + 1] = 0;
        this.speed[i] = 0;
        this.heading[i] = 0;
        this.angularVel[i] = 0;
      }
    }

    // Reset pair matrices
    this.pairActive.fill(0);
    this.pairAssocTime.fill(0);
    this.pairCooldown.fill(0);
    this.pairPrevDist.fill(999.0);
  }

  /**
   * Resets single body if perturbed.
   * @param {number} i
   */
  resetBody(i) {
    if (i < 0 || i >= this.bodyCount) return;
    const N = this.bodyCount;
    const tier = i % 3;
    const baseRadius = 0.28 + tier * 0.12;
    const angle = (i / N) * Math.PI * 2;
    this.pos[i * 2 + 0] = Math.cos(angle) * baseRadius;
    this.pos[i * 2 + 1] = Math.sin(angle) * baseRadius;
    this.vel[i * 2 + 0] = -Math.sin(angle) * 0.8;
    this.vel[i * 2 + 1] =  Math.cos(angle) * 0.8;
    this.speed[i] = 0.8;
    this.heading[i] = Math.atan2(this.vel[i * 2 + 1], this.vel[i * 2 + 0]);
  }

  /**
   * Main simulation step.
   * Uses Symplectic Euler integration for long-term orbital energy conservation.
   * @param {number} time - elapsed real time in seconds
   * @param {number} dt - delta time in seconds
   */
  update(time, dt) {
    const rawDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);
    const effDt = rawDt * this.timeScale;

    // Use 2 sub-steps if dt is large to guarantee numerical precision and prevent tunneling
    const subSteps = (effDt > 0.02) ? 2 : 1;
    const subDt = effDt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this._subStep(subDt);
    }
  }

  /**
   * Single symplectic sub-step (0 memory allocations).
   * @param {number} dt
   */
  _subStep(dt) {
    const N = this.bodyCount;
    const epsSq = this.softening * this.softening;
    const nbEpsSq = this.nBodySoftening * this.nBodySoftening;
    const GM = this.G * this.centralMass;
    const Gnb = this.nBodyG;
    const rBound = this.boundaryRadius;
    const kBound = this.boundaryStiffness;
    const cBound = this.boundaryDamping;
    const rAssoc = this.assocDistance;
    const slingshotPwr = this.slingshotPower;

    // ── 0. Decay Cooldowns and Resonance Pulses ──
    for (let i = 0; i < N; i++) {
      this.resonance[i] *= Math.max(0.0, 1.0 - dt * 2.8);
      this.tidalSplit[i] = 0; // Will be set by close encounters below
    }

    const pairLen = MAX_GRAVITY_BODIES * MAX_GRAVITY_BODIES;
    for (let p = 0; p < pairLen; p++) {
      if (this.pairCooldown[p] > 0.0) {
        this.pairCooldown[p] -= dt;
      }
    }

    // ── 1. Clear Accelerations ──
    for (let i = 0; i < N; i++) {
      this.acc[i * 2 + 0] = 0.0;
      this.acc[i * 2 + 1] = 0.0;
    }

    // ── 2. Central Attractor & Core Repulsion ──
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const rSq = px * px + py * py;
      const r = Math.sqrt(rSq);

      if (r > 0.0001) {
        // Plummer central attraction
        const denom = Math.pow(rSq + epsSq, 1.5);
        const aCenter = -GM / denom;
        this.acc[i * 2 + 0] += px * aCenter;
        this.acc[i * 2 + 1] += py * aCenter;

        // Core softening repulsion (keeps the very center open like an eye)
        if (r < this.coreRadius) {
          const coreExcess = (this.coreRadius - r) / this.coreRadius;
          const aCore = this.coreStiffness * coreExcess * (1.0 / r);
          this.acc[i * 2 + 0] += px * aCore;
          this.acc[i * 2 + 1] += py * aCore;
        }

        // Central periastron tidal trigger
        if (this.tidalBifurcationEnabled && r < 0.11) {
          this.tidalSplit[i] = 1;
        }
      }
    }

    // ── 3. Mutual N-Body Gravitation & Association / Slingshot ──
    for (let i = 0; i < N; i++) {
      const pxi = this.pos[i * 2 + 0];
      const pyi = this.pos[i * 2 + 1];
      const mi = this.mass[i];

      for (let j = i + 1; j < N; j++) {
        const pxj = this.pos[j * 2 + 0];
        const pyj = this.pos[j * 2 + 1];
        const mj = this.mass[j];

        const dx = pxj - pxi;
        const dy = pyj - pyi;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        // Mutual Plummer attraction
        if (Gnb > 0.001) {
          const nbDenom = Math.pow(distSq + nbEpsSq, 1.5);
          const fMutual = Gnb / nbDenom;

          this.acc[i * 2 + 0] += dx * (fMutual * mj);
          this.acc[i * 2 + 1] += dy * (fMutual * mj);

          this.acc[j * 2 + 0] -= dx * (fMutual * mi);
          this.acc[j * 2 + 1] -= dy * (fMutual * mi);
        }

        // ── Association & Dissociation State Machine ──
        const pairIdx = i * MAX_GRAVITY_BODIES + j;
        const pairRev = j * MAX_GRAVITY_BODIES + i;
        const isCooldown = this.pairCooldown[pairIdx] > 0.0;
        const prevDist = this.pairPrevDist[pairIdx];
        this.pairPrevDist[pairIdx] = dist;

        if (dist < rAssoc && !isCooldown) {
          // Association: Capture into temporary binary orbital dance!
          this.pairActive[pairIdx] = 1;
          this.pairActive[pairRev] = 1;
          this.pairAssocTime[pairIdx] += dt;

          const proximityNorm = Math.max(0.0, 1.0 - dist / rAssoc);
          // Visual resonance pulse on ribbon thickness
          this.resonance[i] = Math.max(this.resonance[i], proximityNorm);
          this.resonance[j] = Math.max(this.resonance[j], proximityNorm);

          // Tidal splitting trigger during close gravitational encounter
          if (this.tidalBifurcationEnabled && dist < rAssoc * 0.58) {
            this.tidalSplit[i] = 1;
            this.tidalSplit[j] = 1;
          }

          // Perpendicular binary spin torque (whirl around common barycenter)
          if (dist > 0.001) {
            const invDist = 1.0 / dist;
            const perpX = -dy * invDist;
            const perpY =  dx * invDist;
            const torque = this.binaryOrbitTorque * proximityNorm;

            this.acc[i * 2 + 0] += perpX * torque;
            this.acc[i * 2 + 1] += perpY * torque;

            this.acc[j * 2 + 0] -= perpX * torque;
            this.acc[j * 2 + 1] -= perpY * torque;
          }

          // Check for Dissociation / Slingshot Ejection
          // Occurs when:
          // 1. Pair has danced for maxAssocTime, OR
          // 2. Relative speed exceeds slingshot threshold, OR
          // 3. Passing periastron (distance just started increasing after deep close encounter)
          const vxi = this.vel[i * 2 + 0];
          const vyi = this.vel[i * 2 + 1];
          const vxj = this.vel[j * 2 + 0];
          const vyj = this.vel[j * 2 + 1];
          const relVx = vxj - vxi;
          const relVy = vyj - vyi;
          const relSpeedSq = relVx * relVx + relVy * relVy;

          const isPeriastronPass = (dist > prevDist && dist < rAssoc * 0.7 && this.pairAssocTime[pairIdx] > 0.35);
          const isTimeout = this.pairAssocTime[pairIdx] >= this.maxAssocTime;
          const isHighVelocityFlyby = (relSpeedSq > 3.8 && dist < rAssoc * 0.65);

          if (isPeriastronPass || isTimeout || isHighVelocityFlyby) {
            // ── Dissociation: Slingshot Boost! ──
            const spdI = Math.sqrt(vxi * vxi + vyi * vyi) || 0.001;
            const spdJ = Math.sqrt(vxj * vxj + vyj * vyj) || 0.001;
            const boostVal = slingshotPwr * 0.38;

            // Boost in instantaneous forward heading
            this.vel[i * 2 + 0] += (vxi / spdI) * boostVal;
            this.vel[i * 2 + 1] += (vyi / spdI) * boostVal;
            this.vel[j * 2 + 0] += (vxj / spdJ) * boostVal;
            this.vel[j * 2 + 1] += (vyj / spdJ) * boostVal;

            // Radial separation impulse away from partner
            if (dist > 0.001) {
              const sepBoost = boostVal * 0.28;
              this.vel[i * 2 + 0] -= (dx / dist) * sepBoost;
              this.vel[i * 2 + 1] -= (dy / dist) * sepBoost;
              this.vel[j * 2 + 0] += (dx / dist) * sepBoost;
              this.vel[j * 2 + 1] += (dy / dist) * sepBoost;
            }

            // Visual slingshot flash
            this.resonance[i] = 1.0;
            this.resonance[j] = 1.0;

            // Reset pair and put into cooldown (2.5 - 4.0s)
            this.pairActive[pairIdx] = 0;
            this.pairActive[pairRev] = 0;
            this.pairAssocTime[pairIdx] = 0.0;
            const cd = 2.4 + (i + j) * 0.35;
            this.pairCooldown[pairIdx] = cd;
            this.pairCooldown[pairRev] = cd;
          }
        } else {
          // No longer close
          this.pairActive[pairIdx] = 0;
          this.pairActive[pairRev] = 0;
          this.pairAssocTime[pairIdx] = 0.0;
        }
      }
    }

    // ── 4. Soft Boundary Restoring Force (Centripetal Mandala Trap) ──
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const vx = this.vel[i * 2 + 0];
      const vy = this.vel[i * 2 + 1];
      const r = Math.sqrt(px * px + py * py);

      if (r > rBound) {
        const excess = (r - rBound);
        const invR = 1.0 / r;
        const nx = px * invR;
        const ny = py * invR;

        // Progressive restoring spring force
        const fRestoring = kBound * (excess + excess * excess * 4.5);
        this.acc[i * 2 + 0] -= nx * fRestoring;
        this.acc[i * 2 + 1] -= ny * fRestoring;

        // Radial outward damping (prevents bouncing out)
        const vRadial = vx * nx + vy * ny;
        if (vRadial > 0.0) {
          const fDamp = cBound * vRadial;
          this.acc[i * 2 + 0] -= nx * fDamp;
          this.acc[i * 2 + 1] -= ny * fDamp;
        }
      }
    }

    // ── 5. Adaptive Orbital Energy Regulation (Keplerian Stabilization) ──
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const vx = this.vel[i * 2 + 0];
      const vy = this.vel[i * 2 + 1];
      const vSq = vx * vx + vy * vy;
      const v = Math.sqrt(vSq);
      const rSq = px * px + py * py;
      const r = Math.sqrt(rSq);

      if (v > 0.0001 && r > 0.0001) {
        // Ideal circular Keplerian speed at this radius
        const denom = Math.pow(rSq + epsSq, 1.5);
        const vKepler = Math.sqrt(Math.max(0.01, (GM * rSq) / denom));

        const minV = vKepler * 0.42;
        const maxV = vKepler * 2.2;

        const invV = 1.0 / v;
        const tx = vx * invV;
        const ty = vy * invV;

        if (v < minV) {
          // Gentle speed injection along velocity vector
          const inject = (minV - v) * this.energyBalance * 2.2;
          this.acc[i * 2 + 0] += tx * inject;
          this.acc[i * 2 + 1] += ty * inject;
        } else if (v > maxV) {
          // Gentle aerodynamic drag
          const drag = (v - maxV) * (this.energyBalance * 1.8 + this.damping);
          this.acc[i * 2 + 0] -= tx * drag;
          this.acc[i * 2 + 1] -= ty * drag;
        } else if (this.damping > 0.0001) {
          // Ambient viscous damping
          this.acc[i * 2 + 0] -= vx * this.damping;
          this.acc[i * 2 + 1] -= vy * this.damping;
        }
      }
    }

    // ── 6. Symplectic Integration Step (Velocity -> Position) ──
    for (let i = 0; i < N; i++) {
      const ax = this.acc[i * 2 + 0];
      const ay = this.acc[i * 2 + 1];

      // Update velocity
      let vx = this.vel[i * 2 + 0] + ax * dt;
      let vy = this.vel[i * 2 + 1] + ay * dt;

      // Absolute safety speed clamp (prevents teleportation)
      const curSpeed = Math.sqrt(vx * vx + vy * vy);
      const maxAllowedSpeed = 3.8;
      if (curSpeed > maxAllowedSpeed) {
        const factor = maxAllowedSpeed / curSpeed;
        vx *= factor;
        vy *= factor;
      }

      this.vel[i * 2 + 0] = vx;
      this.vel[i * 2 + 1] = vy;
      this.speed[i] = Math.sqrt(vx * vx + vy * vy);

      // Update position (Symplectic Euler: uses updated velocity!)
      this.pos[i * 2 + 0] += vx * dt;
      this.pos[i * 2 + 1] += vy * dt;

      // ── 7. Kinematic Angle & Curvature Calculations ──
      const prevHeading = this.heading[i];
      let newHeading = Math.atan2(vy, vx);

      // Wrap heading difference cleanly across [-PI, PI]
      let dTheta = newHeading - prevHeading;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;

      this.heading[i] = newHeading;
      this.angularVel[i] = (dt > 0.0001) ? (dTheta / dt) : 0.0;
      this.pathDistance[i] += this.speed[i] * dt;
    }
  }
}
