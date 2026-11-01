import * as THREE from 'three';
import { createPaperMaterial } from '../shaders/paperMaterial.js';

/**
 * RibbonMeshRenderer
 * ------------------
 * Handles Three.js BufferGeometry generation, InstancedMesh instances for mandala symmetry,
 * normal extrusion along spine tangents, head/tail tapering, vertex color blending,
 * and uploading updated vertex data to the GPU.
 */
export class RibbonMeshRenderer {
  /**
   * @param {number} segments
   * @param {Object} options
   */
  constructor(segments = 64, options = {}) {
    this.segments = segments;

    // Brush Tip & Tail Tapers
    this.headTaperLength = options.headTaperLength ?? 0.15;
    this.headTipWidth = options.headTipWidth ?? 0.02;

    // Colors and Materials
    this.baseColor = new THREE.Color(options.color || 0xef2353);
    this.secondaryColor = new THREE.Color(options.splitColor || options.color || 0xffaa00);
    this.material = createPaperMaterial(options.color || 0xff385c);
    this.splitMaterial = createPaperMaterial(options.splitColor || options.color || 0xff8533);

    // Preallocated centerline vectors for extrusion
    this._centerline = [];
    this._splitCenterline = [];
    for (let i = 0; i < this.segments; i++) {
      this._centerline.push(new THREE.Vector2());
      this._splitCenterline.push(new THREE.Vector2());
    }

    // Reusable temp vectors (zero allocations in animation loop)
    this._tmpTangent = new THREE.Vector2();
    this._tmpNormal = new THREE.Vector2();
    this._tmpLeft = new THREE.Vector2();
    this._tmpRight = new THREE.Vector2();

    // InstancedMesh Setup (supports up to 64 mandala sectors × 2 mirror)
    this._maxInstances = 64;
    this._instanceCount = 1;

    // Primary Ribbon Mesh
    this.geometry = this._createRibbonGeometry(this.segments);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this._maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 1;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;

    // Split Branch Ribbon Mesh
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

    // Group containing both meshes
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.add(this.splitMesh);
  }

  /**
   * Builds the quad strip geometry for ribbon extrusion.
   * @param {number} segments
   * @returns {THREE.BufferGeometry}
   */
  _createRibbonGeometry(segments) {
    const vertexCount = segments * 2;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];

