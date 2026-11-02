import * as THREE from 'three';

/**
 * GravityBrushAgent
 * -----------------
 * Adapter connecting a body in `GravitySimulation` to a `FishRibbon`.
 * Implements the full kinematic brush agent interface:
 *  - pos, tangent, normal, headingAngle, angularVelocity, currentV, pathDistance
 *  - zero memory allocations in update()
 *  - provides resonance pulse and tidal bifurcation state to ribbon/material
 */
export class GravityBrushAgent {
  /**
   * @param {import('./GravitySimulation.js').GravitySimulation} simulation
   * @param {number} index
   * @param {Object} [options]
   */
  constructor(simulation, index, options = {}) {
    this.sim = simulation;
    this.index = index;
    this.phaseOffset = options.phaseOffset || (index * Math.PI * 0.4);

    // Kinematic vectors (reused per frame, 0 GC)
    this.pos = new THREE.Vector2();
    this.tangent = new THREE.Vector2(1, 0);
    this.normal = new THREE.Vector2(0, 1);

    this.headingAngle = 0.0;
    this.angularVelocity = 0.0;
    this.currentV = 0.0;
    this.pathDistance = 0.0;

    // Kinematic compatibility fields
    this.speed = 1.0;
    this.orbitSpeed = 0.2;
    this.maxBoundaryRadius = options.maxBoundaryRadius ?? 0.62;
    this.minTurnRadius = 0.05;
    this.randomSpeedEnabled = false;
    this.speedMultiplier = 1.0;
    this.speedDriftEnabled = false;
    this.speedWanderIntensity = 0.0;
    this.speedWanderFreq = 0.2;
    this.audioSpeedMult = 1.0;
    this.audioSteerMult = 1.0;
    this.audioExtraAngular = 0.0;

    // Initial sync
    this.syncFromSimulation();
  }

  get resonance() {
    return this.sim.resonance[this.index] || 0.0;
  }

  get tidalSplit() {
    return this.sim.tidalSplit[this.index] === 1;
  }

  get mass() {
    return this.sim.mass[this.index] || 1.0;
  }

  /**
   * Copies instantaneous state from the central GravitySimulation buffer.
   */
  syncFromSimulation() {
    const idx = this.index;
    const x = this.sim.pos[idx * 2 + 0];
    const y = this.sim.pos[idx * 2 + 1];
    this.pos.set(x, y);

    this.headingAngle = this.sim.heading[idx];
    this.angularVelocity = this.sim.angularVel[idx];
    this.currentV = this.sim.speed[idx];
    this.pathDistance = this.sim.pathDistance[idx];

    const cosH = Math.cos(this.headingAngle);
    const sinH = Math.sin(this.headingAngle);
    this.tangent.set(cosH, sinH);
    this.normal.set(-sinH, cosH);
  }

  /**
   * Frame update. Called by FishRibbon.
   * State is already computed by GravitySimulation.update() on this frame.
   * @param {number} time
   * @param {number} dt
   */
  update(time, dt) {
    this.syncFromSimulation();
    return this;
  }

  /**
   * Resets this body in the simulation.
   */
  reset() {
    this.sim.resetBody(this.index);
    this.syncFromSimulation();
  }
}
