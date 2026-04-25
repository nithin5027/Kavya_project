/**
 * EXHAUST SMOKE — GPU particle diesel exhaust from silencer pipes
 * ═══════════════════════════════════════════════════════════════
 * Billowing smoke puffs with buoyancy, wind drift, turbulence.
 * Dark grey when accelerating, lighter when cruising.
 * Opacity tied to truck speed. Custom shader with soft blending.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EXHAUST } from '../config'
import { useProgress, truckWorldPos } from '../core'

/* ── Smoke particle shader ── */
const smokeVertexShader = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute float aPhase;
  varying float vLife;
  varying float vPhase;
  uniform float uTime;

  void main() {
    vLife = aLife;
    vPhase = aPhase;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Size grows as particle ages (puff expansion)
    float ageFactor = 1.0 + (1.0 - aLife) * 2.5;
    gl_PointSize = aSize * ageFactor * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`

const smokeFragmentShader = /* glsl */ `
  uniform vec3 uColorIdle;
  uniform vec3 uColorAccel;
  uniform float uAccelMix;
  uniform float uMasterOpacity;
  varying float vLife;
  varying float vPhase;

  void main() {
    // Soft circular particle
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    // Soft edge falloff
    float softEdge = smoothstep(0.5, 0.15, dist);
    // Billowy noise pattern
    float noise = sin(vPhase * 20.0 + dist * 8.0) * 0.3 + 0.7;

    vec3 color = mix(uColorIdle, uColorAccel, uAccelMix);
    // Darken core slightly
    color *= 0.85 + noise * 0.15;

    // Fade out as life decreases
    float fadeIn = smoothstep(0.0, 0.15, 1.0 - vLife);
    float fadeOut = smoothstep(0.0, 0.4, vLife);
    float alpha = softEdge * fadeIn * fadeOut * uMasterOpacity * noise;

    gl_FragColor = vec4(color, alpha);
  }
`

export default function ExhaustSmoke() {
    const pointsRef = useRef()
    const progressRef = useProgress()
    const prevTruckPos = useRef(new THREE.Vector3())
    const prevProgress = useRef(0)
    const smoothSpeed = useRef(0)

    const count = EXHAUST.PARTICLE_COUNT

    // Pre-allocated arrays
    const { positions, lifetimes, velocities, sizes, phases, lifeAttr, sizeAttr, phaseAttr } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const life = new Float32Array(count)
        const vel = new Float32Array(count * 3)
        const sz = new Float32Array(count)
        const ph = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            pos[i * 3 + 1] = -200 // hidden below
            life[i] = -1
            sz[i] = 0.3 + Math.random() * 0.5
            ph[i] = Math.random() * Math.PI * 2
        }
        return {
            positions: pos,
            lifetimes: life,
            velocities: vel,
            sizes: sz,
            phases: ph,
            lifeAttr: new THREE.BufferAttribute(life, 1),
            sizeAttr: new THREE.BufferAttribute(sz, 1),
            phaseAttr: new THREE.BufferAttribute(ph, 1),
        }
    }, [count])

    // Shader material
    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uTime: { value: 0 },
            uColorIdle: { value: new THREE.Color(EXHAUST.IDLE_COLOR) },
            uColorAccel: { value: new THREE.Color(EXHAUST.ACCEL_COLOR) },
            uAccelMix: { value: 0 },
            uMasterOpacity: { value: EXHAUST.IDLE_OPACITY },
        },
        vertexShader: smokeVertexShader,
        fragmentShader: smokeFragmentShader,
    }), [])

    useFrame(({ clock }) => {
        if (!pointsRef.current) return
        const dt = 0.016
        const elapsed = clock.elapsedTime
        const t = progressRef.current

        // Compute truck speed
        const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
        prevTruckPos.current.copy(truckWorldPos)

        // Smooth speed for opacity/color
        const targetSpeed = Math.min(truckSpeed * 30, 1.0)
        smoothSpeed.current += (targetSpeed - smoothSpeed.current) * 0.08

        // Update uniforms
        material.uniforms.uTime.value = elapsed
        material.uniforms.uAccelMix.value = smoothSpeed.current
        material.uniforms.uMasterOpacity.value =
            EXHAUST.IDLE_OPACITY + (EXHAUST.ACCEL_OPACITY - EXHAUST.IDLE_OPACITY) * smoothSpeed.current

        const posAttr = pointsRef.current.geometry.attributes.position
        const arr = posAttr.array

        // Spawn rate based on speed
        const spawnRate = Math.max(1, Math.floor(smoothSpeed.current * 8 + 1))
        let spawned = 0

        for (let i = 0; i < count; i++) {
            // Spawn new particles
            if (spawned < spawnRate && lifetimes[i] < 0) {
                // Alternate between left and right exhaust pipes
                const pipe = spawned % 2 === 0 ? EXHAUST.PIPE_LEFT : EXHAUST.PIPE_RIGHT
                arr[i * 3] = truckWorldPos.x + pipe[0] + (Math.random() - 0.5) * 0.3
                arr[i * 3 + 1] = pipe[1] + Math.random() * 0.2
                arr[i * 3 + 2] = truckWorldPos.z + pipe[2] + (Math.random() - 0.5) * 0.3

                // Initial velocity: upward + backward + slight random
                velocities[i * 3] = EXHAUST.WIND_X * (0.5 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.5
                velocities[i * 3 + 1] = EXHAUST.BUOYANCY * (0.6 + Math.random() * 0.4)
                velocities[i * 3 + 2] = EXHAUST.WIND_Z * (0.5 + Math.random() * 0.5) - truckSpeed * 3

                lifetimes[i] = EXHAUST.LIFETIME + Math.random() * 0.8
                phases[i] = Math.random() * Math.PI * 2
                spawned++
            }

            // Update living particles
            if (lifetimes[i] > 0) {
                // Turbulence via sin/cos noise
                const turb = EXHAUST.TURBULENCE
                const tx = Math.sin(elapsed * 2.3 + phases[i] * 3.0) * turb * 0.3
                const tz = Math.cos(elapsed * 1.7 + phases[i] * 2.0) * turb * 0.3

                arr[i * 3] += (velocities[i * 3] + tx) * dt
                arr[i * 3 + 1] += velocities[i * 3 + 1] * dt
                arr[i * 3 + 2] += (velocities[i * 3 + 2] + tz) * dt

                // Buoyancy increases, horizontal drag
                velocities[i * 3 + 1] += 0.3 * dt  // upward acceleration
                velocities[i * 3] *= 0.985
                velocities[i * 3 + 2] *= 0.985

                lifetimes[i] -= dt
                if (lifetimes[i] <= 0) {
                    arr[i * 3 + 1] = -200
                    lifetimes[i] = -1
                }
            }
        }

        posAttr.needsUpdate = true
        lifeAttr.array = lifetimes
        lifeAttr.needsUpdate = true

        prevProgress.current = t
    })

    return (
        <points ref={pointsRef} renderOrder={101} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aLife" {...lifeAttr} count={count} itemSize={1} />
                <bufferAttribute attach="attributes-aSize" {...sizeAttr} count={count} itemSize={1} />
                <bufferAttribute attach="attributes-aPhase" {...phaseAttr} count={count} itemSize={1} />
            </bufferGeometry>
            <primitive object={material} attach="material" />
        </points>
    )
}
