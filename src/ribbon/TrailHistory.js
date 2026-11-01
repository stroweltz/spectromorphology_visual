import * as THREE from 'three';

/**
 * TrailHistory
 * ------------
 * Maintains fixed-distance immutable vertebrae spine milestones and historical width buffers
 * for both the primary stroke (Head A) and the split branch (Head B).
 *
 * Catmull-Rom Sub-Segment Continuous Sliding:
 *  - Fixed milestones (H_0, H_1, ...) are committed at exact arc-length intervals segDist.
 *  - Every frame at 60 FPS, all N vertebrae are evaluated along a C^1 continuous Catmull-Rom
 *    spline with fractional offset alpha = accumDist / segDist.
 *  - Guarantees 60 FPS silky smooth motion even at ultra-low speeds without stepping stutter,
 *    and completely eliminates normal wobble / angle pops across segment boundaries.
 */
export class TrailHistory {
  /**
   * @param {number} segments - number of vertebrae
   * @param {Object} options
   * @param {number} [initialWidth]
   */
  constructor(segments = 64, options = {}, initialWidth = null) {
    this.segments = segments;
    this.trailLength = options.trailLength ?? 1.5;
    this.fixedPathTrail = options.fixedPathTrail ?? true;

    // Primary Spine & Live Widths for Mesh (Head A)
    this.spine = [];
    this.widths = new Float32Array(this.segments);

    // Split Branch Spine & Live Widths for Mesh (Head B)
    this.splitSpine = [];
    this.splitWidths = new Float32Array(this.segments);

    // Preallocated Lateral Undulation Offsets (0 allocations during runtime)
    this.lateralOffsetsA = new Float32Array(this.segments);
    this.lateralOffsetsB = new Float32Array(this.segments);

    // Milestone History Buffers (immutable world-space path anchors)
    this._historyCap = this.segments + 6;
    this._historyA = [];
    this._historyB = [];
    this._historyWidthsA = new Float32Array(this._historyCap);
    this._historyWidthsB = new Float32Array(this._historyCap);

    for (let i = 0; i < this._historyCap; i++) {
      this._historyA.push(new THREE.Vector2());
      this._historyB.push(new THREE.Vector2());
    }

    // Legacy advection buffers (used only if fixedPathTrail is false)
    this._newWidths = new Float32Array(this.segments);
    this._splitNewWidths = new Float32Array(this.segments);
    this.wavePhase = options.phaseOffset ?? 0.0;

    // Fixed-Distance Trail Tracking State
    this.accumDistA = 0.0;
    this.accumDistB = 0.0;
    this.shiftCountA = 0;
    this.shiftCountB = 0;
    this.prevHeadAPos = new THREE.Vector2();
    this.prevHeadBPos = new THREE.Vector2();
    this.prevRecordedPosA = new THREE.Vector2();
    this.prevRecordedPosB = new THREE.Vector2();

    // Reusable math scratchpads
    this._tmpHead = new THREE.Vector2();
    this._tmpDir = new THREE.Vector2();
    this._forwardPtA = new THREE.Vector2();
    this._forwardPtB = new THREE.Vector2();

    this._initSpines(options, initialWidth);
  }

  _initSpines(options, initialWidth) {
    const initR = options.pathRadius ?? 0.42;
    const phase = options.phaseOffset ?? 0.0;
    const headPos = new THREE.Vector2(Math.cos(phase) * initR, Math.sin(phase) * initR);
    const heading = phase + Math.PI * 0.5;
    const initDir = new THREE.Vector2(Math.cos(heading), Math.sin(heading));
    const initSegDist = this.trailLength / Math.max(1, this.segments - 1);
    const initW = (initialWidth !== null && initialWidth !== undefined) ? initialWidth : (options.maxWidth ?? 0.08);

    for (let i = 0; i < this.segments; i++) {
      const p = headPos.clone().addScaledVector(initDir, -i * initSegDist);
      this.spine.push(p);
      this.splitSpine.push(p.clone());
      this.widths[i] = initW;
      this.splitWidths[i] = initW;
    }

    for (let i = 0; i < this._historyCap; i++) {
      const p = headPos.clone().addScaledVector(initDir, -i * initSegDist);
      this._historyA[i].copy(p);
      this._historyB[i].copy(p);
      this._historyWidthsA[i] = initW;
      this._historyWidthsB[i] = initW;
    }

    this.prevHeadAPos.copy(headPos);
    this.prevHeadBPos.copy(headPos);
    this.prevRecordedPosA.copy(headPos);
    this.prevRecordedPosB.copy(headPos);
  }

