/**
 * POST-PROCESSING EFFECTS — Cinematic atmosphere
 * ═══════════════════════════════════════════════
 * Screen-space vignette, color grading, film grain,
 * atmospheric haze overlay. All via screen-space quads.
 * No heavy EffectComposer — pure R3F.
 */
import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useProgress, lerpValue3, lerpColor3, _color } from '../core'
import { COLORS } from '../config'

/* ── Pre-allocated haze colors ── */
const _hazeDay = new THREE.Color('#b0c8d8')
const _hazeSunset = new THREE.Color('#e8a060')
const _hazeNight = new THREE.Color('#2a2a4a')

/**
 * Screen-space vignette overlay (rendered last)
 */
export function ScreenVignette({ intensity = 0.35, softness = 0.6 }) {
  const meshRef = useRef()

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uIntensity: { value: intensity },
      uSoftness: { value: softness },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      uniform float uSoftness;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        // Elliptical vignette (wider horizontal)
        vec2 center = uv - 0.5;
        center.x *= 1.1; // slightly wider
        float dist = length(center);
        float vig = smoothstep(uSoftness, uSoftness - 0.35, dist);
        // Subtle blue-black tint in corners
        vec3 vigColor = mix(vec3(0.0, 0.0, 0.02), vec3(0.0), dist);
        gl_FragColor = vec4(vigColor, (1.0 - vig) * uIntensity);
      }
    `,
  }), [intensity, softness])

  return (
    <mesh ref={meshRef} renderOrder={9999} material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

/**
 * Color grading overlay — cinematic warm/cool shift
 */
export function ColorGrade({ warmth = 0.03 }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uWarmth: { value: warmth },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9998, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uWarmth;
      varying vec2 vUv;
      void main() {
        float warmZone = smoothstep(0.6, 0.0, vUv.y);
        float coolZone = smoothstep(0.4, 1.0, vUv.y);
        vec3 warmColor = vec3(uWarmth * 1.2, uWarmth * 0.8, 0.0);
        vec3 coolColor = vec3(0.0, 0.0, uWarmth * 0.5);
        vec3 color = warmColor * warmZone + coolColor * coolZone;
        float alpha = max(warmZone, coolZone) * uWarmth * 3.0;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  }), [warmth])

  return (
    <mesh renderOrder={9998} material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

/**
 * Film grain overlay — subtle animated noise for cinematic texture
 * Hides imperfections and adds organic feel.
 */
export function FilmGrain({ intensity = 0.04 }) {
  const progressRef = useProgress()
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9997, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        // Animated grain — new pattern every frame
        float grain = hash(vUv * 1000.0 + fract(uTime * 7.13)) * 2.0 - 1.0;
        // Slightly more grain in shadows (darker areas get more noise)
        float shadowBias = smoothstep(0.7, 0.0, vUv.y) * 0.5 + 0.5;
        float alpha = abs(grain) * uIntensity * shadowBias;
        vec3 grainColor = grain > 0.0 ? vec3(1.0) : vec3(0.0);
        gl_FragColor = vec4(grainColor, alpha);
      }
    `,
  }), [intensity])

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    // Grain increases slightly at night for cinematic feel
    const t = progressRef.current
    material.uniforms.uIntensity.value = lerpValue3(intensity, intensity * 1.2, intensity * 1.8, t)
  })

  return (
    <mesh renderOrder={9997} material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

/**
 * Atmospheric haze overlay — distance-based volumetric haze
 * Adds cinematic depth, hides hard edges, makes scene cohesive.
 */
export function AtmosphericHaze({ hazeColor = '#c8b8a0', intensity = 0.06 }) {
  const progressRef = useProgress()
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uHazeColor: { value: new THREE.Color(hazeColor) },
      uIntensity: { value: intensity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9996, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHazeColor;
      uniform float uIntensity;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1,0));
        float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
      }

      void main() {
        // Haze is stronger at horizon (bottom of screen) and edges
        float horizonFade = smoothstep(0.6, 0.15, vUv.y);

        // Subtle animated noise for organic movement
        float hazeNoise = noise(vUv * 3.0 + uTime * 0.05);
        float hazeNoise2 = noise(vUv * 8.0 - uTime * 0.03);
        float noiseDetail = hazeNoise * 0.6 + hazeNoise2 * 0.4;

        float alpha = horizonFade * uIntensity * (0.7 + noiseDetail * 0.3);

        // Light ray streaks from top-right (simulating sun direction)
        float ray = smoothstep(0.0, 1.0, vUv.x * 0.5 + vUv.y * 0.3);
        float rayNoise = noise(vec2(vUv.x * 2.0, vUv.y * 0.5 + uTime * 0.02));
        float rayMask = smoothstep(0.6, 0.8, rayNoise) * ray * 0.3;

        vec3 col = uHazeColor + vec3(0.1, 0.08, 0.05) * rayMask;
        alpha += rayMask * uIntensity;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  }), [hazeColor, intensity])

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    // Haze thickens at sunset, clears + cools at night
    const t = progressRef.current
    material.uniforms.uIntensity.value = lerpValue3(intensity, intensity * 1.5, intensity * 0.4, t)
    lerpColor3(_hazeDay, _hazeSunset, _hazeNight, t)
    material.uniforms.uHazeColor.value.copy(_color)
  })

  return (
    <mesh renderOrder={9996} material={material} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
