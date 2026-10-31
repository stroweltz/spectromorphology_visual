import * as THREE from 'three';

/**
 * BrushDebugOverlay
 * -----------------
 * Renders a debug view directly over the stroke scene showing:
 *  - The spine trail (skeleton) of each FishRibbon as a colored line
 *  - A glowing head dot at the leading vertex
 *  - A velocity arrow indicating direction and speed
 *  - Ghost trail: last N head positions with fading opacity
 *  - Mandala symmetry guides: all N sector rays, base sector highlight,
 *    mirror reflection axes, and boundary ring
 */
export class BrushDebugOverlay {
  /**
   * @param {THREE.Scene}    scene           – the strokeScene to add helpers into
   * @param {FishRibbon[]}   ribbons         – the live ribbon instances
   * @param {object}         kaleidoUniforms – live uniforms object (uSectors, uMirror, uZoom, etc.)
   */
  constructor(scene, ribbons, kaleidoUniforms) {
    this.scene   = scene;
    this.ribbons = ribbons;
    this._ku     = kaleidoUniforms; // live reference

    this.visible = false;
    this._ribbonVisible = ribbons.map(() => true);

    // Ghost trail history per ribbon
    this._trailLength = 80;
    this._trails = ribbons.map(() => []); // Array<Array<{x, y}>>

    // Colors matching each ribbon's base color
    this._colors = [
      new THREE.Color(0xff6688),  // ribbon 0 – crimson
      new THREE.Color(0x00eeff),  // ribbon 1 – cyan
      new THREE.Color(0xcc88ff),  // ribbon 2 – violet
    ];

    // Build Three.js helpers
    this._spineLines     = this._buildSpineLines();
    this._headDots       = this._buildHeadDots();
    this._arrows         = this._buildArrows();
    this._ghostTrails    = this._buildGhostTrails();
    this._mandalaGuides  = this._buildMandalaGuides();
    this._label          = this._buildLabel();

    // Add all to scene (initially hidden)
    this._spineLines.forEach(o  => scene.add(o));
    this._headDots.forEach(o    => scene.add(o));
    this._arrows.forEach(o      => scene.add(o));
    this._ghostTrails.forEach(g => g.forEach(o => scene.add(o)));

    const mg = this._mandalaGuides;
    scene.add(mg.fill);
    scene.add(mg.spokes);
    scene.add(mg.mirrorRays);
    scene.add(mg.baseRays);
    scene.add(mg.ring);
    scene.add(mg.label);

    scene.add(this._label);

    this.setVisible(false);
  }

  // ─────────────────────── builders ────────────────────────

  _buildSpineLines() {
    return this.ribbons.map((ribbon, idx) => {
      const count     = ribbon.segments;
      const positions = new Float32Array(count * 3);
      const geom      = new THREE.BufferGeometry();
      geom.setAttribute('position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

      const mat = new THREE.LineBasicMaterial({
        color: this._colors[idx] ?? new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      });

      const line = new THREE.Line(geom, mat);
      line.renderOrder = 10;
      return line;
    });
  }

  _buildHeadDots() {
    return this.ribbons.map((ribbon, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width  = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const col = this._colors[idx] ?? new THREE.Color(0xffffff);
      const hexStr = '#' + col.getHexString();

      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0,   hexStr);
      grad.addColorStop(0.4, hexStr + 'cc');
      grad.addColorStop(1,   hexStr + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fill();

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.06, 0.06, 1);
      sprite.renderOrder = 20;
      return sprite;
    });
  }

