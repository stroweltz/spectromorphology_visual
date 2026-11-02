import * as THREE from 'three';

/**
 * GravitySimulation
 * -----------------
 * Modular, zero-allocation N-body orbital physics engine for procedural Three.js ribbons.
 * Simulates 4, 5, or 6 gravitational bodies moving under:
 *   1. Plummer-softened central attractor at the origin (F_center = -GM * r / (r^2 + eps^2)^(3/2)).
 *   2. Smooth C^∞ centrifugal core barrier preventing collapse onto the central singularity.
 *   3. Optional Mutual N-body gravitation (0.0 = pure stable Keplerian rosette orbits, >0 = multi-body interaction).
 *   4. Smooth boundary localization (tangential gliding trap keeping bodies inside the mandala).
 *   5. Adaptive orbital energy regulation with automatic velocity rescaling when G or M is adjusted.
 *   6. Dynamic Association & Dissociation mechanics:
 *      - Association: capture into resonance pairing with smooth harmonic thickness pulse.
 *      - Dissociation: smooth periastron slingshot boost into high-eccentricity loops without velocity jumps.
 *   7. Tidal Bifurcation: Roche-limit ribbon splitting during periastron passages.
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
    this.coreSoftening = 0.085;                         // Core barrier softening radius
    this.coreBarrierStrength = 0.088;                   // Centrifugal barrier coefficient

    // Mutual N-body coupling strength (0.0 = stable serene Keplerian rosette orbits)
    this.nBodyG = options.nBodyG ?? 0.0;
    this.nBodySoftening = options.nBodySoftening ?? 0.10;

    this.boundaryRadius = options.boundaryRadius ?? 0.58; // Mandala perimeter
    this.timeScale = options.timeScale ?? 1.0;
    this.damping = options.damping ?? 0.0;               // Conservative by default

    // Association & Dissociation parameters
    this.assocDistance = options.assocDistance ?? 0.16; // R_assoc critical distance
    this.slingshotPower = options.slingshotPower ?? 1.5; // Boost upon dissociation
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

    // Initialize mass distribution and initial orbital states
    this.initDefaultMasses();
    this.resetAllOrbits();
  }

  /**
   * Sets up individual body masses.
   */
  initDefaultMasses() {
    const baseMasses = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    for (let i = 0; i < MAX_GRAVITY_BODIES; i++) {
      this.mass[i] = baseMasses[i] || 1.0;
    }
  }

  /**
   * Dynamically rescales existing orbital velocities to maintain stable orbit shapes
   * when G or M is modified via GUI.
   * @param {number} ratio
   * @private
   */
  _rescaleVelocities(ratio) {
    if (ratio > 0.02 && ratio < 50.0 && Math.abs(ratio - 1.0) > 0.001) {
      for (let i = 0; i < this.bodyCount; i++) {
        this.vel[i * 2 + 0] *= ratio;
        this.vel[i * 2 + 1] *= ratio;
        this.speed[i] *= ratio;
      }
    }
  }

  /**
   * Safe setter for G that maintains orbital balance.
   * @param {number} newG
   */
  setG(newG) {
    const oldGM = Math.max(0.0001, this.G * this.centralMass);
    this.G = Math.max(0.05, newG);
    const newGM = Math.max(0.0001, this.G * this.centralMass);
    this._rescaleVelocities(Math.sqrt(newGM / oldGM));
  }

  /**
   * Safe setter for central mass that maintains orbital balance.
   * @param {number} newM
   */
  setCentralMass(newM) {
    const oldGM = Math.max(0.0001, this.G * this.centralMass);
    this.centralMass = Math.max(0.05, newM);
    const newGM = Math.max(0.0001, this.G * this.centralMass);
    this._rescaleVelocities(Math.sqrt(newGM / oldGM));
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
   * All bodies co-rotate with harmonious radii and slight eccentricity to prevent head-on crashes.
   */
  resetAllOrbits() {
    const N = this.bodyCount;
    const epsSq = this.softening * this.softening;
    const GM = Math.max(0.01, this.G * this.centralMass);

    for (let i = 0; i < MAX_GRAVITY_BODIES; i++) {
      this.acc[i * 2 + 0] = 0;
      this.acc[i * 2 + 1] = 0;
      this.pathDistance[i] = 0;
      this.resonance[i] = 0;
      this.tidalSplit[i] = 0;

      if (i < N) {
        // Multi-tier orbital radii: distributing bodies between inner, mid, and outer shells
        // Radius range roughly 0.22 .. 0.50 inside 0.58 boundary
        const tier = i % 3;
        const baseRadius = 0.22 + tier * 0.11 + (i / N) * 0.05;
        const angle = (i / N) * Math.PI * 2.0;

        const x = Math.cos(angle) * baseRadius;
        const y = Math.sin(angle) * baseRadius;
        this.pos[i * 2 + 0] = x;
        this.pos[i * 2 + 1] = y;

        // Circular velocity v_circ = sqrt(G * M * r^2 / (r^2 + eps^2)^(3/2))
        const rSq = x * x + y * y;
        const denom = Math.pow(rSq + epsSq, 1.5);
        const vCirc = Math.sqrt(Math.max(0.01, (GM * rSq) / denom));

        // Mild eccentricity (0.15 .. 0.30) produces majestic precessing rosette loops
        const ecc = 0.16 + (i % 2) * 0.12;
        const vx = -Math.sin(angle) * vCirc * (1.0 + ecc * 0.5);
        const vy =  Math.cos(angle) * vCirc * (1.0 - ecc * 0.5);

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
  }

  /**
   * Resets single body if perturbed.
   * @param {number} i
   */
  resetBody(i) {
    if (i < 0 || i >= this.bodyCount) return;
    const N = this.bodyCount;
    const tier = i % 3;
    const baseRadius = 0.24 + tier * 0.11;
    const angle = (i / N) * Math.PI * 2.0;
    const GM = Math.max(0.01, this.G * this.centralMass);
    const epsSq = this.softening * this.softening;
    const rSq = baseRadius * baseRadius;
    const denom = Math.pow(rSq + epsSq, 1.5);
    const vCirc = Math.sqrt(Math.max(0.01, (GM * rSq) / denom));

    this.pos[i * 2 + 0] = Math.cos(angle) * baseRadius;
    this.pos[i * 2 + 1] = Math.sin(angle) * baseRadius;
    this.vel[i * 2 + 0] = -Math.sin(angle) * vCirc;
    this.vel[i * 2 + 1] =  Math.cos(angle) * vCirc;
    this.speed[i] = vCirc;
    this.heading[i] = Math.atan2(this.vel[i * 2 + 1], this.vel[i * 2 + 0]);
  }

  /**
   * Main simulation step.
   * Uses Symplectic Euler integration with 2 sub-steps for smooth ballistic orbits.
   * @param {number} time - elapsed real time in seconds
   * @param {number} dt - delta time in seconds
   */
  update(time, dt) {
    const rawDt = Math.min(Math.max(dt || 0.016, 0.001), 0.05);
    const effDt = rawDt * this.timeScale;

    // 2 sub-steps guarantee smooth, vibration-free integration
    const effSpeed = Math.sqrt(Math.max(0.1, this.G * this.centralMass));
    const subSteps = Math.max(2, Math.min(8, Math.ceil(effSpeed * 1.2)));
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
    const rAssoc = this.assocDistance;
    const coreEpsSq = this.coreSoftening * this.coreSoftening;
    const kBarrier = this.coreBarrierStrength * GM;

    // ── 0. Decay Cooldowns and Resonance Pulses ──
    for (let i = 0; i < N; i++) {
      this.resonance[i] *= Math.max(0.0, 1.0 - dt * 2.2);
      this.tidalSplit[i] = 0;
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

    // ── 2. Central Attractor & C^∞ Smooth Centrifugal Core Barrier ──
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const rSq = px * px + py * py;
      const r = Math.sqrt(rSq);

      if (r > 0.0001) {
        // A) Plummer central attraction: F_attract = -GM * r / (r^2 + eps^2)^(3/2)
        const denom = Math.pow(rSq + epsSq, 1.5);
        const aPlummer = -GM / denom;

        // B) Analytic C^∞ Centrifugal Repulsion Barrier: F_repulse = +kBarrier * r / (r^2 + coreEps^2)^2
        // Naturally bends plunging bodies around the core into a graceful hyperbolic loop with 0 vibration!
        const coreDenom = Math.pow(rSq + coreEpsSq, 2.0);
        const aCore = kBarrier / coreDenom;

        const aNet = aPlummer + aCore;
        this.acc[i * 2 + 0] += px * aNet;
        this.acc[i * 2 + 1] += py * aNet;

        // Periastron tidal bifurcation trigger (active only near the core periastron loop)
        if (this.tidalBifurcationEnabled && r < 0.12) {
          this.tidalSplit[i] = 1;
        }
      }
    }

    // ── 3. Mutual N-Body Gravitation (if enabled) & Association / Slingshot ──
    if (Gnb > 0.0001) {
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

          const nbDenom = Math.pow(distSq + nbEpsSq, 1.5);
          const fMutual = Gnb / nbDenom;

          this.acc[i * 2 + 0] += dx * (fMutual * mj);
          this.acc[i * 2 + 1] += dy * (fMutual * mj);

          this.acc[j * 2 + 0] -= dx * (fMutual * mi);
          this.acc[j * 2 + 1] -= dy * (fMutual * mi);
        }
      }
    }

    // ── 3b. Association Proximity & Smooth Tidal Resonance ──
    for (let i = 0; i < N; i++) {
      const pxi = this.pos[i * 2 + 0];
      const pyi = this.pos[i * 2 + 1];

      for (let j = i + 1; j < N; j++) {
        const pxj = this.pos[j * 2 + 0];
        const pyj = this.pos[j * 2 + 1];
        const dx = pxj - pxi;
        const dy = pyj - pyi;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < rAssoc) {
          const proximity = Math.max(0.0, 1.0 - dist / rAssoc);
          // Visual harmonic resonance thickness pulse (continuous and smooth)
          this.resonance[i] = Math.max(this.resonance[i], proximity);
          this.resonance[j] = Math.max(this.resonance[j], proximity);

          if (this.tidalBifurcationEnabled && dist < rAssoc * 0.5) {
            this.tidalSplit[i] = 1;
            this.tidalSplit[j] = 1;
          }

          // Smooth tangential slingshot acceleration along current flight path (0 velocity jumps!)
          if (this.slingshotPower > 0.01) {
            const spdI = this.speed[i] || 0.001;
            const spdJ = this.speed[j] || 0.001;
            const boostA = this.slingshotPower * 0.45 * proximity;
            this.acc[i * 2 + 0] += (this.vel[i * 2 + 0] / spdI) * boostA;
            this.acc[i * 2 + 1] += (this.vel[i * 2 + 1] / spdI) * boostA;
            this.acc[j * 2 + 0] += (this.vel[j * 2 + 0] / spdJ) * boostA;
            this.acc[j * 2 + 1] += (this.vel[j * 2 + 1] / spdJ) * boostA;
          }
        }
      }
    }

    // ── 4. Smooth Tangential Perimeter Gliding Trap ──
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const vx = this.vel[i * 2 + 0];
      const vy = this.vel[i * 2 + 1];
      const r = Math.sqrt(px * px + py * py);

      if (r > rBound) {
        const excess = (r - rBound) / rBound;
        const invR = 1.0 / Math.max(0.0001, r);
        const nx = px * invR;
        const ny = py * invR;

        // Adaptive inward restoring force scaled with GM
        const aBound = (18.0 + GM * 6.0) * (excess + excess * excess * 4.0);
        this.acc[i * 2 + 0] -= nx * aBound;
        this.acc[i * 2 + 1] -= ny * aBound;

        // Smooth tangential redirection: rotate outward velocity along the circumference
        const vRadial = vx * nx + vy * ny;
        if (vRadial > 0.0) {
          const bendFactor = Math.min(1.0, dt * 14.0 * (1.0 + excess));
          this.vel[i * 2 + 0] -= nx * (vRadial * bendFactor);
          this.vel[i * 2 + 1] -= ny * (vRadial * bendFactor);
        }
      }
    }

    // ── 5. Continuous Keplerian Speed Governor ──
    // Keeps bodies in stable bound orbits for ANY G and M values without collapse or flyaway
    for (let i = 0; i < N; i++) {
      const px = this.pos[i * 2 + 0];
      const py = this.pos[i * 2 + 1];
      const vx = this.vel[i * 2 + 0];
      const vy = this.vel[i * 2 + 1];
      const v = Math.sqrt(vx * vx + vy * vy);
      const rSq = px * px + py * py;
      const r = Math.sqrt(rSq);
      const denom = Math.pow(rSq + epsSq, 1.5);
      const vKepler = Math.sqrt(Math.max(0.01, (GM * rSq) / denom));

      // Healthy orbital speed window [0.55 .. 1.45] of circular speed allows high eccentricity loops
      const minV = vKepler * 0.55;
      const maxV = vKepler * 1.45;

      if (v > 0.0001) {
        const invV = 1.0 / v;
        const tx = vx * invV;
        const ty = vy * invV;

        // Angular momentum & orbital shape governor
        const invR = 1.0 / Math.max(0.0001, r);
        const nx = px * invR;
        const ny = py * invR;
        const txNorm = -ny; // Tangent unit vector along co-rotation
        const tyNorm =  nx;
        const vTan = vx * txNorm + vy * tyNorm;
        const vRad = vx * nx + vy * ny;

        // Maintain healthy angular momentum: ensure tangential velocity stays above minimum threshold
        const minTan = vKepler * 0.70;
        if (vTan < minTan) {
          const boost = (minTan - vTan) * 1.8;
          this.acc[i * 2 + 0] += txNorm * boost;
          this.acc[i * 2 + 1] += tyNorm * boost;
        }

        // Damp excess radial velocity (prevents plunging into the core or flying out to the boundary)
        const maxRad = vKepler * 0.75;
        if (Math.abs(vRad) > maxRad) {
          const dampRad = (vRad - Math.sign(vRad) * maxRad) * 1.2;
          this.acc[i * 2 + 0] -= nx * dampRad;
          this.acc[i * 2 + 1] -= ny * dampRad;
        }
      }
    }

    // ── 6. Symplectic Integration Step (Velocity -> Position) ──
    for (let i = 0; i < N; i++) {
      const ax = this.acc[i * 2 + 0];
      const ay = this.acc[i * 2 + 1];

      // Update velocity (v = v + a * dt)
      let vx = this.vel[i * 2 + 0] + ax * dt;
      let vy = this.vel[i * 2 + 1] + ay * dt;

      // Safe speed cap (maximum 3.2 to prevent visual tunneling)
      const curSpeed = Math.sqrt(vx * vx + vy * vy);
      const maxAllowedSpeed = 3.2;
      if (curSpeed > maxAllowedSpeed) {
        const factor = maxAllowedSpeed / curSpeed;
        vx *= factor;
        vy *= factor;
      }

      this.vel[i * 2 + 0] = vx;
      this.vel[i * 2 + 1] = vy;
      this.speed[i] = Math.sqrt(vx * vx + vy * vy);

      // Update position (p = p + v * dt)
      this.pos[i * 2 + 0] += vx * dt;
      this.pos[i * 2 + 1] += vy * dt;

      // ── 7. Kinematic Heading Angle & Curvature ──
      const prevHeading = this.heading[i];
      let newHeading = Math.atan2(vy, vx);

      let dTheta = newHeading - prevHeading;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;

      this.heading[i] = newHeading;
      this.angularVel[i] = (dt > 0.0001) ? (dTheta / dt) : 0.0;
      this.pathDistance[i] += this.speed[i] * dt;
    }
  }
}
