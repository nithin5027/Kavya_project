/**
 * SPEED LINES — Cinematic radial motion blur
 * ═══════════════════════════════════════════
 * Screen-space shader creating radial streaks during
 * fast scrolling. Intensity proportional to scroll velocity.
 * Blends with scene fog color for visual cohesion.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SPEED_LINES, COLORS } from '../config'
import { useProgress, lerpColor3, lerpValue3, _color } from '../core'

const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)

export default function SpeedLines() {
    const progressRef = useProgress()
    const prevProgress = useRef(0)
    const smoothVelocity = useRef(0)

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uStreakLength: { value: SPEED_LINES.STREAK_LENGTH },
            uColor: { value: new THREE.Color(COLORS.FOG_DAY) },
            uCenter: { value: new THREE.Vector2(0.5, 0.45) }, // vanishing point
        },
        vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9994, 1.0);
      }
    `,
        fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uStreakLength;
      uniform vec3 uColor;
      uniform vec2 uCenter;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 toCenter = vUv - uCenter;
        float dist = length(toCenter);
        float angle = atan(toCenter.y, toCenter.x);

        // Only show at screen edges
        float edgeMask = smoothstep(0.2, 0.6, dist);

        // Radial streak pattern
        float streakAngle = fract(angle * 20.0 / 6.2831853);
        float streak = smoothstep(0.4, 0.5, streakAngle) * smoothstep(0.6, 0.5, streakAngle);

        // Animated flow outward
        float flow = fract(dist * 3.0 - uTime * 2.0);
        float flowMask = smoothstep(0.0, 0.3, flow) * smoothstep(1.0, 0.5, flow);

        // Secondary fine streaks
        float fineAngle = fract(angle * 60.0 / 6.2831853);
        float fineStreak = smoothstep(0.45, 0.5, fineAngle) * smoothstep(0.55, 0.5, fineAngle);
        float flow2 = fract(dist * 6.0 - uTime * 3.5 + 0.3);
        float flowMask2 = smoothstep(0.0, 0.2, flow2) * smoothstep(1.0, 0.6, flow2);

        float alpha = (streak * flowMask * 0.6 + fineStreak * flowMask2 * 0.4)
                     * edgeMask * uIntensity;

        // Slight color variation
        vec3 col = uColor * (0.8 + streak * 0.2);

        // Edge brightness boost
        float edgeBright = smoothstep(0.4, 0.8, dist) * 0.3;
        col += vec3(edgeBright);

        gl_FragColor = vec4(col, alpha * 0.5);
      }
    `,
    }), [])

    useFrame(({ clock }) => {
        const t = progressRef.current
        const elapsed = clock.elapsedTime

        // Compute scroll velocity
        const rawVelocity = Math.abs(t - prevProgress.current)
        prevProgress.current = t

        // Smooth the velocity with fast response
        const target = rawVelocity > SPEED_LINES.VELOCITY_THRESHOLD ? rawVelocity * 100 : 0
        smoothVelocity.current += (target - smoothVelocity.current) *
            (target > smoothVelocity.current ? 0.15 : SPEED_LINES.FADE_SPEED * 0.016)

        const intensity = Math.min(smoothVelocity.current, SPEED_LINES.MAX_INTENSITY)

        material.uniforms.uTime.value = elapsed
        material.uniforms.uIntensity.value = intensity

        // Blend color with current fog color
        lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
        material.uniforms.uColor.value.copy(_color)
        material.uniforms.uColor.value.multiplyScalar(1.5) // brighter
    })

    return (
        <mesh renderOrder={9994} material={material} frustumCulled={false}>
            <planeGeometry args={[2, 2]} />
        </mesh>
    )
}
