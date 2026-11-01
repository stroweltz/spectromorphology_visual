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
      uBgType: { value: 2.0 },             // 0: solid, 1: radial, 2: nebula (default), 3: waves, 4: aurora
      uBgInner: { value: new THREE.Color(0x0c1527) }, // deep midnight indigo
      uBgOuter: { value: new THREE.Color(0x030406) }, // pitch black
      uBgAccent: { value: new THREE.Color(0x160a22) }, // deep velvet plum
      uNebulaSpeed: { value: 0.25 },
      uNebulaIntensity: { value: 0.55 },
      uNebulaScale: { value: 1.4 },
      uVignette: { value: 0.75 },
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
      uniform float uVignette;
      uniform float uAspect;
      uniform float uFilmGrain;
      uniform float uTime;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        // ── Mandala display mode ────────────────────────────────
        // The FBO already contains the full mandala pattern
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
          float dist = length(pBg);

          if (uBgType < 1.5) {
            // Mode 1: Classic Soft Radial
            float gradDist = dist * 1.4;
            bg = mix(uBgInner, uBgOuter, smoothstep(0.0, 1.0, gradDist));

          } else if (uBgType < 2.5) {
            // Mode 2: Deep Ambient Nebula (Дыхание Бездны)
            // Procedural ultra-blurred Gaussian light pools with slow organic drift
            float t = uTime * uNebulaSpeed;
            float scale = max(0.3, uNebulaScale);
            float invS2 = 1.0 / (scale * scale);

            // Orbiting soft Gaussian light vortex 1 (primary color)
            vec2 c1 = vec2(sin(t * 0.35) * 0.42, cos(t * 0.27) * 0.30) * scale;
            float d1 = length(pBg - c1);
            float b1 = exp(-d1 * d1 * 2.4 * invS2);

            // Orbiting soft Gaussian light vortex 2 (accent color)
            vec2 c2 = vec2(cos(t * 0.31 + 2.1) * 0.46, sin(t * 0.43 + 1.2) * 0.34) * scale;
            float d2 = length(pBg - c2);
            float b2 = exp(-d2 * d2 * 2.8 * invS2);

            // Breathing central light vortex 3
            float breath = 0.82 + 0.18 * sin(t * 0.65);
            vec2 c3 = vec2(sin(t * 0.19 + 4.2) * 0.15, cos(t * 0.24 + 3.1) * 0.15) * scale;
            float d3 = length(pBg - c3);
            float b3 = exp(-d3 * d3 * 4.0 * invS2) * breath;

            // Secondary slow counter-drift vortex 4
            vec2 c4 = vec2(cos(t * 0.22 + 5.1) * 0.32, sin(t * 0.25 + 2.4) * 0.36) * scale;
            float d4 = length(pBg - c4);
            float b4 = exp(-d4 * d4 * 3.2 * invS2);

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
      }
    `
  });
}
