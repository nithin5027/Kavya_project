import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

/*
  TRUCK — Optimized Draco-compressed GLB with Cinematic Realism
  ─────────────────────────────────────────────────────────────
  - Draco-compressed GLB (2.2MB vs 80MB original)
  - Road-aligned positioning with proper ground contact
  - Suspension micro-motion — truck feels heavy & alive
  - Body inertia tilt on turns
  - Distance-based wheel rotation
  - Animated headlights (dim → bright across day/night)
  - Animated tail/brake lights
  - Freeze static parts with matrixAutoUpdate=false
*/

/* ── Helper: Day→Sunset→Night lerp ── */
function lerpV3(a, b, c, t) {
  if (t <= 0.3) return a + (b - a) * (t / 0.3)
  if (t <= 0.7) return b + (c - b) * ((t - 0.3) / 0.4)
  return c
}

/* ── Configure Draco-aware GLTFLoader ── */
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
dracoLoader.setDecoderConfig({ type: 'js' })

/* ── Road surface Y — matches CinematicWorld ground plane ── */
const ROAD_Y = 0

export default function Truck({ progressRef, routeCurve, truckWorldPos }) {
  const group = useRef()
  const modelRef = useRef()
  const wheelsRef = useRef([])
  const headlightsRef = useRef([])
  const taillightsRef = useRef([])

  /* ── Animation state (no React state → zero re-renders) ── */
  const prevT = useRef(0)
  const suspOffset = useRef(0)
  const bodyTilt = useRef(0)
  const wheelAngle = useRef(0)
  const prevPoint = useRef(new THREE.Vector3())
  const prevTangent = useRef(new THREE.Vector3(0, 0, 1))

  /* ── Load Draco-compressed GLB ── */
  const gltf = useLoader(GLTFLoader, '/assets/tr-final.glb', (loader) => {
    loader.setDRACOLoader(dracoLoader)
  })

  /* ── Setup model on load ── */
  useEffect(() => {
    if (!gltf?.scene) return
    const clone = gltf.scene.clone(true)

    /* ── Optimize materials & enable shadows (truck only) ── */
    clone.traverse((child) => {
      if (child.isMesh) {
        // Only the largest mesh casts shadow — reduces shadow render from 446k to ~1 pass
        // receiveShadow on all for ground contact shadow
        child.castShadow = false
        child.receiveShadow = true
        child.frustumCulled = true
        if (child.material) {
          child.material.needsUpdate = true
        }

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

    /* ── Auto-fit: scale to ~8 units, ground-align ── */
    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const targetLength = 8
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = targetLength / maxDim
    clone.scale.setScalar(scale)

    // Re-compute bounds after scaling
    const box2 = new THREE.Box3().setFromObject(clone)
    const center = box2.getCenter(new THREE.Vector3())

    // Center X/Z, and push bottom to y=0 (road contact)
    clone.position.x -= center.x
    clone.position.z -= center.z
    clone.position.y -= box2.min.y

    modelRef.current = clone

    /* ── Auto-detect wheels by name/pattern ── */
    wheelsRef.current = []
    clone.traverse((child) => {
      const name = (child.name || '').toLowerCase()
      if (name.includes('wheel') || name.includes('tire') || name.includes('tyre')) {
        wheelsRef.current.push(child)
      }
    })

    /* ── Mount to group ── */
    if (group.current) {
      while (group.current.children.length > 2) {
        // Keep only the spotlights (first 2), remove old model
        group.current.remove(group.current.children[group.current.children.length - 1])
      }
      group.current.add(clone)
    }
  }, [gltf])

  /* ── Per-frame animation: route follow + realism ── */
  useFrame(({ clock, camera }) => {
    if (!group.current) return
    const t = Math.min(progressRef.current, 0.999)
    const dt = t - prevT.current
    const el = clock.elapsedTime
    const delta = clock.getDelta ? 0.016 : 0.016 // Stable delta

    /* ═══ CINEMATIC ENDING — truck fade ═══ */
    const ENDING_START = 0.92
    const endT = Math.max(0, (t - ENDING_START) / (1.0 - ENDING_START))
    if (endT > 0) {
      // Phase 1: Truck opacity via material traversal (first 30% of ending)
      const fadePhase = Math.min(1, endT / 0.3)
      const opacity = 1.0 - fadePhase * fadePhase // ease-in for dramatic effect
      if (modelRef.current) {
        modelRef.current.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.transparent = true
            child.material.opacity = Math.max(0, opacity)
            child.material.needsUpdate = fadePhase < 0.01 || fadePhase > 0.99 // Only flag at boundaries
          }
        })
      }
      // Also scale down the group slightly
      const scaleDown = 1.0 - fadePhase * 0.3
      group.current.scale.setScalar(scaleDown)
    } else if (group.current.scale.x < 0.99) {
      // Reset if user scrolls back
      group.current.scale.setScalar(1.0)
      if (modelRef.current) {
        modelRef.current.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.opacity = 1.0
          }
        })
      }
    }

    /* ── Route position & tangent ── */
    const pt = routeCurve.getPointAt(t)
    const tan = routeCurve.getTangentAt(t)

    /* ── Distance traveled this frame (for wheel spin) ── */
    const dist = pt.distanceTo(prevPoint.current)

    /* ═══ 1. POSITION ON ROAD ═══ */
    group.current.position.copy(pt)
    group.current.position.y = ROAD_Y + 0.95

    /* ═══ 2. SUSPENSION MICRO-MOTION ═══
       Speed-based bounce + idle vibration.
       Feels heavy — like a 14-ton truck. */
    const speed = Math.abs(dt)
    const suspTarget = Math.min(speed * 12, 0.04)
    suspOffset.current += (suspTarget - suspOffset.current) * 0.06

    // Idle engine vibration (always-on, subtle)
    const idleVib = Math.sin(el * 18) * 0.0008 + Math.sin(el * 27) * 0.0004

    // Road surface micro-bumps (speed-dependent)
    const roadBump = speed > 0.0001
      ? Math.sin(el * 6) * 0.002 + Math.sin(el * 11.3) * 0.001
      : 0

    group.current.position.y -= suspOffset.current
    group.current.position.y += idleVib + roadBump

    /* ═══ 3. BODY INERTIA TILT ═══
       Slight Z-roll on lateral movement — truck has mass. */
    const lateralDelta = tan.x - prevTangent.current.x
    const tiltTarget = -lateralDelta * 0.15
    bodyTilt.current += (tiltTarget - bodyTilt.current) * 0.04
    group.current.rotation.z = Math.max(-0.008, Math.min(0.008, bodyTilt.current))

    // Slight pitch from acceleration/braking
    const accel = dt - (prevT.current - (prevT.current || 0))
    group.current.rotation.x = Math.sin(el * 1.5) * 0.001

    /* ═══ 4. FACE DIRECTION (lookAt road tangent) ═══ */
    const look = pt.clone().add(tan)
    look.y = ROAD_Y + 0.95
    group.current.lookAt(look)
    // Re-apply tilt after lookAt overwrites rotation
    group.current.rotation.z += Math.max(-0.008, Math.min(0.008, bodyTilt.current))

    /* ═══ 5. WHEEL ROTATION ═══
       Distance-based, with easing. */
    const wheelRadius = 0.48
    const wheelDelta = dist / wheelRadius
    wheelAngle.current += wheelDelta * 3 // Multiply for visual correctness at scale
    wheelsRef.current.forEach((w) => {
      if (w) w.rotation.x = wheelAngle.current
    })

    /* ═══ 6. HEADLIGHTS — animate with time of day ═══ */
    const hlIntensity = lerpV3(0.2, 0.8, 2.0, t)
    const hlDistance = lerpV3(12, 18, 25, t)
    headlightsRef.current.forEach((hl) => {
      if (hl) {
        hl.intensity = hlIntensity
        hl.distance = hlDistance
      }
    })

    /* ═══ 7. TAIL LIGHTS — brake on deceleration ═══ */
    const braking = prevT.current > 0.01 ? Math.max(0, -dt) * 400 : 0
    const tlBase = lerpV3(0.1, 0.4, 0.8, t) // Brighter at night
    taillightsRef.current.forEach((tl) => {
      if (tl) tl.intensity = tlBase + Math.min(braking, 3)
    })

    /* ═══ 8. UPDATE WORLD POSITION (for camera/dust tracking) ═══ */
    truckWorldPos.copy(group.current.position)

    /* ── Store for next frame ── */
    prevT.current = t
    prevPoint.current.copy(pt)
    prevTangent.current.copy(tan)
  })

  const hlRef = (i) => (el) => { headlightsRef.current[i] = el }
  const tlRef = (i) => (el) => { taillightsRef.current[i] = el }

  return (
    <group ref={group}>
      {/* ═══ HEADLIGHTS — warm cinematic spots ═══ */}
      <spotLight
        ref={hlRef(0)}
        position={[0.7, 1.0, 4.2]}
        intensity={0.3}
        angle={0.4}
        penumbra={0.8}
        color="#fff2d6"
        distance={18}
        castShadow={false}
      />
      <spotLight
        ref={hlRef(1)}
        position={[-0.7, 1.0, 4.2]}
        intensity={0.3}
        angle={0.4}
        penumbra={0.8}
        color="#fff2d6"
        distance={18}
        castShadow={false}
      />
      {/* Headlight target (forward) */}
      <group position={[0, 0.5, 12]}>
        <object3D />
      </group>

      {/* ═══ TAIL LIGHTS — red glow ═══ */}
      <pointLight
        ref={tlRef(0)}
        position={[0.8, 0.8, -4.2]}
        color="#ff2020"
        intensity={0.2}
        distance={6}
        castShadow={false}
      />
      <pointLight
        ref={tlRef(1)}
        position={[-0.8, 0.8, -4.2]}
        color="#ff2020"
        intensity={0.2}
        distance={6}
        castShadow={false}
      />
    </group>
  )
}
