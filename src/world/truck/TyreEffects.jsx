/**
 * TYRE EFFECTS — Spray, skid marks, brake glow
 * ═══════════════════════════════════════════════
 * Multi-layered tyre animation:
 *   • Gravel/dirt spray behind rear wheels
 *   • Fading skid marks on deceleration
 *   • Orange brake glow under hard braking
 * All GPU-driven, no DOM interaction.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TYRE_FX, SCENE } from '../config'
import { useProgress, truckWorldPos, routeCurve } from '../core'

/* ═══════════════════════════════════════
   TYRE SPRAY — particles behind rear wheels
   ═══════════════════════════════════════ */
export function TyreSpray() {
    const pointsRef = useRef()
    const progressRef = useProgress()
    const count = TYRE_FX.SPRAY_COUNT
    const prevTruckPos = useRef(new THREE.Vector3())

    const { positions, velocities, lifetimes, sizes } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const vel = new Float32Array(count * 3)
        const life = new Float32Array(count)
        const sz = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            pos[i * 3 + 1] = -200
            life[i] = -1
            sz[i] = 0.08 + Math.random() * 0.15
        }
        return { positions: pos, velocities: vel, lifetimes: life, sizes: sz }
    }, [count])

    useFrame(() => {
        if (!pointsRef.current) return
        const dt = 0.016
        const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
        prevTruckPos.current.copy(truckWorldPos)

        const attr = pointsRef.current.geometry.attributes.position
        const arr = attr.array
        const spawnRate = Math.min(6, Math.floor(truckSpeed * 40))
        let spawned = 0

        for (let i = 0; i < count; i++) {
            // Spawn
            if (spawned < spawnRate && lifetimes[i] < 0) {
                // Pick a rear wheel offset
                const wheel = TYRE_FX.REAR_WHEEL_OFFSETS[spawned % 2]
                arr[i * 3] = truckWorldPos.x + wheel[0] + (Math.random() - 0.5) * 0.5
                arr[i * 3 + 1] = wheel[1] + Math.random() * 0.1
                arr[i * 3 + 2] = truckWorldPos.z + wheel[2] + (Math.random() - 0.5) * 0.5

                // Velocity: mostly upward + backward fan
                velocities[i * 3] = (Math.random() - 0.5) * 3.0
                velocities[i * 3 + 1] = Math.random() * 2.5 + 0.8
                velocities[i * 3 + 2] = (Math.random() - 0.5) * 3.0 - truckSpeed * 12

                lifetimes[i] = 0.6 + Math.random() * 0.6
                spawned++
            }

            // Update
            if (lifetimes[i] > 0) {
                arr[i * 3] += velocities[i * 3] * dt
                arr[i * 3 + 1] += velocities[i * 3 + 1] * dt
                arr[i * 3 + 2] += velocities[i * 3 + 2] * dt

                // Gravity
                velocities[i * 3 + 1] -= 5.0 * dt
                // Drag
                velocities[i * 3] *= 0.96
                velocities[i * 3 + 2] *= 0.96

                lifetimes[i] -= dt
                if (lifetimes[i] <= 0 || arr[i * 3 + 1] < 0) {
                    arr[i * 3 + 1] = -200
                    lifetimes[i] = -1
                }
            }
        }
        attr.needsUpdate = true
    })

    return (
        <points ref={pointsRef} renderOrder={102} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial
                size={0.2}
                color={TYRE_FX.SPRAY_COLOR}
                transparent
                opacity={0.5}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    )
}

/* ═══════════════════════════════════════
   SKID MARKS — decal trail on braking/turning
   ═══════════════════════════════════════ */
