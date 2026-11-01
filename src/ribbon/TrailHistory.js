import * as THREE from 'three';

/**
 * TrailHistory
 * ------------
 * Maintains fixed-distance immutable vertebrae spine coordinates and historical width buffers
 * for both the primary stroke (Head A) and the split branch (Head B).
 *
 * Core physical invariant:
 *  - Vertebrae 1..N-1 are 100% frozen in world coordinates once committed onto the canvas.
 *  - Segments are committed at fixed spatial intervals (segDist = trailLength / (segments - 1)).
 *  - Prevents stroke length collapse, vertex sliding, and normal shimmering.
 */
export class TrailHistory {
  /**
   * @param {number} segments - number of vertebrae
   * @param {Object} options
   */
  constructor(segments = 64, options = {}) {
    this.segments = segments;
    this.trailLength = options.trailLength ?? 1.5;
    this.fixedPathTrail = options.fixedPathTrail ?? true;

    // Primary Spine & Historical Widths (Head A)
    this.spine = [];
    this.widths = new Float32Array(this.segments);

    // Split Branch Spine & Historical Widths (Head B)
    this.splitSpine = [];
    this.splitWidths = new Float32Array(this.segments);

    // Preallocated Lateral Undulation Offsets (0 allocations during runtime)
    this.lateralOffsetsA = new Float32Array(this.segments);
    this.lateralOffsetsB = new Float32Array(this.segments);

    // Legacy advection buffers (used only if fixedPathTrail is false)
    this._newWidths = new Float32Array(this.segments);
    this._splitNewWidths = new Float32Array(this.segments);
    this.wavePhase = options.phaseOffset ?? 0.0;

    // Fixed-Distance Trail Tracking State
    this.accumDistA = 0.0;
    this.accumDistB = 0.0;
    this.prevHeadAPos = new THREE.Vector2();
    this.prevHeadBPos = new THREE.Vector2();
    this.prevRecordedPosA = new THREE.Vector2();
    this.prevRecordedPosB = new THREE.Vector2();

    // Reusable math scratchpads
    this._tmpHead = new THREE.Vector2();
    this._tmpDir = new THREE.Vector2();

    this._initSpines(options);
  }

  _initSpines(options) {
    const initR = options.pathRadius ?? 0.42;
    const phase = options.phaseOffset ?? 0.0;
    const headPos = new THREE.Vector2(Math.cos(phase) * initR, Math.sin(phase) * initR);
    const heading = phase + Math.PI * 0.5;
    const initDir = new THREE.Vector2(Math.cos(heading), Math.sin(heading));
    const initSegDist = this.trailLength / Math.max(1, this.segments - 1);

    for (let i = 0; i < this.segments; i++) {
      const p = headPos.clone().addScaledVector(initDir, -i * initSegDist);
      this.spine.push(p);
      this.splitSpine.push(p.clone());
    }

    const initW = options.maxWidth ?? 0.08;
    this.widths.fill(initW);
    this.splitWidths.fill(initW);

    this.prevHeadAPos.copy(headPos);
    this.prevHeadBPos.copy(headPos);
    this.prevRecordedPosA.copy(headPos);
    this.prevRecordedPosB.copy(headPos);
  }

  /**
   * Called when a bifurcation / split event begins.
   * Clones current main spine points and clears split branch widths so it emerges cleanly.
   * @param {THREE.Vector2} headB
   */
  onTriggerSplit(headB) {
    for (let i = 0; i < this.segments; i++) {
      this.splitSpine[i].copy(this.spine[i]);
    }
    this.splitWidths.fill(0.0);
    this.accumDistB = 0.0;
    if (headB) {
      this.prevRecordedPosB.copy(headB);
      this.prevHeadBPos.copy(headB);
    }
  }

  /**
   * Clamps historical stroke width buffers to a new ceiling limit in real time.
   * @param {number} limit
   */
  setWidthLimit(limit) {
    for (let i = 0; i < this.segments; i++) {
      if (this.widths[i] > limit) this.widths[i] = limit;
      if (this.splitWidths[i] > limit) this.splitWidths[i] = limit;
    }
  }

