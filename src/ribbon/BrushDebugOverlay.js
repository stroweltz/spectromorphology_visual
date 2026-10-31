import * as THREE from 'three';

/**
 * BrushDebugOverlay
 * -----------------
 * Renders a debug view directly over the stroke scene showing:
 *  - The spine trail (skeleton) of each FishRibbon as a colored line
 *  - A glowing head dot at the leading vertex
 *  - A velocity arrow indicating direction and speed
 *  - Ghost trail: last N head positions with fading opacity
 *  - Kaleidoscope wedge: the exact sector slice the shader tiles N× to fill the circle
 */
export class BrushDebugOverlay {
  /**
   * @param {THREE.Scene}    scene           – the strokeScene to add helpers into
   * @param {FishRibbon[]}   ribbons         – the live ribbon instances
   * @param {object}         kaleidoUniforms – live uniforms object from kaleidoscopeMaterial
   *   Expected keys: uSectors, uZoom, uRotation
   */
  constructor(scene, ribbons, kaleidoUniforms) {
    this.scene   = scene;
    this.ribbons = ribbons;
    this._ku     = kaleidoUniforms; // live reference — stays in sync automatically

    this.visible = false;

    // Ghost trail history per ribbon
    this._trailLength = 60;
    this._trails = ribbons.map(() => []); // Array<Array<{x, y}>>

    // Colors matching each ribbon's base color
    this._colors = [
      new THREE.Color(0xff6688),  // ribbon 0 – crimson-ish
      new THREE.Color(0x00eeff),  // ribbon 1 – cyan
      new THREE.Color(0xcc88ff),  // ribbon 2 – violet
    ];

    // Build Three.js helpers
    this._spineLines  = this._buildSpineLines();
    this._headDots    = this._buildHeadDots();
    this._arrows      = this._buildArrows();
    this._ghostTrails = this._buildGhostTrails();
    this._wedge       = this._buildKaleidoWedge();
    this._label       = this._buildLabel();

    // Add all to scene (initially hidden)
    this._spineLines.forEach(o  => scene.add(o));
    this._headDots.forEach(o    => scene.add(o));
    this._arrows.forEach(o      => scene.add(o));
    this._ghostTrails.forEach(g => g.forEach(o => scene.add(o)));
    scene.add(this._wedge.fill);
    scene.add(this._wedge.edge1);
    scene.add(this._wedge.edge2);
    scene.add(this._wedge.bisector);
    scene.add(this._wedge.arc);
    scene.add(this._wedge.label);
    scene.add(this._label);

    this.setVisible(false);
  }

  // ─────────────────────── builders ────────────────────────

