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
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vPosition = position;

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

      void main() {
        // vUv.x: along stroke (0.0 to 1.0)
        // vUv.y: across stroke (0.0 at center, -1.0 to 1.0 at edges)
        float u = vUv.x;
        float v = vUv.y;
        float distFromCenter = abs(v);

        // 1. Deckled / Torn Paper Edge
        // Displace the edge with high-frequency noise
        float edgeNoise = fbm(vec2(u * 35.0, v * 12.0)) * uRoughness;
        float edgeProfile = distFromCenter + (edgeNoise - 0.5 * uRoughness);
        
        // Crisp falloff like fibrous torn paper
        float alphaEdge = 1.0 - smoothstep(0.82, 0.98, edgeProfile);
        if (alphaEdge <= 0.005) discard;

        // 2. Paper Fibers (anisotropic noise stretched along u axis)
        vec2 fiberCoord = vec2(u * 12.0, v * 90.0);
        float fiber = noise(fiberCoord);
        float fiberFaint = smoothstep(0.6, 0.9, fiber);

        // 3. Mottling / Paper Pulp Density
        float pulpDensity = fbm(vec2(u * 6.0, v * 4.0));
        
        // 4. Color Shading (Pigment absorption + fiber darkening)
        vec3 col = uColor;
        // Pigment settles more in denser pulp areas
        col = mix(col * 0.85, col * 1.15, pulpDensity);
        // Darken micro-fibers slightly
        col -= fiberFaint * uFiberIntensity * 0.3;

        // 5. Feathered ends of stroke (start & end)
        // Leading brush head is crisp and solid; trailing end softly dissolves
        float endFade = smoothstep(0.0, 0.015, u) * smoothstep(1.0, 0.88, u);
        float finalAlpha = alphaEdge * endFade * uOpacity;

        gl_FragColor = vec4(col, finalAlpha);
      }
    `
  });
}