export function SkidMarks() {
    const meshRef = useRef()
    const progressRef = useProgress()
    const prevProgress = useRef(0)
    const markIndex = useRef(0)
    const maxMarks = TYRE_FX.SKID_MAX_MARKS
    const prevTruckPos = useRef(new THREE.Vector3())

    const { positions, opacities } = useMemo(() => {
        // Each mark = small quad on road, stored as instanced
        const pos = new Float32Array(maxMarks * 3)
        const op = new Float32Array(maxMarks)
        for (let i = 0; i < maxMarks; i++) {
            pos[i * 3 + 1] = -200 // hidden
            op[i] = 0
        }
        return { positions: pos, opacities: op }
    }, [maxMarks])

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader: /* glsl */ `
      attribute float aOpacity;
      varying float vOpacity;
      void main() {
        vOpacity = aOpacity;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 6.0 * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
        fragmentShader: /* glsl */ `
      varying float vOpacity;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.2, d);
        gl_FragColor = vec4(0.15, 0.12, 0.1, soft * vOpacity * 0.6);
      }
    `,
    }), [])

    useFrame(() => {
        if (!meshRef.current) return
        const dt = 0.016
        const t = progressRef.current
        const decel = Math.max(0, prevProgress.current - t) * 200

        const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
        prevTruckPos.current.copy(truckWorldPos)

        // Spawn skid marks on braking
        if (decel > 0.05 && truckSpeed > 0.001) {
            for (const wheel of TYRE_FX.REAR_WHEEL_OFFSETS) {
                const idx = markIndex.current % maxMarks
                positions[idx * 3] = truckWorldPos.x + wheel[0]
                positions[idx * 3 + 1] = SCENE.ROAD_Y + 0.01
                positions[idx * 3 + 2] = truckWorldPos.z + wheel[2]
                opacities[idx] = Math.min(decel * 2, 1.0)
                markIndex.current++
            }
        }

        // Fade all marks
        for (let i = 0; i < maxMarks; i++) {
            if (opacities[i] > 0) {
                opacities[i] -= TYRE_FX.SKID_DECAY_RATE
                if (opacities[i] <= 0) {
                    opacities[i] = 0
                    positions[i * 3 + 1] = -200
                }
            }
        }

        const posAttr = meshRef.current.geometry.attributes.position
        posAttr.array = positions
        posAttr.needsUpdate = true
        const opAttr = meshRef.current.geometry.attributes.aOpacity
        opAttr.array = opacities
        opAttr.needsUpdate = true

        prevProgress.current = t
    })

    return (
        <points ref={meshRef} renderOrder={1} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={maxMarks} array={positions} itemSize={3} />
                <bufferAttribute attach="attributes-aOpacity" count={maxMarks} array={opacities} itemSize={1} />
            </bufferGeometry>
            <primitive object={material} attach="material" />
        </points>
    )
}

/* ═══════════════════════════════════════
   BRAKE GLOW — orange under-tyre glow
   ═══════════════════════════════════════ */
export function BrakeGlow() {
    const lightsRef = useRef([])
    const progressRef = useProgress()
    const prevProgress = useRef(0)

    useFrame(() => {
        const t = progressRef.current
        const decel = Math.max(0, prevProgress.current - t) * 300
        const intensity = Math.min(decel, TYRE_FX.BRAKE_GLOW_INTENSITY) * 0.8

        lightsRef.current.forEach(light => {
            if (light) {
                light.intensity = intensity
                // Position follows truck
                light.position.set(
                    truckWorldPos.x,
                    0.15,
                    truckWorldPos.z - 2.5
                )
            }
        })

        prevProgress.current = t
    })

    const setRef = (i) => (el) => { lightsRef.current[i] = el }

    return (
        <group>
            <pointLight
                ref={setRef(0)}
                color={TYRE_FX.BRAKE_GLOW_COLOR}
                intensity={0}
                distance={4}
                castShadow={false}
            />
            <pointLight
                ref={setRef(1)}
                color={TYRE_FX.BRAKE_GLOW_COLOR}
                intensity={0}
                distance={4}
                castShadow={false}
            />
        </group>
    )
}
