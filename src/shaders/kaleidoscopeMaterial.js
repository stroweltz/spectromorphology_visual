import * as THREE from 'three';

export function createKaleidoscopeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uSectors: { value: 12.0 },         // kept for GUI / debug overlay reads
      uRotation: { value: 0.0 },
      uZoom: { value: 1.0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uSampleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uMirror: { value: 1.0 },             // kept for GUI reads
      uBgType: { value: 1.0 },              // 0: pure black, 1: dark radial gradient
      uBgInner: { value: new THREE.Color(0x0c0f17) }, // deep midnight indigo
      uBgOuter: { value: new THREE.Color(0x030406) }, // pitch black
      uVignette: { value: 0.75 },
      uAspect: { value: 1.0 },
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
      uniform float uBgType;
      uniform vec3 uBgInner;
      uniform vec3 uBgOuter;
      uniform float uVignette;
      uniform float uAspect;
      uniform float uTime;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        // ── Mandala display mode ────────────────────────────────
        // The FBO already contains the full mandala pattern
        // (ribbons are instanced N× with rotations + optional mirror).
        // This shader just maps the square FBO to screen with
        // aspect correction, rotation, zoom, background & vignette.

        // Aspect-correct coordinates centred on screen
        vec2 p = vUv - uCenter;
        p.x *= uAspect;       // now a circle in FBO maps to a circle on screen

        // Rotation (spins the whole mandala)
        float c = cos(uRotation);
        float s = sin(uRotation);
        p = mat2(c, s, -s, c) * p;

        // Zoom (> 1 zooms in, < 1 zooms out)
        p *= uZoom;

        // Map directly to FBO UV.
        // p is in aspect-correct space; the FBO is square so sampleUV = p + centre
        // works correctly — the mandala fills the screen height, sides show background.
        vec2 sampleUV = p + uSampleCenter;

        // Sample stroke buffer
        vec4 stroke = texture2D(tDiffuse, sampleUV);

        // Discard out-of-bounds samples to avoid clamp artefacts
        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
            sampleUV.y < 0.0 || sampleUV.y > 1.0) {
          stroke = vec4(0.0);
        }

        // Background
        vec3 bg = uBgOuter;
        if (uBgType > 0.5) {
          float gradDist = length(vUv - uCenter) * 1.4;
          bg = mix(uBgInner, uBgOuter, smoothstep(0.0, 1.0, gradDist));
        }

        // Composite strokes over dark background
        vec3 finalColor = mix(bg, stroke.rgb, stroke.a);

        // Vignette
        float vig = length((vUv - 0.5) * vec2(uAspect, 1.0));
        vig = smoothstep(1.1, 0.4, vig);
        finalColor *= mix(1.0, vig, uVignette);

        // Subtle film grain
        float grain = (hash(vUv + fract(uTime)) - 0.5) * 0.025;
        finalColor += grain;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}
