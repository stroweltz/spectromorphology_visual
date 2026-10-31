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
    this.baseWidth = options.baseWidth || 0.14;
    this.speed = options.speed || 1.2;
    this.waveFreq = options.waveFreq || 4.5;
    this.waveAmp = options.waveAmp || 0.07;
    this.pathRadius = options.pathRadius || 0.42;
    this.phaseOffset = options.phaseOffset || 0.0;
    this.orbitSpeed = options.orbitSpeed || 0.4;
    this.splitIntensity = options.splitIntensity || 0.0; // 0 = single ribbon, >0 = bifurcated split

    // ── Minimum turning radius constraint ──
    // Prevents the head from making sharp U-turns that create visual noise.
    // Governs max angular velocity: |ω_max| = v / minTurnRadius.
    this.minTurnRadius = options.minTurnRadius ?? 0.12;

    // ── Steering Kinematics Agent State ──
    // The brush head is an autonomous self-steering body with forward velocity v,
    // continuous heading angle θ, and strictly bounded angular velocity ω.
    this.headPos = new THREE.Vector2(
      Math.cos(this.phaseOffset) * (this.pathRadius || 0.42),
      Math.sin(this.phaseOffset) * (this.pathRadius || 0.42)
    );
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
    for (let i = 0; i < this.segments; i++) {
      this._centerline.push(this.spine[i].clone());
    }

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

    // Build Split Branch InstancedMesh
    this.splitGeometry = this._createRibbonGeometry(this.segments);
    this.splitMesh = new THREE.InstancedMesh(this.splitGeometry, this.splitMaterial, this._maxInstances);
    this.splitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splitMesh.count = 0;
    this.splitMesh.frustumCulled = false;
    this.splitMesh.visible = false;

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
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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

    const initDir = new THREE.Vector2(Math.cos(this.headingAngle), Math.sin(this.headingAngle));
    const initSegDist = 0.018 * (this.speed / 1.0);
    for (let i = 0; i < this.segments; i++) {
      this.spine[i].copy(this.headPos).addScaledVector(initDir, -i * initSegDist);
      this.splitSpine[i].copy(this.spine[i]);
      this._centerline[i].copy(this.spine[i]);
    }
  }

  /**
   * Updates the autonomous brush agent using steering kinematics.
   *
   * Kinematic model:
   *  - Linear velocity:  v = orbitSpeed * 0.75 * audioSpeedMult
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

    // 1. Forward linear velocity
    const v = Math.max(0.0, this.orbitSpeed * 0.75 * this.audioSpeedMult);

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
   * Updates kinematics and ribbon vertex buffer
   */
  update(time, delta) {
    this.material.uniforms.uTime.value = time;
    this.splitMaterial.uniforms.uTime.value = time;

    // 1. Calculate leading head via autonomous steering kinematics
    const head = this._updateHeadAgent(time, delta);
    this.spine[0].copy(head);

    // Current forward speed
    const v = Math.max(0.0, this.orbitSpeed * 0.75 * this.audioSpeedMult);

    // 2. Spine follow-through (IK kinematic drag from head to tail)
    // Sub-stepping at higher speeds eliminates the whip-like phase lag / catch-up snap
    const substeps = (v > 0.45) ? 2 : 1;
    const segDist = 0.018 * (this.speed / 1.0);

    for (let step = 0; step < substeps; step++) {
      for (let i = 1; i < this.segments; i++) {
        const prev = this.spine[i - 1];
        const curr = this.spine[i];
        this._tmpDir.subVectors(curr, prev);
        const len = this._tmpDir.length();
        if (len > 0.0001) {
          this._tmpDir.multiplyScalar(segDist / len);
          curr.copy(prev).add(this._tmpDir);
        } else {
          curr.copy(prev);
        }
      }
    }

    // 3. Fish Swimming Wave (Carangiform Undulation)
    // Synchronize wave phase to forward speed:
    // When slow/stationary, it has a slow, gentle sway; when fast, wave frequency scales naturally.
    const waveSpeed = v * 11.0 + 0.6;
    this.wavePhase += waveSpeed * Math.min(delta || 0.016, 0.05);

    // Lateral amplitude scales with forward speed (avoids rapid flapping while crawling)
    const speedFactor = THREE.MathUtils.clamp(v / 0.35, 0.25, 1.15);
    const lateralOffsets = [];
    for (let i = 0; i < this.segments; i++) {
      const s = i / (this.segments - 1); // 0 at head, 1 at tail
      
      // Biomechanical amplitude envelope: gentle at head, swells along body, smoothly eases at tail tip
      const amp = this.waveAmp * speedFactor * Math.sin(Math.pow(s, 0.85) * Math.PI * 0.5) * (1.0 - 0.22 * s);
      const wave = Math.sin(this.waveFreq * s * Math.PI * 2.0 - this.wavePhase);
      lateralOffsets.push(amp * wave);
    }

    // 4. Update Main Ribbon Mesh Vertices
    this._updateMeshGeometry(this.geometry, this.spine, lateralOffsets, 1.0, 0.0);

    // 5. Handle Splitting / Bifurcation
    // Split cycle: periodic swelling and separation
    const splitCycle = Math.sin(time * 0.8 + this.phaseOffset) * 0.5 + 0.5; // 0 to 1
    const effectiveSplit = THREE.MathUtils.lerp(0.0, this.splitIntensity, splitCycle);

    if (effectiveSplit > 0.05) {
      this.splitMesh.visible = true;
      this.splitMesh.count = this.mesh.count; // match main mesh (respects debug mode override)
      this.splitMaterial.uniforms.uOpacity.value = THREE.MathUtils.clamp(effectiveSplit * 1.5, 0.0, 0.95);
      
      // Update Split Branch: diverges opposite to the main branch
      this._updateMeshGeometry(this.splitGeometry, this.spine, lateralOffsets, 0.75, effectiveSplit);
    } else {
      this.splitMesh.visible = false;
    }
  }

  _updateMeshGeometry(geometry, spine, lateralOffsets, widthScale, splitDivergence) {
    const posAttr = geometry.attributes.position;
    const uvAttr = geometry.attributes.uv;
    const positions = posAttr.array;
    const uvs = uvAttr.array;
    const segs = this.segments;

    // Pass 1: Compute the continuous undulating centerline positions
    // Uses central-difference normals of the spine to avoid abrupt turns
    for (let i = 0; i < segs; i++) {
      const s = i / (segs - 1);
      const curr = spine[i];

      // Central difference tangent of spine
      if (i === 0) {
        this._tmpTangent.subVectors(spine[1], curr).normalize();
      } else if (i === segs - 1) {
        this._tmpTangent.subVectors(curr, spine[i - 1]).normalize();
      } else {
        this._tmpTangent.subVectors(spine[i + 1], spine[i - 1]).normalize();
      }
      this._tmpNormal.set(-this._tmpTangent.y, this._tmpTangent.x);

      // Base centerline with lateral undulation offset
      const c = this._centerline[i];
      c.copy(curr).addScaledVector(this._tmpNormal, lateralOffsets[i]);

      // If split branch, diverge outward along the normal
      if (splitDivergence > 0.0) {
        const divergeFactor = Math.sin(Math.PI * s) * splitDivergence * 0.12;
        c.addScaledVector(this._tmpNormal, -divergeFactor);
      }
    }

    // Pass 2: Extrude ribbon vertices perpendicular to the TRUE undulating centerline
    // This mathematically prevents self-intersecting folded triangles at the tail.
    for (let i = 0; i < segs; i++) {
      const s = i / (segs - 1);
      const c = this._centerline[i];

      // Tangent along the undulating centerline
      if (i === 0) {
        this._tmpTangent.subVectors(this._centerline[1], c).normalize();
      } else if (i === segs - 1) {
        this._tmpTangent.subVectors(c, this._centerline[i - 1]).normalize();
      } else {
        this._tmpTangent.subVectors(this._centerline[i + 1], this._centerline[i - 1]).normalize();
      }
      this._tmpNormal.set(-this._tmpTangent.y, this._tmpTangent.x);

      // Width envelope: tapered head, thick fleshy body, feather-light tail
      const widthProfile = Math.sin(Math.pow(s, 0.72) * Math.PI);
      const halfWidth = (this.baseWidth * widthScale * 0.5) * Math.max(0.04, widthProfile);

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

      // Write UVs: u along stroke, v across (-1.0 to 1.0)
      uvs[vIdx * 2 + 0] = s;
      uvs[vIdx * 2 + 1] = 1.0;

      uvs[(vIdx + 1) * 2 + 0] = s;
      uvs[(vIdx + 1) * 2 + 1] = -1.0;
    }

    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
  }
}
