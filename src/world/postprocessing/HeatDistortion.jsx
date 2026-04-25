/**
 * HEAT DISTORTION — Engine heat shimmer post-processing
 * ═════════════════════════════════════════════════════
 * Screen-space UV distortion simulating heat waves above
 * the truck's engine/hood area. Intensity scales with speed.
 * Stronger during daytime, fades at night.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useProgress, truckWorldPos, lerpValue3 } from '../core'

export default function HeatDistortion() {
    const meshRef = useRef()
    const progressRef = useProgress()
    const prevTruckPos = useRef(new THREE.Vector3())
    const smoothSpeed = useRef(0)

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uDistortStrength: { value: 0.003 },
        },
        vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9995, 1.0);
      }
    `,
        fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uDistortStrength;
      varying vec2 vUv;

      // Simple 2D noise
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1,0));
        float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
      }

      void main() {
        // Heat shimmer mask: concentrated in center-lower area of screen
        // (roughly where truck hood would be in typical camera views)
        vec2 center = vUv - vec2(0.5, 0.35);
        float mask = exp(-dot(center, center) * 8.0);

        // Additional vertical column rising from center
        float column = exp(-pow(abs(vUv.x - 0.5) * 4.0, 2.0));
        float rising = smoothstep(0.3, 0.6, vUv.y) * smoothstep(0.9, 0.6, vUv.y);
        mask = max(mask, column * rising * 0.5);

        // Animated distortion
        float n1 = noise(vec2(vUv.x * 15.0, vUv.y * 8.0 - uTime * 2.0));
        float n2 = noise(vec2(vUv.x * 25.0 + 100.0, vUv.y * 12.0 - uTime * 3.5));
        float distort = (n1 * 0.6 + n2 * 0.4 - 0.5) * 2.0;

        // Ripple effect
        float ripple = sin(vUv.y * 60.0 - uTime * 8.0) * 0.5 + 0.5;
        ripple *= sin(vUv.x * 40.0 + uTime * 3.0) * 0.3 + 0.7;

        float strength = mask * uIntensity * uDistortStrength * (distort * 0.7 + ripple * 0.3);

        // We can't actually distort the underlying scene in a forward pass,
        // so we create a subtle visible shimmer overlay instead
        float shimmer = abs(distort) * mask * uIntensity;
        float highlight = smoothstep(0.3, 0.8, abs(distort)) * mask * uIntensity;

        vec3 heatColor = vec3(1.0, 0.98, 0.92); // warm white
        float alpha = shimmer * 0.04 + highlight * 0.02;

        // Rising heat streaks
        float streak = noise(vec2(vUv.x * 20.0, vUv.y * 5.0 - uTime * 4.0));
        streak = smoothstep(0.6, 0.9, streak) * mask * uIntensity * rising;
        alpha += streak * 0.03;

        gl_FragColor = vec4(heatColor, alpha);
      }
    `,
    }), [])

    useFrame(({ clock }) => {
        const elapsed = clock.elapsedTime
        const t = progressRef.current

        // Speed calculation
        const speed = truckWorldPos.distanceTo(prevTruckPos.current)
        prevTruckPos.current.copy(truckWorldPos)
        smoothSpeed.current += (Math.min(speed * 20, 1.0) - smoothSpeed.current) * 0.06

        material.uniforms.uTime.value = elapsed

        // Stronger during day, fades at night
        const dayFactor = lerpValue3(1.0, 0.7, 0.15, t)
        material.uniforms.uIntensity.value = smoothSpeed.current * dayFactor
    })

    return (
        <mesh ref={meshRef} renderOrder={9995} material={material} frustumCulled={false}>
            <planeGeometry args={[2, 2]} />
        </mesh>
    )
}
