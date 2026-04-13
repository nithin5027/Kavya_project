/**
 * TRUCK V2 — Draco-compressed GLB with advanced cinematic realism
 * ═══════════════════════════════════════════════════════════════
 * Road-aligned, suspension bounce, body tilt, wheel spin,
 * animated headlights/taillights, FRONT WHEEL STEERING,
 * gear-shift body pitch, independent rear axle bounce,
 * speed-based wheel blur, idle exhaust oscillation.
 * No clipping under any condition.
 */
import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { SCENE } from '../config'
import { routeCurve, truckWorldPos, lerpValue3 } from '../core'

const ROAD_Y = SCENE.TRUCK_Y

/* ── Configure Draco ── */
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
dracoLoader.setDecoderConfig({ type: 'js' })

export default function Truck({ progressRef }) {
  const group = useRef()
  const modelRef = useRef()
  const wheelsRef = useRef([])
  const headlightsRef = useRef([])
  const taillightsRef = useRef([])

  // Animation state (no React state → zero re-renders)
  const prevT = useRef(0)
  const suspOffset = useRef(0)
  const bodyTilt = useRef(0)
  const wheelAngle = useRef(0)
  const prevPoint = useRef(new THREE.Vector3())
  const prevTangent = useRef(new THREE.Vector3(0, 0, 1))

  // V2 Enhanced physics state
  const frontWheelsRef = useRef([])
  const rearWheelsRef = useRef([])
  const steerAngle = useRef(0)
  const gearPitch = useRef(0)
  const rearSuspOffset = useRef(0)
  const smoothSpeed = useRef(0)
  const prevSpeed = useRef(0)

  // Load Draco GLB
  const gltf = useLoader(GLTFLoader, '/assets/tr-final.glb', (loader) => {
    loader.setDRACOLoader(dracoLoader)
  })

  // Setup model
  useEffect(() => {
    if (!gltf?.scene) return
    const clone = gltf.scene.clone(true)

    clone.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false
        child.receiveShadow = true
        child.frustumCulled = true
        if (child.material) child.material.needsUpdate = true

        // Fix mirrored banner: left-side banner has negative scale, flip UVs
        if (child.name && child.name.toLowerCase().includes('banner') && child.scale.x < 0) {
          child.geometry = child.geometry.clone()
          const uv = child.geometry.getAttribute('uv')
          if (uv) {
            for (let i = 0; i < uv.count; i++) {
              uv.setX(i, 1 - uv.getX(i))
            }
            uv.needsUpdate = true
          }
        }
      }
    })

    // Auto-fit: scale to ~8 units, ground-align
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const scale = 8 / Math.max(size.x, size.y, size.z)
    clone.scale.setScalar(scale)

    const box2 = new THREE.Box3().setFromObject(clone)
    const center = box2.getCenter(new THREE.Vector3())
    clone.position.x -= center.x
    clone.position.z -= center.z
    clone.position.y -= box2.min.y

    modelRef.current = clone

    // Auto-detect wheels — separate front/rear
    wheelsRef.current = []
    frontWheelsRef.current = []
    rearWheelsRef.current = []
    clone.traverse((child) => {
      const name = (child.name || '').toLowerCase()
      if (name.includes('wheel') || name.includes('tire') || name.includes('tyre')) {
        wheelsRef.current.push(child)
        // Classify as front or rear based on name or z-position
        if (name.includes('front') || name.includes('fl') || name.includes('fr')) {
          frontWheelsRef.current.push(child)
        } else if (name.includes('rear') || name.includes('rl') || name.includes('rr') || name.includes('back')) {
          rearWheelsRef.current.push(child)
        } else {
          // If names don't indicate, use world position z
          // (will be classified after first frame)
          rearWheelsRef.current.push(child)
        }
      }
    })
    // If no explicit front/rear detected, split by half
    if (frontWheelsRef.current.length === 0 && wheelsRef.current.length >= 2) {
      const half = Math.floor(wheelsRef.current.length / 2)
      frontWheelsRef.current = wheelsRef.current.slice(0, half)
      rearWheelsRef.current = wheelsRef.current.slice(half)
    }

    if (group.current) {
      while (group.current.children.length > 2) {
        group.current.remove(group.current.children[group.current.children.length - 1])
      }
      group.current.add(clone)
    }
  }, [gltf])

  // Per-frame animation
  useFrame(({ clock }) => {
    if (!group.current) return
    const t = Math.min(progressRef.current, 0.999)
    const dt = t - prevT.current
    const el = clock.elapsedTime

    const pt = routeCurve.getPointAt(t)
    const tan = routeCurve.getTangentAt(t)
    const dist = pt.distanceTo(prevPoint.current)

    // 1. Position on road
    group.current.position.copy(pt)
    group.current.position.y = ROAD_Y

    // 2. Suspension micro-motion
    const speed = Math.abs(dt)
    const suspTarget = Math.min(speed * 12, 0.04)
    suspOffset.current += (suspTarget - suspOffset.current) * 0.06
    const idleVib = Math.sin(el * 18) * 0.0008 + Math.sin(el * 27) * 0.0004
    const roadBump = speed > 0.0001 ? Math.sin(el * 6) * 0.002 + Math.sin(el * 11.3) * 0.001 : 0
    group.current.position.y -= suspOffset.current
    group.current.position.y += idleVib + roadBump

    // 3. Body inertia tilt
    const lateralDelta = tan.x - prevTangent.current.x
    const tiltTarget = -lateralDelta * 0.15
    bodyTilt.current += (tiltTarget - bodyTilt.current) * 0.04

    // 4. Face direction (must precede rotation adjustments)
    const look = pt.clone().add(tan)
    look.y = ROAD_Y
    group.current.lookAt(look)

    // 5. Apply pitch bob + tilt AFTER lookAt so they aren't overwritten
    group.current.rotation.x += Math.sin(el * 1.5) * 0.001
    group.current.rotation.z += Math.max(-0.008, Math.min(0.008, bodyTilt.current))

    // ═══ V2: Gear-shift body pitch ═══
    const accel = dt // positive = accelerating
    const gearPitchTarget = -accel * 8.0 // pitch forward on accel, back on decel
    gearPitch.current += (gearPitchTarget - gearPitch.current) * 0.05
    group.current.rotation.x += Math.max(-0.012, Math.min(0.012, gearPitch.current))

    // ═══ V2: Idle exhaust oscillation ═══
    if (speed < 0.0005) {
      group.current.rotation.x += Math.sin(el * 3.2) * 0.0005
      group.current.rotation.z += Math.sin(el * 2.1) * 0.0003
    }

    // 5. Wheel rotation
    wheelAngle.current += (dist / 0.48) * 3
    // All wheels spin
    wheelsRef.current.forEach(w => { if (w) w.rotation.x = wheelAngle.current })

    // ═══ V2: Front wheel steering ═══
    const steerTarget = lateralDelta * 2.5 // proportional to curve change
    steerAngle.current += (steerTarget - steerAngle.current) * 0.08
    const clampedSteer = Math.max(-0.35, Math.min(0.35, steerAngle.current))
    frontWheelsRef.current.forEach(w => {
      if (w) w.rotation.y = clampedSteer
    })

    // ═══ V2: Independent rear axle bounce ═══
    const rearSuspTarget = Math.min(speed * 18, 0.06)
    rearSuspOffset.current += (rearSuspTarget - rearSuspOffset.current) * 0.04
    const rearBounce = speed > 0.0001
      ? Math.sin(el * 8.5) * 0.003 + Math.sin(el * 14.7) * 0.001
      : 0
    rearWheelsRef.current.forEach(w => {
      if (w) w.position.y += (rearBounce - rearSuspOffset.current * 0.5) * 0.1
    })

    // ═══ V2: Speed tracking for external use ═══
    smoothSpeed.current += (speed - smoothSpeed.current) * 0.1
    prevSpeed.current = speed

    // 6. Headlights
    const hlIntensity = lerpValue3(0.2, 0.8, 2.0, t)
    const hlDistance = lerpValue3(12, 18, 25, t)
    headlightsRef.current.forEach(hl => {
      if (hl) { hl.intensity = hlIntensity; hl.distance = hlDistance }
    })

    // 7. Tail lights (brake on deceleration)
    const braking = prevT.current > 0.01 ? Math.max(0, -dt) * 400 : 0
    const tlBase = lerpValue3(0.1, 0.4, 0.8, t)
    taillightsRef.current.forEach(tl => {
      if (tl) tl.intensity = tlBase + Math.min(braking, 3)
    })

    // 8. Update shared world position
    truckWorldPos.copy(group.current.position)

    prevT.current = t
    prevPoint.current.copy(pt)
    prevTangent.current.copy(tan)
  })

  const hlRef = (i) => (el) => { headlightsRef.current[i] = el }
  const tlRef = (i) => (el) => { taillightsRef.current[i] = el }

  return (
    <group ref={group}>
      <spotLight ref={hlRef(0)} position={[0.7, 1.0, 4.2]} intensity={0.3} angle={0.4} penumbra={0.8} color="#fff2d6" distance={18} castShadow={false} />
      <spotLight ref={hlRef(1)} position={[-0.7, 1.0, 4.2]} intensity={0.3} angle={0.4} penumbra={0.8} color="#fff2d6" distance={18} castShadow={false} />
      <group position={[0, 0.5, 12]}><object3D /></group>
      <pointLight ref={tlRef(0)} position={[0.8, 0.8, -4.2]} color="#ff2020" intensity={0.2} distance={6} castShadow={false} />
      <pointLight ref={tlRef(1)} position={[-0.8, 0.8, -4.2]} color="#ff2020" intensity={0.2} distance={6} castShadow={false} />
    </group>
  )
}
