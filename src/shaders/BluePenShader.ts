import * as THREE from 'three';

export const BluePenShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    paperColor: { value: new THREE.Color('#F9F9F6') },
    inkColor: { value: new THREE.Color('#002395') },
    lineThickness: { value: 1.2 },
    jitterAmount: { value: 0.0018 },
    enabled: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 resolution;
    uniform vec3 paperColor;
    uniform vec3 inkColor;
    uniform float lineThickness;
    uniform float jitterAmount;
    uniform float enabled;

    varying vec2 vUv;

    // Pseudo-random noise generator
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // 2D Simplex-like noise for line jitter
    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = rand(i);
      float b = rand(i + vec2(1.0, 0.0));
      float c = rand(i + vec2(0.0, 1.0));
      float d = rand(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      vec4 originalColor = texture2D(tDiffuse, vUv);

      if (enabled < 0.5) {
        gl_FragColor = originalColor;
        return;
      }

      // Calculate low-frequency micro-jitter displacement
      vec2 noiseCoord = vUv * 80.0;
      vec2 jitter = vec2(
        noise(noiseCoord) - 0.5,
        noise(noiseCoord + vec2(17.3, 31.7)) - 0.5
      ) * jitterAmount;

      vec2 uv = vUv + jitter;

      // Sobel sampling offsets
      vec2 texel = vec2(lineThickness) / resolution;

      // Sample depth texture if bound
      float depthCenter = texture2D(tDepth, uv).r;
      float depthEdge = 0.0;
      float d0 = texture2D(tDepth, uv + vec2(-texel.x, -texel.y)).r;
      float d1 = texture2D(tDepth, uv + vec2( 0.0,     -texel.y)).r;
      float d2 = texture2D(tDepth, uv + vec2( texel.x, -texel.y)).r;
      float d3 = texture2D(tDepth, uv + vec2(-texel.x,  0.0)).r;
      float d4 = texture2D(tDepth, uv + vec2( texel.x,  0.0)).r;
      float d5 = texture2D(tDepth, uv + vec2(-texel.x,  texel.y)).r;
      float d6 = texture2D(tDepth, uv + vec2( 0.0,      texel.y)).r;
      float d7 = texture2D(tDepth, uv + vec2( texel.x,  texel.y)).r;

      float depthSobelX = (d2 + 2.0 * d4 + d7) - (d0 + 2.0 * d3 + d5);
      float depthSobelY = (d0 + 2.0 * d1 + d2) - (d5 + 2.0 * d6 + d7);
      depthEdge = sqrt(depthSobelX * depthSobelX + depthSobelY * depthSobelY);

      // Diffuse luminance edge fallback (detects geometry edges even without depth texture)
      vec3 c0 = texture2D(tDiffuse, uv + vec2(-texel.x, 0.0)).rgb;
      vec3 c1 = texture2D(tDiffuse, uv + vec2( texel.x, 0.0)).rgb;
      vec3 c2 = texture2D(tDiffuse, uv + vec2(0.0, -texel.y)).rgb;
      vec3 c3 = texture2D(tDiffuse, uv + vec2(0.0,  texel.y)).rgb;
      float colorEdge = length(c1 - c0) + length(c3 - c2);

      // Combine depth and luminance edge intensities
      float edgeIntensity = smoothstep(0.002, 0.03, depthEdge) + smoothstep(0.08, 0.35, colorEdge);
      edgeIntensity = clamp(edgeIntensity, 0.0, 1.0);
      // Paper grain noise background
      float grain = (rand(vUv * resolution) - 0.5) * 0.035;

      // Calculate shading multiplier from original render (subtle tonal depth)
      float luminance = dot(originalColor.rgb, vec3(0.299, 0.587, 0.114));
      float toneShading = smoothstep(0.0, 0.85, luminance);

      // Subtle hatching effect on shaded faces
      float hatch = sin((vUv.x + vUv.y) * 400.0) * 0.04 * (1.0 - toneShading);

      // Base face color blended between paper background and light ink tone for structural depth
      vec3 faceShaded = mix(paperColor * 0.92 + hatch, paperColor, toneShading);

      // Mix paper/shaded faces with crisp jittered ink lines
      vec3 finalColor = mix(faceShaded + vec3(grain), inkColor, edgeIntensity);

      // Highlight override: if an element is selected (cyan/green/purple highlight)
      float highlightDist = length(originalColor.rgb - paperColor);
      if (originalColor.g > 0.4 || originalColor.b > 0.4 || originalColor.r > 0.4) {
        if (originalColor.g > 0.7 && originalColor.r < 0.2) { // Cyan/Green highlight
          finalColor = mix(finalColor, originalColor.rgb, 0.75);
        }
      }

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};