    // Precalculate UV coordinates once
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
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aWidth', new THREE.BufferAttribute(new Float32Array(vertexCount), 1).setUsage(THREE.DynamicDrawUsage));
    geom.setIndex(indices);
    return geom;
  }

  /**
   * Rebuilds instance matrices for mandala-style symmetry.
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

  /**
   * Updates vertex positions, widths, and colors for both strokes.
   *
   * @param {THREE.Vector2[]} spineA
   * @param {Float32Array} widthsA
   * @param {THREE.Vector2[]} spineB
   * @param {Float32Array} widthsB
   * @param {string} splitState
   * @param {number} headingAngle
   * @param {Float32Array} lateralOffsetsA
   * @param {Float32Array} lateralOffsetsB
   */
  update(spineA, widthsA, spineB, widthsB, splitState, headingAngle, lateralOffsetsA, lateralOffsetsB) {
    // 1. Update Main Ribbon Mesh Vertices
    this._updateMeshGeometry(this.geometry, spineA, lateralOffsetsA, widthsA, this._centerline, false, headingAngle);

    // 2. Update Split Branch Ribbon Mesh Vertices
    if (splitState !== 'CLOSED') {
      this.splitMesh.visible = true;
      this.splitMesh.count = this.mesh.count;
      this.splitMaterial.uniforms.uOpacity.value = 0.92;
      this._updateMeshGeometry(this.splitGeometry, spineB, lateralOffsetsB, widthsB, this._splitCenterline, true, headingAngle, splitState);
    } else {
      this.splitMesh.visible = false;
    }
  }

  _updateMeshGeometry(geometry, spine, lateralOffsets, widthsBuffer, centerline, isSplitBranch, headingAngle, splitState) {
    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;
    const widthAttr = geometry.attributes.aWidth;
    const positions = posAttr.array;
    const colors = colAttr ? colAttr.array : null;
    const widths = widthAttr ? widthAttr.array : null;
    const segs = this.segments;

    // Find active ink span for split branch color gradient
    let tailIdx = 0;
    let headIdx = segs - 1;
    if (isSplitBranch) {
      for (let i = segs - 1; i >= 0; i--) {
        if (widthsBuffer[i] > 0.0001) {
          tailIdx = i;
          break;
        }
      }
      for (let i = 0; i < segs; i++) {
        if (widthsBuffer[i] > 0.0001) {
          headIdx = i;
          break;
        }
      }
    }

    // Extrude ribbon vertices perpendicular to the centerline
    for (let i = 0; i < segs; i++) {
      const s = i / (segs - 1);
      const curr = spine[i];

      // Tangent along spine: leading tip (i=0) is locked to forward heading
      if (i === 0) {
        this._tmpTangent.set(-Math.cos(headingAngle), -Math.sin(headingAngle));
      } else if (i === segs - 1) {
        this._tmpTangent.subVectors(curr, spine[i - 1]).normalize();
      } else {
        this._tmpTangent.subVectors(spine[i + 1], spine[i - 1]).normalize();
      }
      this._tmpNormal.set(-this._tmpTangent.y, this._tmpTangent.x);

      // Base centerline with lateral undulation offset (if non-zero)
      const c = centerline[i];
      if (lateralOffsets && Math.abs(lateralOffsets[i]) > 0.0001) {
        c.copy(curr).addScaledVector(this._tmpNormal, lateralOffsets[i]);
      } else {
        c.copy(curr);
      }

      // Width of this specific vertebra as recorded when it was drawn
      const vertebraWidth = widthsBuffer[i];

      // 1. Smooth head taper (pointed brush tip)
      let headTaper = 1.0;
      if (this.headTaperLength > 0.001 && s < this.headTaperLength) {
        const t = s / this.headTaperLength;
        const sinT = Math.sin(t * Math.PI * 0.5);
        const curve = Math.pow(sinT, 1.4);
        headTaper = this.headTipWidth + (1.0 - this.headTipWidth) * curve;
      }

      // 2. Smooth tail taper: graceful exit over the final 12% of the ribbon tail
      let tailTaper = 1.0;
      if (s > 0.88) {
        const t = (s - 0.88) / 0.12;
        tailTaper = Math.cos(t * Math.PI * 0.5);
      }

      const halfWidth = (vertebraWidth * 0.5) * headTaper * tailTaper;
      const actualWidth = halfWidth * 2.0;

      // Left / right vertices along true normal
      this._tmpLeft.copy(c).addScaledVector(this._tmpNormal, halfWidth);
      this._tmpRight.copy(c).addScaledVector(this._tmpNormal, -halfWidth);

      // Write positions
      const vIdx = i * 2;
      positions[vIdx * 3 + 0] = this._tmpLeft.x;
      positions[vIdx * 3 + 1] = this._tmpLeft.y;
      positions[vIdx * 3 + 2] = 0.0;

      positions[(vIdx + 1) * 3 + 0] = this._tmpRight.x;
      positions[(vIdx + 1) * 3 + 1] = this._tmpRight.y;
      positions[(vIdx + 1) * 3 + 2] = 0.0;

      // Write aWidth
      if (widths) {
        widths[vIdx] = actualWidth;
        widths[vIdx + 1] = actualWidth;
      }

      // Write vertex colors (seamless organic gradient)
      if (colors) {
        let r = this.baseColor.r;
        let g = this.baseColor.g;
        let b = this.baseColor.b;

        if (isSplitBranch && tailIdx > 0) {
          let factor = 1.0;
          const blendSegs = 8.0;

          // Fork root: smoothly blend from baseColor into secondaryColor
          if (i >= tailIdx - blendSegs) {
            const t = THREE.MathUtils.clamp((tailIdx - i) / blendSegs, 0.0, 1.0);
            factor = Math.min(factor, t * t * (3.0 - 2.0 * t));
          }

          // Merge junction (DRAINING): smoothly blend from secondaryColor back into baseColor
          if (splitState === 'DRAINING' && i <= headIdx + blendSegs) {
            const t = THREE.MathUtils.clamp((i - headIdx) / blendSegs, 0.0, 1.0);
            factor = Math.min(factor, t * t * (3.0 - 2.0 * t));
          }

          r = THREE.MathUtils.lerp(this.baseColor.r, this.secondaryColor.r, factor);
          g = THREE.MathUtils.lerp(this.baseColor.g, this.secondaryColor.g, factor);
          b = THREE.MathUtils.lerp(this.baseColor.b, this.secondaryColor.b, factor);
        }

        colors[vIdx * 3 + 0] = r;
        colors[vIdx * 3 + 1] = g;
        colors[vIdx * 3 + 2] = b;

        colors[(vIdx + 1) * 3 + 0] = r;
        colors[(vIdx + 1) * 3 + 1] = g;
        colors[(vIdx + 1) * 3 + 2] = b;
      }
    }

    posAttr.needsUpdate = true;
    if (widthAttr) widthAttr.needsUpdate = true;
    if (colAttr) colAttr.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.splitGeometry.dispose();
    this.material.dispose();
    this.splitMaterial.dispose();
  }
}