  _buildSpineLines() {
    return this.ribbons.map((ribbon, idx) => {
      const count    = ribbon.segments;
      const positions = new Float32Array(count * 3);
      const geom     = new THREE.BufferGeometry();
      geom.setAttribute('position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

      const mat = new THREE.LineBasicMaterial({
        color: this._colors[idx] ?? new THREE.Color(0xffffff),
        transparent: true,
        opacity: 0.7,
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

  // ──────────────────── kaleidoscope wedge ─────────────────

  /**
   * Builds the "source wedge" — the pie-slice the kaleidoscope shader
   * reads from the FBO and tiles N× around the circle.
   *
   * Coordinate mapping:
   *   strokeCamera covers world [-0.7, +0.7] on both axes.
   *   FBO UV [0,1] ↔ world:   world = (uv − 0.5) × 1.4
   *   So FBO centre (UV 0.5, 0.5) = world origin (0, 0). ✓
   *
   * The shader folds each pixel's angle θ into the first sector [0, 2π/N],
   * then reads:  sampleUV = (cos θ, sin θ) × r  +  (0.5, 0.5)
   *
   * In world space that is:  sampleWorld = (cos θ, sin θ) × r × 1.4
   * The wedge spans [rotation, rotation + 2π/N] and reaches out to radius R.
   *
   * The dashed bisector at rotation + π/N is the mirror-fold axis (when
   * uMirror is on): both half-wedges are reflections of each other.
   */
  _buildKaleidoWedge() {
    const ARC_STEPS = 80;

    // ── Filled pie (very faint) ───────────────────────────────
    const fillVerts = new Float32Array((ARC_STEPS + 2) * 3);
    const fillGeom  = new THREE.BufferGeometry();
    fillGeom.setAttribute('position',
      new THREE.BufferAttribute(fillVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const fillIdx = [];
    for (let i = 0; i < ARC_STEPS; i++) fillIdx.push(0, i + 1, i + 2);
    fillGeom.setIndex(fillIdx);
    const fillMat  = new THREE.MeshBasicMaterial({
      color: 0xffee44, transparent: true, opacity: 0.04,
      depthTest: false, side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(fillGeom, fillMat);
    fill.renderOrder = 2;

    // ── Helper: build a 2-point line ─────────────────────────
    const makeLine = (color, opacity = 0.9) => {
      const verts = new Float32Array(2 * 3);
      const geom  = new THREE.BufferGeometry();
      geom.setAttribute('position',
        new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthTest: false,
      });
      const line = new THREE.Line(geom, mat);
      line.renderOrder = 12;
      return line;
    };

    const edge1    = makeLine(0xffee44, 0.95);  // first ray  (solid yellow)
    const edge2    = makeLine(0xffee44, 0.95);  // second ray (solid yellow)
    const bisector = makeLine(0xffd700, 0.45);  // mirror axis (dimmer)

    // ── Arc ──────────────────────────────────────────────────
    const arcVerts = new Float32Array((ARC_STEPS + 1) * 3);
    const arcGeom  = new THREE.BufferGeometry();
    arcGeom.setAttribute('position',
      new THREE.BufferAttribute(arcVerts, 3).setUsage(THREE.DynamicDrawUsage));
    const arcMat = new THREE.LineBasicMaterial({
      color: 0xffee44, transparent: true, opacity: 0.65, depthTest: false,
    });
    const arc = new THREE.Line(arcGeom, arcMat);
    arc.renderOrder = 12;

    // ── Text label ────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width  = 400;
    canvas.height = 52;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,10,10,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#ffee44';
    ctx.fillText('◀ этот клин ×N = калейдоскоп', 8, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const labelMat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false,
    });
    const label = new THREE.Sprite(labelMat);
    label.scale.set(0.52, 0.072, 1);
    label.renderOrder = 31;

    return { fill, edge1, edge2, bisector, arc, label, _arcSteps: ARC_STEPS };
  }

  /**
   * Recomputes wedge geometry each frame from live kaleidoscope uniforms.
   *
   * Wedge angles:
   *   start = uRotation
   *   end   = uRotation + 2π / uSectors
   *
   * Radius R (world units):  0.7 / uZoom
   *   – zoom > 1 means the shader "zooms in" → it reads from a smaller
   *     source patch, so the wedge shrinks accordingly.
   *   – zoom < 1 → wedge grows beyond camera extent (clamped to 0.7).
   */
  _updateKaleidoWedge() {
    const w = this._wedge;
    const ku = this._ku;

    const sectors     = Math.max(2, ku.uSectors.value);
    const zoom        = Math.max(0.05, ku.uZoom.value);
    const sectorAngle = (2 * Math.PI) / sectors;
    const halfAngle   = sectorAngle * 0.5;

    // The source wedge in FBO-space is ALWAYS at [0, sectorAngle].
    // uRotation rotates the SCREEN mapping, not the FBO sampling region —
    // so the wedge must NOT follow uRotation.
    const startAngle = 0;

    // Max world radius the FBO can supply = 0.7 (strokeCamera half-extent).
    // With zoom applied: zoom > 1 → shader reads smaller source patch → R shrinks.
    const R = Math.min(0.7, 0.7 / zoom);

    const STEPS = w._arcSteps;

    // ── Fill fan ──────────────────────────────────────────────
    const fp = w.fill.geometry.attributes.position.array;
    fp[0] = 0; fp[1] = 0; fp[2] = 0.03;
    for (let i = 0; i <= STEPS; i++) {
      const angle = startAngle + (i / STEPS) * sectorAngle;
      const vi = (i + 1) * 3;
      fp[vi + 0] = Math.cos(angle) * R;
      fp[vi + 1] = Math.sin(angle) * R;
      fp[vi + 2] = 0.03;
    }
    w.fill.geometry.attributes.position.needsUpdate = true;

    // ── Edge ray 1 (start = angle 0, rightward along +X) ─────
    const e1 = w.edge1.geometry.attributes.position.array;
    e1[0] = 0; e1[1] = 0; e1[2] = 0.04;
    e1[3] = Math.cos(startAngle) * R;
    e1[4] = Math.sin(startAngle) * R;
    e1[5] = 0.04;
    w.edge1.geometry.attributes.position.needsUpdate = true;

    // ── Edge ray 2 (end = sectorAngle) ───────────────────────
    const e2 = w.edge2.geometry.attributes.position.array;
    const a2 = startAngle + sectorAngle;
    e2[0] = 0; e2[1] = 0; e2[2] = 0.04;
    e2[3] = Math.cos(a2) * R;
    e2[4] = Math.sin(a2) * R;
    e2[5] = 0.04;
    w.edge2.geometry.attributes.position.needsUpdate = true;

    // ── Bisector (mirror fold axis at halfAngle) ──────────────
    const ab = startAngle + halfAngle;
    const bs = w.bisector.geometry.attributes.position.array;
    bs[0] = 0; bs[1] = 0; bs[2] = 0.04;
    bs[3] = Math.cos(ab) * R;
    bs[4] = Math.sin(ab) * R;
    bs[5] = 0.04;
    w.bisector.geometry.attributes.position.needsUpdate = true;

    // ── Arc ───────────────────────────────────────────────────
    const ap = w.arc.geometry.attributes.position.array;
    for (let i = 0; i <= STEPS; i++) {
      const angle = startAngle + (i / STEPS) * sectorAngle;
      ap[i * 3 + 0] = Math.cos(angle) * R;
      ap[i * 3 + 1] = Math.sin(angle) * R;
      ap[i * 3 + 2] = 0.04;
    }
    w.arc.geometry.attributes.position.needsUpdate = true;

    // ── Label: float near the arc midpoint ───────────────────
    const midAngle = startAngle + halfAngle;
    const labelR   = Math.min(R * 0.72, 0.62);
    w.label.position.set(
      Math.cos(midAngle) * labelR,
      Math.sin(midAngle) * labelR,
      0.06
    );
  }

  // ─────────────────────── main label ──────────────────────

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

  setVisible(v) {
    this.visible = v;
    this._spineLines.forEach(o  => { o.visible = v; });
    this._headDots.forEach(o    => { o.visible = v; });
    this._arrows.forEach(o      => { o.visible = v; });
    this._ghostTrails.forEach(g => g.forEach(o => { o.visible = v; }));
    this._label.visible             = v;
    this._wedge.fill.visible        = v;
    this._wedge.edge1.visible       = v;
    this._wedge.edge2.visible       = v;
    this._wedge.bisector.visible    = v;
    this._wedge.arc.visible         = v;
    this._wedge.label.visible       = v;
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

    // ── Kaleidoscope wedge ──────────────────────────────────
    this._updateKaleidoWedge();

    // ── Per-ribbon overlays ─────────────────────────────────
    this.ribbons.forEach((ribbon, idx) => {
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
    const all = [
      ...this._spineLines,
      ...this._headDots,
      ...this._arrows,
      ...this._ghostTrails.flat(),
      this._wedge.fill,
      this._wedge.edge1,
      this._wedge.edge2,
      this._wedge.bisector,
      this._wedge.arc,
      this._wedge.label,
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
