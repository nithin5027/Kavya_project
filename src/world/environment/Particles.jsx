/**
 * PARTICLES — Atmospheric dust + truck dust trail
 * ═══════════════════════════════════════════════
 * All particles use depthWrite: false.
 * No new allocations inside useFrame.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PERF } from '../config'
import { useProgress, truckWorldPos } from '../core'

/* ═══════════════════════════════════════
   ATMOSPHERIC DUST
   ═══════════════════════════════════════ */
export function AtmosphericDust() {
  const ref = useRef()
  const progressRef = useProgress()
  const count = PERF.PARTICLE_COUNT_DUST

  const { positions, phases, basePositions } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const ph = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 150
      pos[i * 3 + 1] = Math.random() * 30 + 1
      pos[i * 3 + 2] = (Math.random() - 0.5) * 150
      ph[i * 3] = Math.random() * Math.PI * 2
      ph[i * 3 + 1] = Math.random() * Math.PI * 2
      ph[i * 3 + 2] = 0.2 + Math.random() * 0.8
    }
    return { positions: pos, phases: ph, basePositions: new Float32Array(pos) }
  }, [count])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.elapsedTime
    const attr = ref.current.geometry.attributes.position
    const arr = attr.array
    for (let i = 0; i < count; i++) {
      const spd = phases[i * 3 + 2]
      const phX = phases[i * 3], phZ = phases[i * 3 + 1]
      arr[i * 3] = basePositions[i * 3] + Math.sin(elapsed * 0.1 * spd + phX) * 4.0 + elapsed * 0.05 * spd
      arr[i * 3 + 1] = basePositions[i * 3 + 1] + Math.sin(elapsed * 0.15 * spd + phX * 1.5) * 0.6
      arr[i * 3 + 2] = basePositions[i * 3 + 2] + Math.sin(elapsed * 0.08 * spd + phZ) * 3.0
      if (arr[i * 3] > 80) arr[i * 3] -= 160
      if (arr[i * 3] < -80) arr[i * 3] += 160
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.15} color="#d4c4a8" transparent opacity={0.25} sizeAttenuation depthWrite={false} />
    </points>
  )
}

/* ═══════════════════════════════════════
   DUST TRAIL (behind truck)
   ═══════════════════════════════════════ */
export function DustTrail() {
  const particlesRef = useRef()
  const progressRef = useProgress()
  const count = PERF.PARTICLE_COUNT_TRAIL
  const velocitiesRef = useRef(new Float32Array(count * 3))
  const lifetimesRef = useRef(new Float32Array(count))
  const prevTruckPos = useRef(new THREE.Vector3())

  const { positions, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sz = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] = -100
      sz[i] = 0.1 + Math.random() * 0.2
      lifetimesRef.current[i] = -1
    }
    return { positions: pos, sizes: sz }
  }, [count])

  useFrame(() => {
    if (!particlesRef.current) return
    const dt = 0.016
    const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
    prevTruckPos.current.copy(truckWorldPos)

    const attr = particlesRef.current.geometry.attributes.position
    const arr = attr.array
    const vel = velocitiesRef.current
    const life = lifetimesRef.current
    const spawnRate = Math.min(5, Math.floor(truckSpeed * 30))
    let spawned = 0

    for (let i = 0; i < count; i++) {
      if (spawned < spawnRate && life[i] < 0) {
        const offset = (Math.random() - 0.5) * 1.5
        arr[i * 3] = truckWorldPos.x + offset
        arr[i * 3 + 1] = 0.2 + Math.random() * 0.3
        arr[i * 3 + 2] = truckWorldPos.z + (Math.random() - 0.5) * 1.5
        vel[i * 3] = (Math.random() - 0.5) * 2
        vel[i * 3 + 1] = Math.random() * 1.5 + 0.5
        vel[i * 3 + 2] = (Math.random() - 0.5) * 2 - truckSpeed * 8
        life[i] = 1.0 + Math.random() * 1.0
        spawned++
      }
      if (life[i] > 0) {
        arr[i * 3] += vel[i * 3] * dt
        arr[i * 3 + 1] += vel[i * 3 + 1] * dt
        arr[i * 3 + 2] += vel[i * 3 + 2] * dt
        vel[i * 3 + 1] -= 1.5 * dt
        vel[i * 3] *= 0.98
        vel[i * 3 + 2] *= 0.98
        life[i] -= dt
        if (life[i] <= 0 || arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = -100
          life[i] = -1
        }
      }
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial size={0.3} color="#C4A77D" transparent opacity={0.4} sizeAttenuation depthWrite={false} />
    </points>
  )
}