  /**
   * Evaluates a 2D Catmull-Rom spline at parameter t in [0, 1].
   * The curve passes through p1 at t=0 and p2 at t=1, with C^1 continuous derivative.
   */
  _evalCatmullRom(p0, p1, p2, p3, t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    const a0 = -0.5 * t3 + t2 - 0.5 * t;
    const a1 =  1.5 * t3 - 2.5 * t2 + 1.0;
    const a2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const a3 =  0.5 * t3 - 0.5 * t2;
    out.x = a0 * p0.x + a1 * p1.x + a2 * p2.x + a3 * p3.x;
    out.y = a0 * p0.y + a1 * p1.y + a2 * p2.y + a3 * p3.y;
  }

  /**
   * Called when a bifurcation / split event begins.
   * Clones current main milestones and clears split branch widths so it emerges cleanly.
   * @param {THREE.Vector2} headB
   */
  onTriggerSplit(headB) {
    for (let i = 0; i < this.segments; i++) {
      this.splitSpine[i].copy(this.spine[i]);
      this.splitWidths[i] = 0.0;
    }
    for (let i = 0; i < this._historyCap; i++) {
      this._historyB[i].copy(this._historyA[i]);
      this._historyWidthsB[i] = 0.0;
    }
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
    for (let i = 0; i < this._historyCap; i++) {
      if (this._historyWidthsA[i] > limit) this._historyWidthsA[i] = limit;
      if (this._historyWidthsB[i] > limit) this._historyWidthsB[i] = limit;
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

    for (let i = 0; i < this._historyCap; i++) {
      const p = initialPos.clone().addScaledVector(initDir, -i * initSegDist);
      this._historyA[i].copy(p);
      this._historyB[i].copy(p);
      this._historyWidthsA[i] = initialWidth;
      this._historyWidthsB[i] = initialWidth;
    }

    this.accumDistA = 0.0;
    this.accumDistB = 0.0;
    this.prevHeadAPos.copy(initialPos);
    this.prevHeadBPos.copy(initialPos);
    this.prevRecordedPosA.copy(initialPos);
    this.prevRecordedPosB.copy(initialPos);
  }

  /**
   * Commits new head positions to the history trail and evaluates continuous Catmull-Rom sliding.
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
      // ── 1. Accumulate Head A Distance & Commit Milestones ──
      const dStepA = headA.distanceTo(this.prevHeadAPos);
      this.prevHeadAPos.copy(headA);
      this.accumDistA += dStepA;

      let itersA = 8;
      while (this.accumDistA >= segDist && itersA-- > 0) {
        this.shiftCountA++;
        const t = THREE.MathUtils.clamp(segDist / Math.max(0.00001, this.accumDistA), 0.0, 1.0);
        this._tmpHead.lerpVectors(this.prevRecordedPosA, headA, t);
        this.prevRecordedPosA.copy(this._tmpHead);
        this.accumDistA -= segDist;

        for (let m = this._historyCap - 1; m > 0; m--) {
          this._historyA[m].copy(this._historyA[m - 1]);
          this._historyWidthsA[m] = this._historyWidthsA[m - 1];
        }
        this._historyA[0].copy(this._tmpHead);
        this._historyWidthsA[0] = headWidthA;
      }

      // ── 2. Continuous Sub-Segment Sliding along Catmull-Rom Spline for Head A ──
      const alphaA = THREE.MathUtils.clamp(this.accumDistA / Math.max(0.00001, segDist), 0.0, 1.0);

      // Forward extrapolation point ahead of head along direction
      this._tmpDir.subVectors(headA, this._historyA[0]);
      const lenDirA = this._tmpDir.length();
      if (lenDirA > 0.00001) {
        this._forwardPtA.copy(headA).addScaledVector(this._tmpDir, segDist / lenDirA);
      } else {
        this._forwardPtA.copy(headA);
      }

      this.spine[0].copy(headA);
      this.widths[0] = headWidthA;

      for (let i = 1; i < this.segments; i++) {
        if (i === 1) {
          // Between Milestone 0 and headA
          const p0 = this._historyA[1];
          const p1 = this._historyA[0];
          const p2 = headA;
          const p3 = this._forwardPtA;
          this._evalCatmullRom(p0, p1, p2, p3, alphaA, this.spine[1]);
          this.widths[1] = THREE.MathUtils.lerp(this._historyWidthsA[0], headWidthA, alphaA);
        } else {
          const k = i - 1;
          const p0 = this._historyA[k + 1];
          const p1 = this._historyA[k];
          const p2 = this._historyA[k - 1];
          const p3 = (k - 2 >= 0) ? this._historyA[k - 2] : headA;
          this._evalCatmullRom(p0, p1, p2, p3, alphaA, this.spine[i]);
          this.widths[i] = THREE.MathUtils.lerp(this._historyWidthsA[k], this._historyWidthsA[k - 1], alphaA);
        }
      }

      // ── 3. Accumulate Head B Distance & Commit Milestones ──
      const dStepB = headB.distanceTo(this.prevHeadBPos);
      this.prevHeadBPos.copy(headB);
      this.accumDistB += dStepB;

      const isSplitActive = (bifurcation.state !== 'CLOSED');
      if (isSplitActive) {
        bifurcation.splitDistSinceStart += dStepB;
      }

      let itersB = 8;
      while (this.accumDistB >= segDist && itersB-- > 0) {
        this.shiftCountB++;
        const t = THREE.MathUtils.clamp(segDist / Math.max(0.00001, this.accumDistB), 0.0, 1.0);
        this._tmpHead.lerpVectors(this.prevRecordedPosB, headB, t);
        this.prevRecordedPosB.copy(this._tmpHead);
        this.accumDistB -= segDist;

        for (let m = this._historyCap - 1; m > 0; m--) {
          this._historyB[m].copy(this._historyB[m - 1]);
          this._historyWidthsB[m] = this._historyWidthsB[m - 1];
        }
        this._historyB[0].copy(this._tmpHead);

        if (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0) {
          this._historyWidthsB[0] = 0.0;
        } else {
          this._historyWidthsB[0] = headWidthB;
        }

        if (bifurcation.state === 'DRAINING') {
          bifurcation.splitDrainSteps++;
          if (bifurcation.splitDrainSteps >= this.segments) {
            bifurcation.completeDrain();
          }
        }
      }

      // ── 4. Continuous Sub-Segment Sliding along Catmull-Rom Spline for Head B ──
      const alphaB = THREE.MathUtils.clamp(this.accumDistB / Math.max(0.00001, segDist), 0.0, 1.0);

      this._tmpDir.subVectors(headB, this._historyB[0]);
      const lenDirB = this._tmpDir.length();
      if (lenDirB > 0.00001) {
        this._forwardPtB.copy(headB).addScaledVector(this._tmpDir, segDist / lenDirB);
      } else {
        this._forwardPtB.copy(headB);
      }

      this.splitSpine[0].copy(headB);
      if (!isSplitActive || (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0)) {
        this.splitWidths[0] = 0.0;
      } else {
        this.splitWidths[0] = headWidthB;
      }

      for (let i = 1; i < this.segments; i++) {
        if (i === 1) {
          const p0 = this._historyB[1];
          const p1 = this._historyB[0];
          const p2 = headB;
          const p3 = this._forwardPtB;
          this._evalCatmullRom(p0, p1, p2, p3, alphaB, this.splitSpine[1]);
          const targetW = (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0) ? 0.0 : headWidthB;
          this.splitWidths[1] = THREE.MathUtils.lerp(this._historyWidthsB[0], targetW, alphaB);
        } else {
          const k = i - 1;
          const p0 = this._historyB[k + 1];
          const p1 = this._historyB[k];
          const p2 = this._historyB[k - 1];
          const p3 = (k - 2 >= 0) ? this._historyB[k - 2] : headB;
          this._evalCatmullRom(p0, p1, p2, p3, alphaB, this.splitSpine[i]);
          this.splitWidths[i] = THREE.MathUtils.lerp(this._historyWidthsB[k], this._historyWidthsB[k - 1], alphaB);
        }
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
