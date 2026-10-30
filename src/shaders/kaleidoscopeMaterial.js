import * as THREE from 'three';

export function createKaleidoscopeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uSectors: { value: 12.0 },
      uRotation: { value: 0.0 },
      uZoom: { value: 1.0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uSampleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uMirror: { value: 1.0 },             // 1.0 = bilateral reflection, 0.0 = rotational only
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
      uniform float uSectors;
      uniform float uRotation;
      uniform float uZoom;
      uniform vec2 uCenter;
      uniform vec2 uSampleCenter;
      uniform float uMirror;
      uniform float uBgType;
      uniform vec3 uBgInner;
      uniform vec3 uBgOuter;
      uniform float uVignette;
      uniform float uAspect;
      uniform float uTime;

      #define PI 3.1415926535897932384626433832795
      #define TWO_PI 6.283185307179586476925286766559

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        // Correct aspect ratio so the kaleidoscope circle remains perfectly round
        vec2 p = vUv - uCenter;
        p.x *= uAspect;

        float r = length(p) * uZoom;
        float theta = atan(p.y, p.x) + uRotation;

        // Sector wedge angle
        float sectorAngle = TWO_PI / max(2.0, uSectors);

        // Fold angle into the base sector
        theta = mod(theta, sectorAngle);

        // Mirror symmetry along the sector bisector
        if (uMirror > 0.5) {
          theta = abs(theta - sectorAngle * 0.5);
        }

        // Reconstruct folded sampling UV coordinates
        vec2 sampleP = vec2(cos(theta), sin(theta)) * r;
        vec2 sampleUV = sampleP + uSampleCenter;

        // Sample offscreen stroke buffer
        vec4 stroke = texture2D(tDiffuse, sampleUV);

        // Background calculation
        vec3 bg = uBgOuter;
        if (uBgType > 0.5) {
          float gradDist = length(vUv - uCenter) * 1.4;
          bg = mix(uBgInner, uBgOuter, smoothstep(0.0, 1.0, gradDist));
        }

        // Composite strokes over the dark background (premultiplied / alpha blend)
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