  /**
   * Resets vertebrae coordinates along tangent heading and reinitializes history.
   * @param {THREE.Vector2} initialPos
   * @param {number} initialHeading
   * @param {number} trailLength
   * @param {number} initialWidth
   */
  reset(initialPos, initialHeading, trailLength, initialWidth) {
    this.trailLength = trailLength;
    const initDir = new THREE.Vector2(Math.cos(initialHeading), Math.sin(initialHeading));
    const initSegDist = this.trailLength / Math.max(1, this.segments - 1);

    for (let i = 0; i < this.segments; i++) {
      this.spine[i].copy(initialPos).addScaledVector(initDir, -i * initSegDist);
      this.splitSpine[i].copy(this.spine[i]);
      this.widths[i] = initialWidth;
      this.splitWidths[i] = initialWidth;
    }

    this.accumDistA = 0.0;
    this.accumDistB = 0.0;
    this.prevHeadAPos.copy(initialPos);
    this.prevHeadBPos.copy(initialPos);
    this.prevRecordedPosA.copy(initialPos);
    this.prevRecordedPosB.copy(initialPos);
  }

  /**
   * Commits new head positions to the history trail.
   *
   * @param {THREE.Vector2} headA
   * @param {THREE.Vector2} headB
   * @param {number} headWidthA
   * @param {number} headWidthB
   * @param {import('./BifurcationController.js').BifurcationController} bifurcation
   * @param {number} segDist
   * @param {boolean} isFixedPath
   * @param {number} dt
   * @param {number} currentV
   */
  update(headA, headB, headWidthA, headWidthB, bifurcation, segDist, isFixedPath, dt, currentV) {
    if (isFixedPath) {
      // ── Fixed-Distance Immutable History Trail ──
      // Head A history update:
      const dStepA = headA.distanceTo(this.prevHeadAPos);
      this.prevHeadAPos.copy(headA);
      this.accumDistA += dStepA;

      let itersA = 5;
      while (this.accumDistA >= segDist && itersA-- > 0) {
        const t = THREE.MathUtils.clamp(segDist / Math.max(0.00001, this.accumDistA), 0.0, 1.0);
        this._tmpHead.lerpVectors(this.prevRecordedPosA, headA, t);
        this.prevRecordedPosA.copy(this._tmpHead);
        this.accumDistA -= segDist;

        for (let i = this.segments - 1; i > 1; i--) {
          this.spine[i].copy(this.spine[i - 1]);
          this.widths[i] = this.widths[i - 1];
        }
        this.spine[1].copy(this._tmpHead);
        this.widths[1] = headWidthA;
      }
      this.spine[0].copy(headA);
      this.widths[0] = headWidthA;

      // Head B history update:
      const dStepB = headB.distanceTo(this.prevHeadBPos);
      this.prevHeadBPos.copy(headB);
      this.accumDistB += dStepB;

      const isSplitActive = (bifurcation.state !== 'CLOSED');
      if (isSplitActive) {
        bifurcation.splitDistSinceStart += dStepB;
      }

      let itersB = 5;
      while (this.accumDistB >= segDist && itersB-- > 0) {
        const t = THREE.MathUtils.clamp(segDist / Math.max(0.00001, this.accumDistB), 0.0, 1.0);
        this._tmpHead.lerpVectors(this.prevRecordedPosB, headB, t);
        this.prevRecordedPosB.copy(this._tmpHead);
        this.accumDistB -= segDist;

        for (let i = this.segments - 1; i > 1; i--) {
          this.splitSpine[i].copy(this.splitSpine[i - 1]);
          this.splitWidths[i] = this.splitWidths[i - 1];
        }
        this.splitSpine[1].copy(this._tmpHead);
        if (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0) {
          this.splitWidths[1] = 0.0;
        } else {
          this.splitWidths[1] = headWidthB;
        }

        if (bifurcation.state === 'DRAINING') {
          bifurcation.splitDrainSteps++;
          if (bifurcation.splitDrainSteps >= this.segments) {
            bifurcation.completeDrain();
          }
        }
      }

      this.splitSpine[0].copy(headB);
      if (!isSplitActive || (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0)) {
        this.splitWidths[0] = 0.0;
      } else {
        this.splitWidths[0] = headWidthB;
      }

      this.lateralOffsetsA.fill(0.0);
      this.lateralOffsetsB.fill(0.0);
    } else {
      // ── Legacy IK Kinematic Drag Fallback ──
      const substeps = (currentV > 0.45) ? 2 : 1;
      for (let step = 0; step < substeps; step++) {
        for (let i = 1; i < this.segments; i++) {
          const prevA = this.spine[i - 1];
          const currA = this.spine[i];
          this._tmpDir.subVectors(currA, prevA);
          const lenA = this._tmpDir.length();
          if (lenA > 0.0001) {
            this._tmpDir.multiplyScalar(segDist / lenA);
            currA.copy(prevA).add(this._tmpDir);
          } else {
            currA.copy(prevA);
          }

          const prevB = this.splitSpine[i - 1];
          const currB = this.splitSpine[i];
          this._tmpDir.subVectors(currB, prevB);
          const lenB = this._tmpDir.length();
          if (lenB > 0.0001) {
            this._tmpDir.multiplyScalar(segDist / lenB);
            currB.copy(prevB).add(this._tmpDir);
          } else {
            currB.copy(prevB);
          }
        }
      }

      const dStepA = headA.distanceTo(this.prevHeadAPos);
      this.prevHeadAPos.copy(headA);
      const shiftA = (segDist > 0.0001) ? (dStepA / segDist) : 0.0;
      this._advectWidths(this.widths, this._newWidths, headWidthA, shiftA);

      const dStepB = headB.distanceTo(this.prevHeadBPos);
      this.prevHeadBPos.copy(headB);
      const shiftB = (segDist > 0.0001) ? (dStepB / segDist) : 0.0;
      this._advectWidths(this.splitWidths, this._splitNewWidths, headWidthB, shiftB);

      if (bifurcation.state === 'DRAINING') {
        bifurcation.splitDrainSteps += shiftB;
        if (bifurcation.splitDrainSteps >= this.segments) {
          bifurcation.completeDrain();
        }
      }

      if (bifurcation.waveAmp > 0.0001) {
        const waveSpeed = currentV * 11.0 + 0.6;
        this.wavePhase += waveSpeed * dt;
        const speedFactor = THREE.MathUtils.clamp(currentV / 0.35, 0.25, 1.15);
        for (let i = 0; i < this.segments; i++) {
          const s = i / (this.segments - 1);
          const amp = bifurcation.waveAmp * speedFactor * Math.sin(Math.pow(s, 0.85) * Math.PI * 0.5) * (1.0 - 0.22 * s);
          this.lateralOffsetsA[i] = amp * Math.sin(bifurcation.waveFreq * s * Math.PI * 2.0 - this.wavePhase);
          this.lateralOffsetsB[i] = amp * Math.sin(bifurcation.waveFreq * s * Math.PI * 2.0 - (this.wavePhase + 0.35));
        }
      } else {
        this.lateralOffsetsA.fill(0.0);
        this.lateralOffsetsB.fill(0.0);
      }
    }
  }

  _advectWidths(widths, newWidths, headWidth, shift) {
    newWidths[0] = headWidth;
    if (shift > 0.00001) {
      const segs = this.segments;
      for (let i = 1; i < segs; i++) {
        const srcIndex = i - shift;
        if (srcIndex <= 0.0) {
          const alpha = Math.max(0.0, Math.min(1.0, i / Math.max(0.0001, shift)));
          newWidths[i] = THREE.MathUtils.lerp(headWidth, widths[0], alpha);
        } else {
          const k = Math.floor(srcIndex);
          const f = srcIndex - k;
          if (k + 1 < segs) {
            newWidths[i] = THREE.MathUtils.lerp(widths[k], widths[k + 1], f);
          } else {
            newWidths[i] = widths[segs - 1];
          }
        }
      }
    } else {
      for (let i = 1; i < this.segments; i++) {
        newWidths[i] = widths[i];
      }
    }
    widths.set(newWidths);
  }
}
