import * as THREE from 'three';

export function createPaperMaterial(colorHex = 0xff3b56) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide, // needed for mirrored instances (scale -1)
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.92 },
      uRoughness: { value: 0.35 },      // torn deckled edge roughness
      uFiberIntensity: { value: 0.28 }, // pulp/fiber texture
      uTime: { value: 0.0 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aWidth;

      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vColor;
      varying float vWidth;

      void main() {
        vUv = uv;
        vPosition = position;
        vColor = color;
        vWidth = aWidth;

        vec4 transformed = vec4(position, 1.0);

        // InstancedMesh support: Three.js defines USE_INSTANCING
        // and provides instanceMatrix when material is on an InstancedMesh
        #ifdef USE_INSTANCING
          transformed = instanceMatrix * transformed;
        #endif

        gl_Position = projectionMatrix * modelViewMatrix * transformed;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vColor;
      varying float vWidth;

      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uRoughness;
      uniform float uFiberIntensity;
      uniform float uTime;

      // --- Fast 2D Hash & Value Noise ---
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // 4-octave FBM for detailed deckled edge contour
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.08;
          a *= 0.5;
        }
        return v;
      }

      // Fast 2-octave FBM for smooth paper pulp mottling (saves 8 hashes per fragment)
      float fbm2(vec2 p) {
        return 0.65 * noise(p) + 0.35 * noise(p * 2.08);
      }

      void main() {
        // vUv.x: along stroke (0.0 to 1.0)
        // vUv.y: across stroke (0.0 at center, -1.0 to 1.0 at edges)
        float u = vUv.x;
        float v = vUv.y;
        float distFromCenter = abs(v);

        // Fast early rejection for fragments completely outside the stroke boundary
        if (distFromCenter > 1.15 || u < 0.0005 || u > 0.998) discard;

        // 1. Deckled / Torn Paper Edge
        // Solid core optimization: for the inner ~68% of the brush width, edgeProfile is
        // guaranteed to be well inside the solid boundary, so we skip the 4-octave fbm entirely!
        // Also smoothly suppress edge roughness when stroke becomes a hairline (vWidth < 0.02)
        // to prevent thin tapering wedges from breaking into fluttering sub-pixel noise dust!
        float widthFactor = smoothstep(0.003, 0.025, vWidth);
        float effectiveRoughness = uRoughness * widthFactor;

        float alphaEdge = 1.0;
        float edgeCutThreshold = 0.82 - 0.5 * effectiveRoughness;

        vec2 paperCoord = vPosition.xy * 24.0;

        if (distFromCenter >= edgeCutThreshold && effectiveRoughness > 0.01) {
          float edgeNoise = fbm(paperCoord) * effectiveRoughness;
          float edgeProfile = distFromCenter + (edgeNoise - 0.5 * effectiveRoughness);
          alphaEdge = 1.0 - smoothstep(0.82, 0.98, edgeProfile);
          if (alphaEdge <= 0.005) discard;
        }

        // 2. Paper Fibers (anisotropic grain anchored to the sheet)
        float fiberFaint = 0.0;
        if (uFiberIntensity > 0.01) {
          vec2 fiberCoord = vec2(paperCoord.x * 2.0, paperCoord.y * 6.0);
          float fiber = noise(fiberCoord);
          fiberFaint = smoothstep(0.6, 0.9, fiber);
        }

        // 3. Mottling / Paper Pulp Density (smoothly fades when roughness/fibers are 0)
        float paperPulp = max(effectiveRoughness, uFiberIntensity);
        
        // 4. Color Shading (Pigment absorption + fiber darkening)
        // Uses smoothly interpolated vertex colors for organic branching gradients;
        // falls back to uniform uColor if vertex color is absent.
        vec3 col = (length(vColor) > 0.001) ? vColor : uColor;
        if (paperPulp > 0.01) {
          float pulpDensity = fbm2(paperCoord * 0.4);
          // Pigment settles more in denser pulp areas
          col = mix(col, mix(col * 0.85, col * 1.15, pulpDensity), clamp(paperPulp * 2.0, 0.0, 1.0));
          // Darken micro-fibers slightly
          col -= fiberFaint * uFiberIntensity * 0.3;
        }

        // 5. Feathered ends of stroke (start & end)
        // Leading brush head is crisp and solid; trailing end softly dissolves
        float endFade = smoothstep(0.0, 0.015, u) * smoothstep(1.0, 0.88, u);
        float finalAlpha = alphaEdge * endFade * uOpacity;

        gl_FragColor = vec4(col, finalAlpha);
      }
    `
  });
}
