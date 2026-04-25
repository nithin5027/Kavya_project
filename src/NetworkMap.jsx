import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useProgress } from './CinematicWorld'

/*
  PanIndiaNetwork — 3D logistics hub visualization (OPTIMIZED)
  ─────────────────────────────────────────────────────────────
  Instanced mesh for all hub nodes (single draw call).
  Connection arcs pulse only near truck position — far routes remain calm.
  Shader-based glow, no sprites.
*/

const HUBS = [
  { name: 'Tirunelveli', pos: [-35, 0.3, 40], activate: 0.0 },
  { name: 'Coimbatore', pos: [-18, 0.3, 25], activate: 0.20 },
  { name: 'Bangalore', pos: [-8, 0.3, 8], activate: 0.30 },
  { name: 'Chennai', pos: [5, 0.3, 18], activate: 0.35 },
  { name: 'Hyderabad', pos: [8, 0.3, -2], activate: 0.50 },
  { name: 'Pune', pos: [14, 0.3, -12], activate: 0.55 },
  { name: 'Mumbai', pos: [22, 0.3, -22], activate: 0.65 },
  { name: 'Kolkata', pos: [35, 0.3, -8], activate: 0.70 },
  { name: 'Delhi', pos: [25, 0.3, -45], activate: 0.85 },
]

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [4, 8], [3, 7], [6, 8],
]

/* ── Shared shaders for connection arcs — proximity-aware ── */
const _connVert = /* glsl */ `
  varying float vAlong;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  void main() {
    vAlong = uv.x;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`

const _connFrag = /* glsl */ `
  uniform float uTime;
  uniform float uActivated;
  uniform vec3 uTruckPos;
  varying float vAlong;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  void main() {
    // Distance from truck — routes pulse only near truck, far routes stay calm
    float truckDist = distance(vWorldPos.xz, uTruckPos.xz);
    float proximity = 1.0 - smoothstep(10.0, 40.0, truckDist);

    // Traveling energy pulse — intensity modulated by truck proximity
    float pulse = sin(vAlong * 25.0 - uTime * 2.5) * 0.5 + 0.5;
    pulse = smoothstep(0.2, 0.8, pulse) * proximity;

    vec3 baseColor = vec3(0.184, 0.424, 1.0);  // #2f6cff
    vec3 glowColor = vec3(0.36, 0.55, 1.0);
    vec3 color = mix(baseColor, glowColor, pulse * 0.6);

    // FogExp2 integration
    float fogFade = 1.0 - exp(-0.035 * 0.035 * vFogDepth * vFogDepth);
    float alpha = uActivated * (0.15 + pulse * 0.35) * (1.0 - fogFade * 0.7);

    gl_FragColor = vec4(color, alpha);
  }
`

// Shared hub geometry (instanced)
const _hubSphereGeo = new THREE.SphereGeometry(0.35, 12, 12)
const _hubMat = new THREE.MeshStandardMaterial({
  color: '#2f6cff',
  emissive: '#2f6cff',
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.9,
})

const _dummy = new THREE.Object3D()

export default function NetworkMap() {
  const progressRef = useProgress()
  const instanceRef = useRef()
  const truckPosRef = useRef(new THREE.Vector3())

  /* ── Route curve (same as World) for truck position ── */
  const routeCurve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-40, 0.1, 45), new THREE.Vector3(-25, 0.1, 30),
      new THREE.Vector3(-10, 0.1, 18), new THREE.Vector3(0, 0.1, 8),
      new THREE.Vector3(8, 0.1, 0), new THREE.Vector3(15, 0.1, -10),
      new THREE.Vector3(20, 0.1, -22), new THREE.Vector3(22, 0.1, -34),
      new THREE.Vector3(24, 0.1, -44), new THREE.Vector3(25, 0.1, -50),
    ], false, 'centripetal', 0.5)
  }, [])

  /* ── Connection arcs ── */
  const connectionData = useMemo(() => {
    return CONNECTIONS.map(([fromIdx, toIdx]) => {
      const from = new THREE.Vector3(...HUBS[fromIdx].pos)
      const to = new THREE.Vector3(...HUBS[toIdx].pos)
      const mid = new THREE.Vector3().lerpVectors(from, to, 0.5)
      mid.y += from.distanceTo(to) * 0.12
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to)
      const geom = new THREE.TubeGeometry(curve, 32, 0.03, 5, false)
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uActivated: { value: 0 },
          uTruckPos: { value: new THREE.Vector3() },
        },
        vertexShader: _connVert,
        fragmentShader: _connFrag,
      })
      return { geom, mat, fromIdx, toIdx }
    })
  }, [])

  /* ── Per-frame ── */
  useFrame(({ clock }) => {
    const t = progressRef.current
    const time = clock.elapsedTime

    // Track truck position for proximity-based pulse
    const truckT = Math.min(t, 0.999)
    truckPosRef.current.copy(routeCurve.getPointAt(truckT))

    // Update instanced hub nodes
    if (instanceRef.current) {
      HUBS.forEach((hub, i) => {
        const active = t > hub.activate
        const scale = active ? 1.0 : 0.05
        _dummy.position.set(...hub.pos)
        _dummy.scale.setScalar(scale)
        _dummy.updateMatrix()
        instanceRef.current.setMatrixAt(i, _dummy.matrix)
      })
      instanceRef.current.instanceMatrix.needsUpdate = true
    }

    // Update connections
    connectionData.forEach(({ mat, fromIdx, toIdx }) => {
      const bothActive = t > HUBS[fromIdx].activate && t > HUBS[toIdx].activate
      const target = bothActive ? 1.0 : 0.0
      mat.uniforms.uActivated.value += (target - mat.uniforms.uActivated.value) * 0.04
      mat.uniforms.uTime.value = time
      mat.uniforms.uTruckPos.value.copy(truckPosRef.current)
    })
  })

  return (
    <group>
      {/* Instanced hub spheres — single draw call */}
      <instancedMesh ref={instanceRef} args={[_hubSphereGeo, _hubMat, HUBS.length]} />

      {/* Connection arcs */}
      {connectionData.map(({ geom, mat }, i) => (
        <mesh key={`conn-${i}`} geometry={geom} material={mat} />
      ))}
    </group>
  )
}
