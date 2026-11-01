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
    this.tangentsA = [];

    // Split Branch Spine & Live Widths for Mesh (Head B)
    this.splitSpine = [];
    this.splitWidths = new Float32Array(this.segments);
    this.tangentsB = [];

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
    this._lastStepStartA = new THREE.Vector2();
    this._lastStepStartB = new THREE.Vector2();
    this.prevRecordedPosA = new THREE.Vector2();
    this.prevRecordedPosB = new THREE.Vector2();

    // Reusable math scratchpads
    this._tmpHead = new THREE.Vector2();
    this._tmpDir = new THREE.Vector2();
    this._forwardPtA = new THREE.Vector2();
    this._forwardPtB = new THREE.Vector2();

    this._initSpines(options, initialWidth);
  }

  get tangents() {
    return this.tangentsA;
  }

  get splitTangents() {
    return this.tangentsB;
  }

  _initSpines(options, initialWidth) {
    const initR = options.pathRadius ?? 0.42;
    const phase = options.phaseOffset ?? 0.0;
    const headPos = new THREE.Vector2(Math.cos(phase) * initR, Math.sin(phase) * initR);
    const heading = phase + Math.PI * 0.5;
    const initDir = new THREE.Vector2(Math.cos(heading), Math.sin(heading));
    const backDir = new THREE.Vector2(-initDir.x, -initDir.y);
    const initSegDist = this.trailLength / Math.max(1, this.segments - 1);
    const initW = (initialWidth !== null && initialWidth !== undefined) ? initialWidth : (options.maxWidth ?? 0.08);

    this.spine = [];
    this.splitSpine = [];
    this.tangentsA = [];
    this.tangentsB = [];

    for (let i = 0; i < this.segments; i++) {
      const p = headPos.clone().addScaledVector(initDir, -i * initSegDist);
      this.spine.push(p);
      this.splitSpine.push(p.clone());
      this.tangentsA.push(backDir.clone());
      this.tangentsB.push(backDir.clone());
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
    this._lastStepStartA.copy(headPos);
    this._lastStepStartB.copy(headPos);
    this.prevRecordedPosA.copy(headPos);
    this.prevRecordedPosB.copy(headPos);
  }

  /**
   * Evaluates a 2D Catmull-Rom / Cardinal spline position and analytical normalized tangent
   * at parameter t in [0, 1].
   *
   * The curve passes through p1 at t=0 and p2 at t=1, with C^1 continuous derivative.
   * Analytical tangents eliminate central-difference wobble on sharp corners and boundary pops at tails.
   *
   * @param {THREE.Vector2} p0
   * @param {THREE.Vector2} p1
   * @param {THREE.Vector2} p2
   * @param {THREE.Vector2} p3
   * @param {number} t
   * @param {THREE.Vector2} outPos
   * @param {THREE.Vector2} [outTangent]
   * @param {number} [tension=0.0] - 0.0 = standard Catmull-Rom
   */
  _evalSpline(p0, p1, p2, p3, t, outPos, outTangent = null, tension = 0.0) {
    const s = (1.0 - tension) * 0.5;
    const t2 = t * t;
    const t3 = t2 * t;

    const a0 = -s * t3 + 2.0 * s * t2 - s * t;
    const a1 = (2.0 - s) * t3 + (s - 3.0) * t2 + 1.0;
    const a2 = (s - 2.0) * t3 + (3.0 - 2.0 * s) * t2 + s * t;
    const a3 = s * t3 - s * t2;

    outPos.x = a0 * p0.x + a1 * p1.x + a2 * p2.x + a3 * p3.x;
    outPos.y = a0 * p0.y + a1 * p1.y + a2 * p2.y + a3 * p3.y;

    if (outTangent) {
      const da0 = -3.0 * s * t2 + 4.0 * s * t - s;
      const da1 = 3.0 * (2.0 - s) * t2 + 2.0 * (s - 3.0) * t;
      const da2 = 3.0 * (s - 2.0) * t2 + 2.0 * (3.0 - 2.0 * s) * t + s;
      const da3 = 3.0 * s * t2 - 2.0 * s * t;

      const tx = da0 * p0.x + da1 * p1.x + da2 * p2.x + da3 * p3.x;
      const ty = da0 * p0.y + da1 * p1.y + da2 * p2.y + da3 * p3.y;

      const len = Math.hypot(tx, ty);
      if (len > 0.00001) {
        // Oriented backwards along spine from head towards tail (matches -heading)
        outTangent.x = -tx / len;
        outTangent.y = -ty / len;
      } else {
        outTangent.x = -(p2.x - p1.x);
        outTangent.y = -(p2.y - p1.y);
        const l2 = Math.hypot(outTangent.x, outTangent.y);
        if (l2 > 0.00001) {
          outTangent.x /= l2;
          outTangent.y /= l2;
        }
      }
    }
  }

  /**
   * Called when a bifurcation / split event begins.
   * Clones current main milestones and clears split branch widths so it emerges cleanly.
   * @param {THREE.Vector2} headB
   */
  onTriggerSplit(headB) {
    for (let i = 0; i < this.segments; i++) {
      this.splitSpine[i].copy(this.spine[i]);
      this.tangentsB[i].copy(this.tangentsA[i]);
      this.splitWidths[i] = 0.0;
    }
    for (let i = 0; i < this._historyCap; i++) {
      this._historyB[i].copy(this._historyA[i]);
      this._historyWidthsB[i] = 0.0;
    }
    this.accumDistB = this.accumDistA;
    if (headB) {
      this.prevRecordedPosB.copy(headB);
      this.prevHeadBPos.copy(headB);
      this._lastStepStartB.copy(headB);
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
    const backDir = new THREE.Vector2(-initDir.x, -initDir.y);
    const initSegDist = this.trailLength / Math.max(1, this.segments - 1);

    for (let i = 0; i < this.segments; i++) {
      this.spine[i].copy(initialPos).addScaledVector(initDir, -i * initSegDist);
      this.splitSpine[i].copy(this.spine[i]);
      this.tangentsA[i].copy(backDir);
      this.tangentsB[i].copy(backDir);
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
    this._lastStepStartA.copy(initialPos);
    this._lastStepStartB.copy(initialPos);
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
   * @param {number} [headingAngle=0.0]
   */
  update(headA, headB, headWidthA, headWidthB, bifurcation, segDist, isFixedPath, dt, currentV, headingAngle = 0.0) {
    if (isFixedPath) {
      // ── 1. Accumulate Head A Distance & Commit Milestones ──
      // Commits milestones along the exact frame-to-frame movement segment to eliminate chord-cutting faceting
      const dStepA = headA.distanceTo(this.prevHeadAPos);
      let stepRemA = dStepA;
      this._lastStepStartA.copy(this.prevHeadAPos);
      this.prevHeadAPos.copy(headA);

      let itersA = 8;
      while (this.accumDistA + stepRemA >= segDist && itersA-- > 0) {
        this.shiftCountA++;
        const needed = segDist - this.accumDistA;
        const frac = (stepRemA > 0.00001) ? THREE.MathUtils.clamp(needed / stepRemA, 0.0, 1.0) : 0.0;

        this._tmpHead.lerpVectors(this._lastStepStartA, headA, frac);

        for (let m = this._historyCap - 1; m > 0; m--) {
          this._historyA[m].copy(this._historyA[m - 1]);
          this._historyWidthsA[m] = this._historyWidthsA[m - 1];
        }
        this._historyA[0].copy(this._tmpHead);
        this._historyWidthsA[0] = headWidthA;

        this.accumDistA = 0.0;
        stepRemA -= needed;
        this._lastStepStartA.copy(this._tmpHead);
      }
      this.accumDistA += stepRemA;

      // ── 2. Continuous Sub-Segment Sliding along Spline for Head A ──
      const alphaA = THREE.MathUtils.clamp(this.accumDistA / Math.max(0.00001, segDist), 0.0, 1.0);

      // Forward extrapolation point ahead of head along exact kinematic heading
      this._tmpDir.set(Math.cos(headingAngle), Math.sin(headingAngle));
      this._forwardPtA.copy(headA).addScaledVector(this._tmpDir, segDist - this.accumDistA);

      this.spine[0].copy(headA);
      this.widths[0] = headWidthA;
      this.tangentsA[0].set(-this._tmpDir.x, -this._tmpDir.y);

      // Vertebrae 1..N-1: Each vertebra i is uniformly spaced at i * segDist behind head,
      // sliding continuously between milestone H_i and H_{i-1} with parameter alphaA.
      for (let i = 1; i < this.segments; i++) {
        const p1 = this._historyA[i];
        const p2 = this._historyA[i - 1];
        const p0 = (i + 1 < this._historyCap) ? this._historyA[i + 1] : this._historyA[i];
        const p3 = (i - 2 >= 0) ? this._historyA[i - 2] : this._forwardPtA;

        this._evalSpline(p0, p1, p2, p3, alphaA, this.spine[i], this.tangentsA[i], 0.0);
        this.widths[i] = THREE.MathUtils.lerp(this._historyWidthsA[i], this._historyWidthsA[i - 1], alphaA);
      }

      // ── 3. Accumulate Head B Distance & Commit Milestones ──
      const dStepB = headB.distanceTo(this.prevHeadBPos);
      let stepRemB = dStepB;
      this._lastStepStartB.copy(this.prevHeadBPos);
      this.prevHeadBPos.copy(headB);

      const isSplitActive = (bifurcation.state !== 'CLOSED');
      if (isSplitActive) {
        bifurcation.splitDistSinceStart += dStepB;
      }

      let itersB = 8;
      while (this.accumDistB + stepRemB >= segDist && itersB-- > 0) {
        this.shiftCountB++;
        const needed = segDist - this.accumDistB;
        const frac = (stepRemB > 0.00001) ? THREE.MathUtils.clamp(needed / stepRemB, 0.0, 1.0) : 0.0;

        this._tmpHead.lerpVectors(this._lastStepStartB, headB, frac);

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

        this.accumDistB = 0.0;
        stepRemB -= needed;
        this._lastStepStartB.copy(this._tmpHead);
      }
      this.accumDistB += stepRemB;

      // ── 4. Continuous Sub-Segment Sliding along Spline for Head B ──
      const alphaB = THREE.MathUtils.clamp(this.accumDistB / Math.max(0.00001, segDist), 0.0, 1.0);

      this._tmpDir.set(Math.cos(headingAngle), Math.sin(headingAngle));
      this._forwardPtB.copy(headB).addScaledVector(this._tmpDir, segDist - this.accumDistB);

      this.splitSpine[0].copy(headB);
      this.tangentsB[0].set(-this._tmpDir.x, -this._tmpDir.y);
      if (!isSplitActive || (bifurcation.state === 'DRAINING' && bifurcation.splitDrainSteps > 0)) {
        this.splitWidths[0] = 0.0;
      } else {
        this.splitWidths[0] = headWidthB;
      }

      for (let i = 1; i < this.segments; i++) {
        const p1 = this._historyB[i];
        const p2 = this._historyB[i - 1];
        const p0 = (i + 1 < this._historyCap) ? this._historyB[i + 1] : this._historyB[i];
        const p3 = (i - 2 >= 0) ? this._historyB[i - 2] : this._forwardPtB;

        this._evalSpline(p0, p1, p2, p3, alphaB, this.splitSpine[i], this.tangentsB[i], 0.0);
        this.splitWidths[i] = THREE.MathUtils.lerp(this._historyWidthsB[i], this._historyWidthsB[i - 1], alphaB);
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

      for (let i = 0; i < this.segments; i++) {
        if (i === 0) {
          this.tangentsA[0].set(-Math.cos(headingAngle), -Math.sin(headingAngle));
          this.tangentsB[0].set(-Math.cos(headingAngle), -Math.sin(headingAngle));
        } else if (i === this.segments - 1) {
          this.tangentsA[i].subVectors(this.spine[i], this.spine[i - 1]).normalize();
          this.tangentsB[i].subVectors(this.splitSpine[i], this.splitSpine[i - 1]).normalize();
        } else {
          this.tangentsA[i].subVectors(this.spine[i + 1], this.spine[i - 1]).normalize();
          this.tangentsB[i].subVectors(this.splitSpine[i + 1], this.splitSpine[i - 1]).normalize();
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