  _buildArrows() {
    return this.ribbons.map(() => {
      const positions = new Float32Array(2 * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 15;
      return line;
    });
  }

  _buildGhostTrails() {
    return this.ribbons.map((ribbon, idx) => {
      const col  = this._colors[idx] ?? new THREE.Color(0xffffff);
      const dots = [];

      for (let t = 0; t < this._trailLength; t++) {
        const canvas = document.createElement('canvas');
        canvas.width  = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#' + col.getHexString();
        ctx.beginPath();
        ctx.arc(8, 8, 6, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
          map: tex, transparent: true, depthTest: false,
          blending: THREE.AdditiveBlending, opacity: 0,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.02, 0.02, 1);
        sprite.renderOrder = 5;
        dots.push(sprite);
      }
      return dots;
    });
  }

  // ──────────────────── mandala symmetry guides ───────────────

  /**
   * Builds the mandala symmetry guide elements:
   *  - Faint filled wedge highlighting Sector 0 (base sector)
   *  - Base sector rays (brighter)
   *  - All sector spokes (radial symmetry axes)
   *  - Mirror bisector rays (reflection axes, if mirror enabled)
   *  - Bounding circle (radius 0.65)
   *  - Status label showing sector count and mirror state
   */
  _buildMandalaGuides() {
    const MAX_SPOKES = 64;
    const CIRCLE_STEPS = 96;

    // 1. Sector 0 highlight fan (faint wedge)
    const fillVerts = new Float32Array((CIRCLE_STEPS + 2) * 3);
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute('position',
      new THREE.BufferAttribute(fillVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const fillIdx = [];
    for (let i = 0; i < CIRCLE_STEPS; i++) fillIdx.push(0, i + 1, i + 2);
    fillGeom.setIndex(fillIdx);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xffee44, transparent: true, opacity: 0.04,
      depthTest: false, side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(fillGeom, fillMat);
    fill.renderOrder = 2;

    // 2. All Sector Spokes (up to 64 rays)
    const spokeVerts = new Float32Array(MAX_SPOKES * 2 * 3);
    const spokeGeom = new THREE.BufferGeometry();
    spokeGeom.setAttribute('position',
      new THREE.BufferAttribute(spokeVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const spokeMat = new THREE.LineBasicMaterial({
      color: 0xffdd44, transparent: true, opacity: 0.35, depthTest: false,
    });
    const spokes = new THREE.LineSegments(spokeGeom, spokeMat);
    spokes.renderOrder = 11;

    // 3. Mirror bisector rays (up to 64 rays)
    const mirrorVerts = new Float32Array(MAX_SPOKES * 2 * 3);
    const mirrorGeom = new THREE.BufferGeometry();
    mirrorGeom.setAttribute('position',
      new THREE.BufferAttribute(mirrorVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const mirrorMat = new THREE.LineBasicMaterial({
      color: 0x66ccff, transparent: true, opacity: 0.3, depthTest: false,
    });
    const mirrorRays = new THREE.LineSegments(mirrorGeom, mirrorMat);
    mirrorRays.renderOrder = 11;

    // 4. Base sector primary rays (start = 0, end = sectorAngle)
    const baseVerts = new Float32Array(4 * 3);
    const baseGeom = new THREE.BufferGeometry();
    baseGeom.setAttribute('position',
      new THREE.BufferAttribute(baseVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const baseMat = new THREE.LineBasicMaterial({
      color: 0xffee44, transparent: true, opacity: 0.85, depthTest: false,
    });
    const baseRays = new THREE.LineSegments(baseGeom, baseMat);
    baseRays.renderOrder = 12;

    // 5. Outer boundary ring
    const ringVerts = new Float32Array((CIRCLE_STEPS + 1) * 3);
    const ringGeom = new THREE.BufferGeometry();
    ringGeom.setAttribute('position',
      new THREE.BufferAttribute(ringVerts, 3).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i <= CIRCLE_STEPS; i++) {
      const a = (i / CIRCLE_STEPS) * Math.PI * 2;
      ringVerts[i * 3 + 0] = Math.cos(a) * 0.65;
      ringVerts[i * 3 + 1] = Math.sin(a) * 0.65;
      ringVerts[i * 3 + 2] = 0.03;
    }
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xffdd44, transparent: true, opacity: 0.25, depthTest: false,
    });
    const ring = new THREE.Line(ringGeom, ringMat);
    ring.renderOrder = 11;

    // 6. Dynamic status label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 64;
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTex, depthTest: false, transparent: true,
    });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(0.65, 0.08, 1);
    label.position.set(0, -0.63, 0.1);
    label.renderOrder = 30;

    return {
      fill,
      spokes,
      mirrorRays,
      baseRays,
      ring,
      label,
      _labelCanvas: labelCanvas,
      _labelTex: labelTex,
      _circleSteps: CIRCLE_STEPS,
      _maxSpokes: MAX_SPOKES,
      _lastSectors: -1,
      _lastMirror: -1,
    };
  }

  /**
   * Recomputes mandala guides from live uniforms.
   */
  _updateMandalaGuides() {
    const mg = this._mandalaGuides;
    const ku = this._ku;

    const sectors = Math.max(2, Math.round(ku.uSectors.value));
    const isMirror = ku.uMirror.value > 0.5;
    const sectorAngle = (Math.PI * 2) / sectors;
    const R = 0.65;

    // 1. Base sector fan (highlight Sector 0)
    const STEPS = Math.min(30, mg._circleSteps);
    const fp = mg.fill.geometry.attributes.position.array;
    fp[0] = 0; fp[1] = 0; fp[2] = 0.02;
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * sectorAngle;
      const vi = (i + 1) * 3;
      fp[vi + 0] = Math.cos(a) * R;
      fp[vi + 1] = Math.sin(a) * R;
      fp[vi + 2] = 0.02;
    }
    mg.fill.geometry.setDrawRange(0, (STEPS + 1) * 3);
    mg.fill.geometry.attributes.position.needsUpdate = true;

    // 2. Base rays (ray at angle 0 and ray at angle sectorAngle)
    const bp = mg.baseRays.geometry.attributes.position.array;
    bp[0] = 0; bp[1] = 0; bp[2] = 0.04;
    bp[3] = R; bp[4] = 0; bp[5] = 0.04;
    bp[6] = 0; bp[7] = 0; bp[8] = 0.04;
    bp[9] = Math.cos(sectorAngle) * R;
    bp[10] = Math.sin(sectorAngle) * R;
    bp[11] = 0.04;
    mg.baseRays.geometry.attributes.position.needsUpdate = true;

    // 3. All sector spokes
    const sp = mg.spokes.geometry.attributes.position.array;
    const activeSpokes = Math.min(sectors, mg._maxSpokes);
    for (let i = 0; i < activeSpokes; i++) {
      const a = i * sectorAngle;
      const vi = i * 6;
      sp[vi + 0] = 0; sp[vi + 1] = 0; sp[vi + 2] = 0.03;
      sp[vi + 3] = Math.cos(a) * R;
      sp[vi + 4] = Math.sin(a) * R;
      sp[vi + 5] = 0.03;
    }
    mg.spokes.geometry.setDrawRange(0, activeSpokes * 2);
    mg.spokes.geometry.attributes.position.needsUpdate = true;

    // 4. Mirror bisector rays
    if (isMirror) {
      mg.mirrorRays.visible = true;
      const mp = mg.mirrorRays.geometry.attributes.position.array;
      for (let i = 0; i < activeSpokes; i++) {
        const a = (i + 0.5) * sectorAngle;
        const vi = i * 6;
        mp[vi + 0] = 0; mp[vi + 1] = 0; mp[vi + 2] = 0.03;
        mp[vi + 3] = Math.cos(a) * R;
        mp[vi + 4] = Math.sin(a) * R;
        mp[vi + 5] = 0.03;
      }
      mg.mirrorRays.geometry.setDrawRange(0, activeSpokes * 2);
      mg.mirrorRays.geometry.attributes.position.needsUpdate = true;
    } else {
      mg.mirrorRays.visible = false;
    }

    // 5. Update label when sector or mirror changes
    if (sectors !== mg._lastSectors || isMirror !== mg._lastMirror) {
      mg._lastSectors = sectors;
      mg._lastMirror = isMirror;
      const ctx = mg._labelCanvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 64);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = '#ffee44';
      ctx.font = 'bold 20px monospace';
      const mirrorText = isMirror ? ' • ЗЕРКАЛЬНО (×2)' : ' • БЕЗ ЗЕРКАЛА';
      ctx.fillText(`✛ МАНДАЛА: ${sectors} СЕКТОРОВ${mirrorText}`, 16, 40);
      mg._labelTex.needsUpdate = true;
    }
  }

  // ─────────────────────── top title label ─────────────────

  _buildLabel() {
    const canvas = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 512, 64);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🖌  РЕЖИМ КИСТИ  |  SPINE  •  HEAD  →  TRAIL', 12, 40);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.7, 0.09, 1);
    sprite.position.set(-0.35, 0.63, 0.5);
    sprite.renderOrder = 30;
    return sprite;
  }

  // ─────────────────────── public API ──────────────────────

  /**
   * Set individual ribbon debug visibility (e.g. for soloing a brush).
   */
  setRibbonVisible(idx, v) {
    if (idx < 0 || idx >= this._ribbonVisible.length) return;
    this._ribbonVisible[idx] = v;
    if (this.visible) {
      this._spineLines[idx].visible = v;
      this._headDots[idx].visible = v;
      this._arrows[idx].visible = v;
      this._ghostTrails[idx].forEach(o => { o.visible = v; });
    }
  }

  setVisible(v) {
    this.visible = v;
    this.ribbons.forEach((_, idx) => {
      const show = v && this._ribbonVisible[idx];
      this._spineLines[idx].visible = show;
      this._headDots[idx].visible   = show;
      this._arrows[idx].visible     = show;
      this._ghostTrails[idx].forEach(o => { o.visible = show; });
    });

    this._label.visible = v;

    const mg = this._mandalaGuides;
    mg.fill.visible     = v;
    mg.spokes.visible   = v;
    mg.mirrorRays.visible = v && (this._ku.uMirror.value > 0.5);
    mg.baseRays.visible = v;
    mg.ring.visible     = v;
    mg.label.visible    = v;
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  /**
   * Call once per frame, after ribbons have been updated.
   */
  update() {
    if (!this.visible) return;

    // ── Update mandala symmetry guides ───────────────────────
    this._updateMandalaGuides();

    // ── Per-ribbon overlays ─────────────────────────────────
    this.ribbons.forEach((ribbon, idx) => {
      if (!this._ribbonVisible[idx]) return;

      const spine = ribbon.spine;   // Array<THREE.Vector2>
      const n     = spine.length;

      // ── 1. Spine line ────────────────────────────────────
      const spinePos = this._spineLines[idx].geometry.attributes.position.array;
      for (let i = 0; i < n; i++) {
        spinePos[i * 3 + 0] = spine[i].x;
        spinePos[i * 3 + 1] = spine[i].y;
        spinePos[i * 3 + 2] = 0.02;
      }
      this._spineLines[idx].geometry.setDrawRange(0, n);
      this._spineLines[idx].geometry.attributes.position.needsUpdate = true;

      // ── 2. Head dot ──────────────────────────────────────
      const head  = spine[0];
      this._headDots[idx].position.set(head.x, head.y, 0.05);
      const pulse = 1.0 + 0.3 * Math.sin(Date.now() * 0.006 + idx * 2.1);
      this._headDots[idx].scale.setScalar(0.07 * pulse);

      // ── 3. Velocity arrow ────────────────────────────────
      const arrowPos = this._arrows[idx].geometry.attributes.position.array;
      const dx = head.x - spine[1].x;
      const dy = head.y - spine[1].y;
      const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const norm = 0.08 / len;
      arrowPos[0] = head.x; arrowPos[1] = head.y; arrowPos[2] = 0.05;
      arrowPos[3] = head.x + dx * norm;
      arrowPos[4] = head.y + dy * norm;
      arrowPos[5] = 0.05;
      this._arrows[idx].geometry.attributes.position.needsUpdate = true;

      // ── 4. Ghost trail ───────────────────────────────────
      const trail = this._trails[idx];
      trail.unshift({ x: head.x, y: head.y });
      if (trail.length > this._trailLength) trail.pop();

      const dots = this._ghostTrails[idx];
      for (let t = 0; t < this._trailLength; t++) {
        const dot = dots[t];
        if (t < trail.length) {
          dot.material.opacity = (1.0 - t / this._trailLength) * 0.65;
          dot.position.set(trail[t].x, trail[t].y, 0.01);
          dot.scale.setScalar(0.015 * (1 - (t / this._trailLength) * 0.7));
        } else {
          dot.material.opacity = 0;
        }
      }
    });
  }

  dispose() {
    const mg = this._mandalaGuides;
    const all = [
      ...this._spineLines,
      ...this._headDots,
      ...this._arrows,
      ...this._ghostTrails.flat(),
      mg.fill,
      mg.spokes,
      mg.mirrorRays,
      mg.baseRays,
      mg.ring,
      mg.label,
      this._label,
    ];
    all.forEach(o => {
      this.scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
