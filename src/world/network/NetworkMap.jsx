/**
 * NETWORK MAP — GPU-instanced Indian logistics hub visualization
 * ══════════════════════════════════════════════════════════════
 * 9 city hubs as instanced spheres.
 * QuadraticBezierCurve3 arcs between them.
 * Proximity-aware pulse shader.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NETWORK_HUBS } from '../config'
import { useProgress, truckWorldPos } from '../core'

const _color = new THREE.Color()
const _mat4 = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3(1, 1, 1)
const _quat = new THREE.Quaternion()

export default function NetworkMap() {
  const progressRef = useProgress()
  const hubRef = useRef()
  const arcsRef = useRef([])
  const hubs = NETWORK_HUBS
  const count = hubs.length

  // Place hub instances
  useEffect(() => {
    if (!hubRef.current) return
    hubs.forEach((hub, i) => {
      _pos.set(hub.x, hub.y + 0.5, hub.z)
      _mat4.compose(_pos, _quat, _scale)
      hubRef.current.setMatrixAt(i, _mat4)
      _color.set(hub.color || '#ff8800')
      hubRef.current.setColorAt(i, _color)
    })
    hubRef.current.instanceMatrix.needsUpdate = true
    if (hubRef.current.instanceColor) hubRef.current.instanceColor.needsUpdate = true
  }, [hubs])

  // Arc connections
  const arcs = useMemo(() => {
    const connections = []
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count
      const a = hubs[i], b = hubs[j]
      const mid = new THREE.Vector3(
        (a.x + b.x) / 2,
        Math.max(a.y, b.y) + 8 + Math.random() * 4,
        (a.z + b.z) / 2
      )
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(a.x, a.y + 0.5, a.z),
        mid,
        new THREE.Vector3(b.x, b.y + 0.5, b.z)
      )
      const points = curve.getPoints(40)
      connections.push({ points, from: a, to: b })
    }
    return connections
  }, [hubs, count])

  // Arc pulse animation
  useFrame(({ clock }) => {
    if (!arcsRef.current.length) return
    const t = clock.elapsedTime
    arcsRef.current.forEach((arc, i) => {
      if (arc && arc.material) {
        const pulse = (Math.sin(t * 2 + i * 0.7) * 0.5 + 0.5)
        arc.material.opacity = 0.15 + pulse * 0.35
      }
    })
  })

  // Hub glow animation
  useFrame(() => {
    if (!hubRef.current) return
    const t = progressRef.current
    // Scale up hubs near truck
    hubs.forEach((hub, i) => {
      const dist = Math.sqrt(
        Math.pow(hub.x - truckWorldPos.x, 2) + Math.pow(hub.z - truckWorldPos.z, 2)
      )
      const proximity = Math.max(0, 1 - dist / 40)
      const s = 1 + proximity * 1.5
      _pos.set(hub.x, hub.y + 0.5, hub.z)
      _scale.set(s, s, s)
      _mat4.compose(_pos, _quat, _scale)
      hubRef.current.setMatrixAt(i, _mat4)
    })
    hubRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* Hub nodes */}
      <instancedMesh ref={hubRef} args={[null, null, count]}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial
          emissive="#ff6600"
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.5}
        />
      </instancedMesh>

      {/* Arc connections */}
      {arcs.map((arc, i) => (
        <line key={i} ref={el => { arcsRef.current[i] = el }}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={arc.points.length}
              array={new Float32Array(arc.points.flatMap(p => [p.x, p.y, p.z]))}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#ff8800"
            transparent
            opacity={0.3}
            depthWrite={false}
            linewidth={1}
          />
        </line>
      ))}

      {/* City labels */}
      {hubs.map((hub, i) => (
        <group key={`label-${i}`} position={[hub.x, hub.y + 2.5, hub.z]}>
          <sprite scale={[4, 1, 1]}>
            <spriteMaterial transparent opacity={0.7} depthWrite={false} />
          </sprite>
        </group>
      ))}
    </group>
  )
}
