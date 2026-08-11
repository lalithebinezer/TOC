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

      // Base smooth UV for surface cell shading
      vec2 baseUv = vUv;

      // Low-frequency organic jitter ONLY for hand-drawn edge outline sampling
      vec2 noiseCoord = vUv * 60.0;
      vec2 edgeJitter = vec2(
        noise(noiseCoord) - 0.5,
        noise(noiseCoord + vec2(17.3, 31.7)) - 0.5
      ) * (jitterAmount * 1.5);

      // Jittered UV specifically for edge detection lines
      vec2 edgeUv = vUv + edgeJitter;

      // Sobel sampling offsets (clean line thickness)
      vec2 texel = vec2(lineThickness * 1.2) / resolution;

      // Sample depth texture for sharp geometric outlines
      float depthEdge = 0.0;
      if (resolution.x > 1.0) {
        float d0 = texture2D(tDepth, edgeUv + vec2(-texel.x, -texel.y)).r;
        float d1 = texture2D(tDepth, edgeUv + vec2( 0.0,     -texel.y)).r;
        float d2 = texture2D(tDepth, edgeUv + vec2( texel.x, -texel.y)).r;
        float d3 = texture2D(tDepth, edgeUv + vec2(-texel.x,  0.0)).r;
        float d4 = texture2D(tDepth, edgeUv + vec2( texel.x,  0.0)).r;
        float d5 = texture2D(tDepth, edgeUv + vec2(-texel.x,  texel.y)).r;
        float d6 = texture2D(tDepth, edgeUv + vec2( 0.0,      texel.y)).r;
        float d7 = texture2D(tDepth, edgeUv + vec2( texel.x,  texel.y)).r;

        float depthSobelX = (d2 + 2.0 * d4 + d7) - (d0 + 2.0 * d3 + d5);
        float depthSobelY = (d0 + 2.0 * d1 + d2) - (d5 + 2.0 * d6 + d7);
        depthEdge = sqrt(depthSobelX * depthSobelX + depthSobelY * depthSobelY);
      }

      // Diffuse luminance edge fallback (jittered for hand-drawn pen lines)
      vec3 c0 = texture2D(tDiffuse, edgeUv + vec2(-texel.x, 0.0)).rgb;
      vec3 c1 = texture2D(tDiffuse, edgeUv + vec2( texel.x, 0.0)).rgb;
      vec3 c2 = texture2D(tDiffuse, edgeUv + vec2(0.0, -texel.y)).rgb;
      vec3 c3 = texture2D(tDiffuse, edgeUv + vec2(0.0,  texel.y)).rgb;
      float colorEdge = length(c1 - c0) + length(c3 - c2);

      // Edge intensity threshold for crisp hand-drawn ink outlines
      float edgeIntensity = smoothstep(0.003, 0.035, depthEdge) + smoothstep(0.12, 0.4, colorEdge);
      edgeIntensity = clamp(edgeIntensity, 0.0, 1.0);

      // Subtle warm paper background grain
      float grain = (rand(vUv * resolution) - 0.5) * 0.015;

      // Smooth surface luminance shading (un-jittered baseUv for clean faces)
      float luminance = dot(originalColor.rgb, vec3(0.299, 0.587, 0.114));
      float toneShading = smoothstep(0.05, 0.9, luminance);

      // Clean 3-step toon shading for warm paper/ink surfaces
      float cellTone = floor(toneShading * 3.0 + 0.5) / 3.0;

      // Shaded faces blend cleanly between paper color and ink tone
      vec3 themeElementShade = mix(inkColor * 0.25 + paperColor * 0.45, paperColor, cellTone);

      // Mix clean smooth surface shading with hand-drawn jittered ink lines
      vec3 finalColor = mix(themeElementShade + vec3(grain), inkColor, edgeIntensity * 0.95);

      // Keep selection/highlighting intact
      if (originalColor.g > 0.6 && originalColor.r < 0.35) {
        finalColor = mix(finalColor, originalColor.rgb, 0.85);
      }

      gl_FragColor = vec4(finalColor, originalColor.a);
    }
  `
};
