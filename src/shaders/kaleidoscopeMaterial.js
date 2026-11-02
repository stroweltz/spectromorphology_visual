import * as THREE from 'three';

export function createKaleidoscopeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uSectors: { value: 8.0 },         // kept for GUI / debug overlay reads
      uRotation: { value: 0.0 },
      uZoom: { value: 1.0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uSampleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uStrokeScale: { value: 0.7 / 1.05 }, // maps screen space to tightly fitted FBO UV
      uMirror: { value: 1.0 },             // kept for GUI reads
      uBgType: { value: 1.0 },             // 0: solid, 1: radial, 2: nebula (default), 3: waves, 4: aurora
      uBgInner: { value: new THREE.Color(0x0c0e14) }, // deep midnight indigo
      uBgOuter: { value: new THREE.Color(0x000000) }, // pitch black
      uBgAccent: { value: new THREE.Color(0x160a22) }, // deep velvet plum
      uNebulaSpeed: { value: 0.25 },
      uNebulaIntensity: { value: 0.55 },
      uNebulaScale: { value: 1.4 },
      // Precomputed CPU blob centers (eliminates millions of trigonometric calls in fragment shader)
      uBlob1: { value: new THREE.Vector2() },
      uBlob2: { value: new THREE.Vector2() },
      uBlob3: { value: new THREE.Vector2() },
      uBlob4: { value: new THREE.Vector2() },
      uBreath: { value: 1.0 },
      uVignette: { value: 0.75 },
      uDropShadow: { value: 0.50 }, // 3D ambient shadow cast by mandala onto background
      uAspect: { value: 1.0 },
      uFilmGrain: { value: 0.0 },
      uTime: { value: 0.0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;

      uniform sampler2D tDiffuse;
      uniform float uRotation;
      uniform float uZoom;
      uniform vec2 uCenter;
      uniform vec2 uSampleCenter;
      uniform float uStrokeScale;
      uniform float uBgType;
      uniform vec3 uBgInner;
      uniform vec3 uBgOuter;
      uniform vec3 uBgAccent;
      uniform float uNebulaSpeed;
      uniform float uNebulaIntensity;
      uniform float uNebulaScale;
      uniform vec2 uBlob1;
      uniform vec2 uBlob2;
      uniform vec2 uBlob3;
      uniform vec2 uBlob4;
      uniform float uBreath;
      uniform float uVignette;
      uniform float uDropShadow;
      uniform float uAspect;
      uniform float uFilmGrain;
      uniform float uTime;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        // ── Mandala display mode ────────────────────────────────
        // The FBO contains the full mandala pattern
        // (ribbons are instanced N× with rotations + optional mirror).
        // This shader maps the square FBO to screen with
        // aspect correction, rotation, zoom, background & vignette.

        // Aspect-correct coordinates centred on screen
        vec2 p = vUv - uCenter;
        p.x *= uAspect;       // circle in FBO maps to circle on screen

        // Rotation (spins the whole mandala)
        float c = cos(uRotation);
        float s = sin(uRotation);
        p = mat2(c, s, -s, c) * p;

        // Zoom (> 1 zooms in, < 1 zooms out)
        p *= uZoom;

        // Map to expanded FBO UV coordinates
        vec2 sampleUV = p * uStrokeScale + uSampleCenter;

        // Sample stroke buffer
        vec4 stroke = texture2D(tDiffuse, sampleUV);

        // Discard out-of-bounds samples to avoid clamp artefacts
        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
            sampleUV.y < 0.0 || sampleUV.y > 1.0) {
          stroke = vec4(0.0);
        }

        // ── Background Generation ─────────────────────────────
        vec3 bg = uBgOuter;

        if (uBgType > 0.5) {
          vec2 pBg = (vUv - uCenter) * vec2(uAspect, 1.0);
          float distSq = dot(pBg, pBg);
          float dist = sqrt(distSq);

          if (uBgType < 1.5) {
            // Mode 1: Classic Soft Radial
            float gradDist = dist * 1.4;
            bg = mix(uBgInner, uBgOuter, smoothstep(0.0, 1.0, gradDist));

          } else if (uBgType < 2.5) {
            // Mode 2: Deep Ambient Nebula (Дыхание Бездны)
            // Ultra-optimized analytical Gaussian metablobs: zero trigonometric operations in fragment shader
            float scale = max(0.3, uNebulaScale);
            float invS2 = 1.0 / (scale * scale);

            vec2 d1 = pBg - uBlob1;
            float b1 = exp(-dot(d1, d1) * (2.4 * invS2));

            vec2 d2 = pBg - uBlob2;
            float b2 = exp(-dot(d2, d2) * (2.8 * invS2));

            vec2 d3 = pBg - uBlob3;
            float b3 = exp(-dot(d3, d3) * (4.0 * invS2)) * uBreath;

            vec2 d4 = pBg - uBlob4;
            float b4 = exp(-dot(d4, d4) * (3.2 * invS2));

            // Ultra-soft radial falloff towards screen borders
            float outerFalloff = smoothstep(1.35, 0.25, dist);

            // Blend primary and accent glows
            vec3 glow1 = uBgInner * (b1 * 0.8 + b3 * 0.5);
            vec3 glow2 = uBgAccent * (b2 * 0.85 + b4 * 0.45);
            vec3 nebula = (glow1 + glow2) * outerFalloff * uNebulaIntensity;

            bg = uBgOuter + nebula;

          } else if (uBgType < 3.5) {
            // Mode 3: Cyclic Dark Waves (Пульс волн)
            float t = uTime * uNebulaSpeed * 1.5;
            float waveDist = dist * 7.0 / max(0.3, uNebulaScale);
            float w1 = sin(waveDist - t);
            float w2 = sin(waveDist * 1.4 - t * 0.75 + 1.3);
            float waveMix = smoothstep(-0.6, 0.8, w1 * 0.6 + w2 * 0.4);
            
            float ringFalloff = smoothstep(1.25, 0.2, dist);
            float pulse = waveMix * ringFalloff * uNebulaIntensity;

            vec3 waveColor = mix(uBgInner, uBgAccent, sin(dist * 3.5 - t * 0.5) * 0.5 + 0.5);
            bg = mix(uBgOuter, waveColor, pulse * 0.65);

          } else {
            // Mode 4: Aurora Veil (Северное сияние)
            float t = uTime * uNebulaSpeed * 0.75;
            float cury = pBg.y + sin(pBg.x * 2.6 + t) * 0.16 * uNebulaScale;
            float band1 = exp(-cury * cury * 6.5);
            float band2 = exp(-(cury + 0.32) * (cury + 0.32) * 5.5);

            float auroraMask = smoothstep(1.35, 0.3, dist);
            vec3 aurora = (uBgInner * band1 + uBgAccent * band2 * 0.75) * auroraMask * uNebulaIntensity * 0.7;
            bg = uBgOuter + aurora;
          }
        }

        // ── 3D Ambient Drop Shadow onto Background Canvas ──
        if (uDropShadow > 0.001) {
          // Soft 2-tap directional contact shadow (offset slightly down-right in UV)
          vec2 shadowOff = vec2(0.0035, -0.0035) * (uStrokeScale * 1.5);
          float sA1 = texture2D(tDiffuse, sampleUV - shadowOff).a;
          float sA2 = texture2D(tDiffuse, sampleUV - shadowOff * 1.7).a;
          float shadowAlpha = clamp(sA1 * 0.65 + sA2 * 0.35, 0.0, 1.0);

          // Shadow only dims background pixels outside the stroke itself
          float shadowDarken = shadowAlpha * (1.0 - stroke.a) * (uDropShadow * 0.65);
          bg *= (1.0 - shadowDarken);
        }

        // Composite strokes over dark background
        vec3 finalColor = mix(bg, stroke.rgb, stroke.a);

        // Vignette
        float vig = length((vUv - 0.5) * vec2(uAspect, 1.0));
        vig = smoothstep(1.1, 0.4, vig);
        finalColor *= mix(1.0, vig, uVignette);

        // Optional film grain
        if (uFilmGrain > 0.001) {
          float grain = (hash(vUv + fract(uTime)) - 0.5) * 0.025 * (uFilmGrain * 0.1);
          finalColor += grain;
        }

        gl_FragColor = vec4(finalColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}
