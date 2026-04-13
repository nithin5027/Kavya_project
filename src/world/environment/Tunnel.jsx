/**
 * CINEMATIC TUNNEL — narrative ending segment
 * ═════════════════════════════════════════════
 * Appears at end of route. Opaque walls.
 * Interior lighting via point lights.
 */
import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { TUNNEL } from '../config'
import { routeCurve } from '../core'

export default function Tunnel() {
  const config = TUNNEL

  // Generate tunnel geometry along last portion of spline
  const { geometry, lightPositions } = useMemo(() => {
    const startT = config.START_T
    const endT = config.END_T
    const segments = 40
    const radius = config.RADIUS

    const points = []
    for (let i = 0; i <= segments; i++) {
      const t = startT + (endT - startT) * (i / segments)
      points.push(routeCurve.getPointAt(Math.min(t, 0.999)))
    }

    const tunnelCurve = new THREE.CatmullRomCurve3(points)
    const geo = new THREE.TubeGeometry(tunnelCurve, segments, radius, 12, false)

    // Interior light positions (every 10th segment)
    const lp = []
    for (let i = 0; i < segments; i += 10) {
      const t = startT + (endT - startT) * (i / segments)
      const p = routeCurve.getPointAt(Math.min(t, 0.999))
      lp.push([p.x, p.y + radius * 0.7, p.z])
    }

    return { geometry: geo, lightPositions: lp }
  }, [])

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={config.WALL_COLOR}
          roughness={0.9}
          metalness={0.1}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Interior lights */}
      {lightPositions.map((pos, i) => (
        <pointLight
          key={i}
          position={pos}
          intensity={config.LIGHT_INTENSITY}
          color={config.LIGHT_COLOR}
          distance={config.RADIUS * 4}
          castShadow={false}
        />
      ))}
    </group>
  )
}
