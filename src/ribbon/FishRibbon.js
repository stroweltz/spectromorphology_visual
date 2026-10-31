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
    this.pathRadius = options.pathRadius || 0.32;
    this.phaseOffset = options.phaseOffset || 0.0;
    this.orbitSpeed = options.orbitSpeed || 0.4;
    this.splitIntensity = options.splitIntensity || 0.0; // 0 = single ribbon, >0 = bifurcated split

    // Material
    this.material = createPaperMaterial(options.color || 0xff385c);
    this.splitMaterial = createPaperMaterial(options.splitColor || options.color || 0xff8533);

    // Spine points (positions along the backbone)
    this.spine = [];
    for (let i = 0; i < this.segments; i++) {
      this.spine.push(new THREE.Vector2(0, 0));
    }

    // Secondary spine for the split/divergent branch
    this.splitSpine = [];
    for (let i = 0; i < this.segments; i++) {
      this.splitSpine.push(new THREE.Vector2(0, 0));
    }

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
   * Evaluates the leading head position on an organic Lissajous / Rose path.
   * Writes into this._tmpHead to avoid allocation.
   */
  _getHeadPosition(t) {
    const angle1 = t * this.orbitSpeed + this.phaseOffset;
    const angle2 = t * (this.orbitSpeed * 1.618) + this.phaseOffset * 1.4;
    
    // Rose / Epitrochoid looping trajectory
    const r = this.pathRadius * (0.8 + 0.35 * Math.sin(t * 0.7 + this.phaseOffset));
    const x = Math.cos(angle1) * r + 0.08 * Math.cos(angle2 * 2.0);
    const y = Math.sin(angle1) * r + 0.08 * Math.sin(angle2 * 2.0);

    return this._tmpHead.set(x, y);
  }

  /**
   * Updates kinematics and ribbon vertex buffer
   */
  update(time, delta) {
    this.material.uniforms.uTime.value = time;
    this.splitMaterial.uniforms.uTime.value = time;

    // 1. Calculate leading head
    const head = this._getHeadPosition(time);
    this.spine[0].copy(head);

    // 2. Spine follow-through (IK kinematic drag from head to tail)
    const segDist = 0.018 * (this.speed / 1.0);
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

    // 3. Fish Swimming Wave (Carangiform Undulation)
    // Applied laterally relative to the spine's tangents
    const lateralOffsets = [];
    for (let i = 0; i < this.segments; i++) {
      const s = i / (this.segments - 1); // 0 at head, 1 at tail
      
      // Amplitude envelope: 0 at head, swells towards middle and tail
      const amp = this.waveAmp * Math.pow(s, 1.4);
      const wave = Math.sin(this.waveFreq * s * Math.PI * 2.0 - time * 4.2 + this.phaseOffset);
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
      this.splitMesh.count = this._instanceCount;
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

    // Reuse preallocated temp vectors – zero GC pressure
    const tangent   = this._tmpTangent;
    const normal    = this._tmpNormal;
    const centerPos = this._tmpCenter;
    const left      = this._tmpLeft;
    const right     = this._tmpRight;

    for (let i = 0; i < this.segments; i++) {
      const s = i / (this.segments - 1);
      const curr = spine[i];

      // Tangent calculation (reuse tangent vec)
      if (i < this.segments - 1) {
        tangent.subVectors(spine[i + 1], curr).normalize();
      } else if (i > 0) {
        tangent.subVectors(curr, spine[i - 1]).normalize();
      } else {
        tangent.set(1, 0);
      }

      // Normal (perpendicular) — reuse normal vec
      normal.set(-tangent.y, tangent.x);

      // Fish lateral wave offset
      const lat = lateralOffsets[i];
      centerPos.copy(curr).addScaledVector(normal, lat);

      // If this is a split branch, diverge outward along the normal
      if (splitDivergence > 0.0) {
        const divergeFactor = Math.sin(Math.PI * s) * splitDivergence * 0.12;
        centerPos.addScaledVector(normal, -divergeFactor);
      }

      // Width envelope: tapered head, thick fleshy body, feather-light tail
      const widthProfile = Math.sin(Math.pow(s, 0.72) * Math.PI);
      const halfWidth = (this.baseWidth * widthScale * 0.5) * Math.max(0.08, widthProfile);

      // Left / right vertices — reuse left/right vecs
      left.copy(centerPos).addScaledVector(normal,  halfWidth);
      right.copy(centerPos).addScaledVector(normal, -halfWidth);

      // Write positions
      const vIdx = i * 2;
      positions[vIdx * 3 + 0] = left.x;
      positions[vIdx * 3 + 1] = left.y;
      positions[vIdx * 3 + 2] = 0.0;

      positions[(vIdx + 1) * 3 + 0] = right.x;
      positions[(vIdx + 1) * 3 + 1] = right.y;
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
