import { useRef, useMemo, createContext, useContext } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { EffectComposer, Noise, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import CameraRig, { getCameraPaused } from './CameraRig'
import NetworkMap from './NetworkMap'
import Truck from './Truck'

/*
  World — CINEMATIC DAY → SUNSET → NIGHT logistics ecosystem
  ───────────────────────────────────────────────────────────
  Scroll drives world grading: Day (0–30%) → Sunset (30–70%) → Night (70–100%)
  All transitions lerped, never snapped.
  3 lights at all times. No HDR. No volumetrics.
  Truck is the narrative hero. Camera is the experience.
*/

const ProgressCtx = createContext({ current: 0 })
export const useProgress = () => useContext(ProgressCtx)

/* ── Color grading keyframes ── */
/* BRIGHT DAY → Warm Golden Hour — neutral enough to show true material colors */
const _dayBg = new THREE.Color('#f5f7fa')
const _sunsetBg = new THREE.Color('#f8f0e8')
const _nightBg = new THREE.Color('#f5ece2')

const _dayFog = new THREE.Color('#eef2f8')
const _sunsetFog = new THREE.Color('#f2e8dc')
const _nightFog = new THREE.Color('#eee4d8')

const _dayAmb = new THREE.Color('#ffffff')
const _sunsetAmb = new THREE.Color('#fff6ee')
const _nightAmb = new THREE.Color('#fff0e0')

const _dayKey = new THREE.Color('#ffffff')
const _sunsetKey = new THREE.Color('#ffe8cc')
const _nightKey = new THREE.Color('#ffddb5')

const _dayRim = new THREE.Color('#c0d8ff')
const _sunsetRim = new THREE.Color('#90b8ff')
const _nightRim = new THREE.Color('#a0c0ff')

const _tmpColor = new THREE.Color()

function lerpColor3(a, b, c, t) {
  if (t <= 0.3) {
    const lt = t / 0.3
    return _tmpColor.copy(a).lerp(b, lt)
  } else if (t <= 0.7) {
    const lt = (t - 0.3) / 0.4
    return _tmpColor.copy(b).lerp(c, lt)
  } else {
    return _tmpColor.copy(c)
  }
}

function lerpValue3(a, b, c, t) {
  if (t <= 0.3) return a + (b - a) * (t / 0.3)
  if (t <= 0.7) return b + (c - b) * ((t - 0.3) / 0.4)
  return c
}

/* ── WorldGrading — lerps scene fog/bg and light params every frame ── */
/* Fog BREATHING: density oscillates ±0.002 at 0.15 Hz — atmosphere feels alive.
   At camera pauses, breathing slows (0.06 Hz) — world calms with camera.
   Lights also dampen micro-flicker at pauses for "predictive calm." */
function WorldGrading({ progressRef, ambRef, keyRef, rimRef }) {
  const { scene } = useThree()
  const breathRef = useRef(0)              // smoothed breathing offset
  const lightFlickerRef = useRef(0)        // micro-flicker for key light

  useMemo(() => {
    scene.fog = new THREE.FogExp2('#eef2f8', 0.010)
    scene.background = new THREE.Color('#f5f7fa')
  }, [scene])

  useFrame(({ clock }) => {
    const t = progressRef.current
    const elapsed = clock.elapsedTime

    // Detect camera pause for "predictive calm"
    const isPause = getCameraPaused(t)
    const breathFreq = isPause ? 0.06 : 0.15      // slow at pauses
    const breathAmp  = isPause ? 0.0008 : 0.002    // reduce amplitude at pauses
    const targetBreath = Math.sin(elapsed * breathFreq * Math.PI * 2) * breathAmp
    breathRef.current += (targetBreath - breathRef.current) * 0.04  // smoothed

    // Background
    lerpColor3(_dayBg, _sunsetBg, _nightBg, t)
    scene.background.copy(_tmpColor)

    // Fog — base density + breathing
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    scene.fog.color.copy(_tmpColor)
    const baseDensity = lerpValue3(0.010, 0.013, 0.015, t)
    scene.fog.density = baseDensity + breathRef.current

    // Micro light flicker — key light (campfire-subtle, not strobe)
    const flickTarget = isPause ? 0 : Math.sin(elapsed * 2.3) * 0.015 + Math.sin(elapsed * 5.1) * 0.008
    lightFlickerRef.current += (flickTarget - lightFlickerRef.current) * 0.05

    // Ambient light — stays bright throughout
    if (ambRef.current) {
      lerpColor3(_dayAmb, _sunsetAmb, _nightAmb, t)
      ambRef.current.color.copy(_tmpColor)
      ambRef.current.intensity = lerpValue3(0.75, 0.70, 0.65, t)
    }

    // Key/sun directional — stays strong, warm golden hour
    if (keyRef.current) {
      lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
      keyRef.current.color.copy(_tmpColor)
      keyRef.current.intensity = lerpValue3(1.8, 1.7, 1.5, t) + lightFlickerRef.current
    }

    // Rim directional — stays visible
    if (rimRef.current) {
      lerpColor3(_dayRim, _sunsetRim, _nightRim, t)
      rimRef.current.color.copy(_tmpColor)
      rimRef.current.intensity = lerpValue3(0.65, 0.60, 0.55, t)
    }
  })

  return null
}


/* ── SunLight — directional key that LOWERS as sunset approaches ── */
function SunLight({ keyRef, progressRef }) {
  useFrame(() => {
    if (!keyRef.current) return
    const t = progressRef.current
    // Sun stays high — gentle descent for golden hour, never goes dark
    keyRef.current.position.x = lerpValue3(8, 5, 4, t)
    keyRef.current.position.y = lerpValue3(14, 10, 8, t)
    keyRef.current.position.z = lerpValue3(-6, -5, -5, t)
  })

  return (
    <directionalLight
      ref={keyRef}
      position={[8, 12, -6]} intensity={1.3} color="#fff4e8"
      castShadow shadow-mapSize={[1024, 1024]}
      shadow-camera-near={1} shadow-camera-far={120}
      shadow-camera-left={-30} shadow-camera-right={30}
      shadow-camera-top={30} shadow-camera-bottom={-30}
      shadow-bias={-0.002}
    />
  )
}


export default function World({ progressRef }) {
  const ambRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()

  return (
    <ProgressCtx.Provider value={progressRef}>
      <CameraRig progressRef={progressRef} />
      <WorldGrading progressRef={progressRef} ambRef={ambRef} keyRef={keyRef} rimRef={rimRef} />

      {/* ── 3 LIGHTS ONLY — colors/intensities driven by WorldGrading ── */}
      <SunLight keyRef={keyRef} progressRef={progressRef} />
      <ambientLight ref={ambRef} intensity={0.75} color="#ffffff" />
      <directionalLight ref={rimRef} position={[-6, 8, 6]} intensity={0.65} color="#c0d8ff" />

      <Ground progressRef={progressRef} />
      <GroundFog progressRef={progressRef} />
      <Road progressRef={progressRef} />
      <Route />
      <Truck progressRef={progressRef} routeCurve={routeCurve} truckWorldPos={_truckWorldPos} />
      <BrandedMilestones />
      <KavyaWarehouses />
      <KavyaContainerYard />
      <KavyaSignboards />
      <IndustrialPylons />
      <LightShafts progressRef={progressRef} />
      <Atmosphere progressRef={progressRef} />
      <HeatShimmer progressRef={progressRef} />
      <NetworkMap />

      <EffectComposer multisampling={0}>
        <Noise opacity={0.004} />
        <Vignette offset={0.2} darkness={0.3} />
      </EffectComposer>
    </ProgressCtx.Provider>
  )
}


/* ═══════════════════════════════════════════════
   ROUTE CURVE
   ═══════════════════════════════════════════════ */
const ROUTE_POINTS = [
  new THREE.Vector3(-40, 0.1, 45),
  new THREE.Vector3(-25, 0.1, 30),
  new THREE.Vector3(-10, 0.1, 18),
  new THREE.Vector3(0, 0.1, 8),
  new THREE.Vector3(8, 0.1, 0),
  new THREE.Vector3(15, 0.1, -10),
  new THREE.Vector3(20, 0.1, -25),
  new THREE.Vector3(25, 0.1, -40),
  new THREE.Vector3(28, 0.1, -55),
]
const routeCurve = new THREE.CatmullRomCurve3(ROUTE_POINTS, false, 'centripetal', 0.5)

/* Shared truck position — updated by Truck, read by GroundFog + Warehouses */
const _truckWorldPos = new THREE.Vector3()


/* ═══════════════════════════════════════════════
   GROUND FOG — low-lying atmospheric layer
   ═══════════════════════════════════════════════
   ShaderMaterial plane hovering just above ground.
   Noise-based opacity, UV drift for wind motion.
   Truck punches a wake hole via uTruckPos uniform.
   Stronger during golden hour, thins at night.
   This is "the air" — if this doesn't move, nothing feels real.
*/
function GroundFog({ progressRef }) {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.12 },
        uFogColor: { value: new THREE.Color('#edf1f7') },
        uTruckPos: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uFogColor;
        uniform vec2 uTruckPos;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 drift = vWorldPos.xz * 0.015 + vec2(uTime * 0.08, uTime * 0.03);
          float n1 = vnoise(drift * 3.0);
          float n2 = vnoise(drift * 7.0 + 50.0);
          float fog = n1 * 0.6 + n2 * 0.4;

          float truckDist = length(vWorldPos.xz - uTruckPos);
          float wake = smoothstep(3.0, 8.0, truckDist);
          fog *= wake;

          float distFade = 1.0 - exp(-0.0004 * vFogDepth * vFogDepth);
          fog *= (1.0 - distFade * 0.6);

          float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(0.0, 0.08, 1.0 - vUv.x)
                         * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.0, 0.08, 1.0 - vUv.y);
          fog *= edgeFade;

          gl_FragColor = vec4(uFogColor, fog * uOpacity);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uOpacity.value = lerpValue3(0.08, 0.18, 0.10, t)
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uTruckPos.value.set(_truckWorldPos.x, _truckWorldPos.z)
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.35, 0]} material={mat}>
      <planeGeometry args={[200, 200, 1, 1]} />
    </mesh>
  )
}


/* ═══════════════════════════════════════════════
   LIGHT SHAFTS — god-ray illusion (transparent planes)
   ═══════════════════════════════════════════════
   Thin stretched planes aligned with key light direction.
   Visible only during golden hour (t=0.25–0.75).
   Cheap, powerful, zero GPU cost.
   "Light affected by dust" — this is the illusion.
*/
function LightShafts({ progressRef }) {
  const groupRef = useRef()

  const shafts = useMemo(() => [
    { pos: [6, 6, 10], rot: [0.3, 0.5, 0.1], scale: [0.5, 16, 1] },
    { pos: [-4, 5, -5], rot: [0.25, -0.3, 0.15], scale: [0.4, 14, 1] },
    { pos: [12, 7, -20], rot: [0.35, 0.2, -0.1], scale: [0.6, 18, 1] },
  ], [])

  useFrame(() => {
    if (!groupRef.current) return
    const t = progressRef.current
    let alpha = 0
    if (t > 0.2 && t < 0.75) {
      const enter = Math.min(1, (t - 0.2) / 0.15)
      const exit = Math.min(1, (0.75 - t) / 0.15)
      alpha = Math.min(enter, exit) * 0.06
    }
    groupRef.current.children.forEach(child => {
      if (child.material) child.material.opacity = alpha
    })
  })

  return (
    <group ref={groupRef}>
      {shafts.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} scale={s.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            color="#fff4d0"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   GROUND — sunset-responsive industrial plane
   ═══════════════════════════════════════════════ */
function Ground({ progressRef }) {
  const matRef = useRef()

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uFogColor: { value: new THREE.Color('#edf1f7') },
        uFogDensity: { value: 0.018 },
        uGroundTint: { value: new THREE.Color('#dfe5ee') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFogDepth;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uGroundTint;
        varying vec2 vUv;
        varying float vFogDepth;
        varying vec3 vWorldPos;
        void main() {
          vec2 grid = abs(fract(vUv * 60.0 - 0.5) - 0.5);
          float line = min(grid.x, grid.y);
          float g = 1.0 - smoothstep(0.0, 0.02, line);

          vec3 baseCol = uGroundTint;
          float noise = fract(sin(dot(vWorldPos.xz * 0.5, vec2(12.9898, 78.233))) * 43758.5453);
          baseCol += (noise - 0.5) * 0.02;

          vec3 gridCol = uGroundTint * 0.88;
          vec3 col = mix(baseCol, gridCol, g * 0.2);

          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFactor);
          float alpha = (1.0 - fogFactor) * 0.95;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  }, [])

  // Day → sunset → night ground tint
  const _dayGround = useMemo(() => new THREE.Color('#dfe5ee'), [])
  const _sunsetGround = useMemo(() => new THREE.Color('#d9c2aa'), [])
  const _nightGround = useMemo(() => new THREE.Color('#d4bda5'), [])
  const _tC = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const t = progressRef.current
    // Lerp ground tint
    if (t <= 0.3) _tC.copy(_dayGround).lerp(_sunsetGround, t / 0.3)
    else if (t <= 0.7) _tC.copy(_sunsetGround).lerp(_nightGround, (t - 0.3) / 0.4)
    else _tC.copy(_nightGround)
    mat.uniforms.uGroundTint.value.copy(_tC)

    // Sync fog uniforms with scene fog
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uFogDensity.value = lerpValue3(0.015, 0.018, 0.020, t)
  })

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} material={mat}>
      <planeGeometry args={[400, 400, 1, 1]} />
    </mesh>
  )
}


/* ═══════════════════════════════════════════════
   ROAD — asphalt surface along route
   ═══════════════════════════════════════════════ */
function Road({ progressRef }) {
  const geom = useMemo(() => {
    const points = routeCurve.getSpacedPoints(200)
    const frames = routeCurve.computeFrenetFrames(200, false)
    const positions = []
    const uvs = []

    for (let i = 0; i <= 200; i++) {
      const p = points[i]
      const binormal = frames.binormals[i]
      for (let j = 0; j <= 4; j++) {
        const t = (j / 4) * 4 - 2
        const px = p.x + binormal.x * t
        const py = 0.05
        const pz = p.z + binormal.z * t
        positions.push(px, py, pz)
        uvs.push(j / 4, i / 200)
      }
    }

    const indices = []
    for (let i = 0; i < 200; i++) {
      for (let j = 0; j < 4; j++) {
        const a = i * 5 + j
        const b = i * 5 + j + 1
        const c = (i + 1) * 5 + j
        const d = (i + 1) * 5 + j + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [])

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uFogColor: { value: new THREE.Color('#edf1f7') },
        uFogDensity: { value: 0.018 },
        uRoadColor: { value: new THREE.Color('#c9d1dd') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFogDepth;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uRoadColor;
        varying vec2 vUv;
        varying float vFogDepth;
        void main() {
          vec3 road = uRoadColor;

          // ── Dirt / wear darkening near road edges ──
          float edgeDist = min(vUv.x, 1.0 - vUv.x);  // 0 at edges, 0.5 at center
          float dirtFade = smoothstep(0.0, 0.18, edgeDist); // dark zone at edges
          road *= mix(0.72, 1.0, dirtFade);  // 28% darker at very edge

          // Tire-track darkening — subtle twin bands where tires run
          float track1 = 1.0 - smoothstep(0.0, 0.012, abs(vUv.x - 0.32));
          float track2 = 1.0 - smoothstep(0.0, 0.012, abs(vUv.x - 0.68));
          road *= 1.0 - (track1 + track2) * 0.06;

          float center = abs(vUv.x - 0.5);
          float dashes = step(0.5, fract(vUv.y * 40.0));
          float centerLine = (1.0 - smoothstep(0.0, 0.02, center)) * dashes;
          road = mix(road, vec3(1.0, 0.92, 0.1), centerLine * 0.7);

          float edgeL = smoothstep(0.02, 0.05, vUv.x);
          float edgeR = smoothstep(0.02, 0.05, 1.0 - vUv.x);
          float edge = 1.0 - edgeL * edgeR;
          road = mix(road, vec3(0.95), edge * 0.35);

          float fogFade = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 col = mix(road, uFogColor, fogFade);
          float alpha = (1.0 - fogFade) * 0.88;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  }, [])

  // Day→sunset→night road color
  const _dayRoad = useMemo(() => new THREE.Color('#c9d1dd'), [])
  const _sunsetRoad = useMemo(() => new THREE.Color('#b8a08a'), [])
  const _nightRoad = useMemo(() => new THREE.Color('#a09080'), [])
  const _rC = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const t = progressRef.current
    if (t <= 0.3) _rC.copy(_dayRoad).lerp(_sunsetRoad, t / 0.3)
    else if (t <= 0.7) _rC.copy(_sunsetRoad).lerp(_nightRoad, (t - 0.3) / 0.4)
    else _rC.copy(_nightRoad)
    mat.uniforms.uRoadColor.value.copy(_rC)
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uFogDensity.value = lerpValue3(0.015, 0.018, 0.020, t)
  })

  return <mesh geometry={geom} material={mat} />
}


/* ═══════════════════════════════════════════════
   ROUTE — glowing trail with progress reveal
   ═══════════════════════════════════════════════ */
function Route() {
  const ref = useRef()
  const progressRef = useProgress()

  const { geom, mat } = useMemo(() => {
    const g = new THREE.TubeGeometry(routeCurve, 300, 0.06, 8, false)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color('#edf1f7') },
        uFogDensity: { value: 0.018 },
        uTruckAlong: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying float vFogDepth;
        void main() {
          vAlong = uv.x;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress;
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uTruckAlong;
        varying float vAlong;
        varying float vFogDepth;
        void main() {
          float reveal = smoothstep(uProgress - 0.03, uProgress, vAlong);
          float ahead = smoothstep(uProgress, uProgress + 0.015, vAlong);

          float pulse = sin(vAlong * 60.0 - uTime * 3.0) * 0.5 + 0.5;

          vec3 done = vec3(0.184, 0.424, 1.0);  // #2f6cff
          vec3 glow = vec3(0.36, 0.55, 1.0);
          vec3 future = vec3(0.722, 0.769, 0.855); // #b8c4da

          vec3 col = mix(mix(done, glow, pulse * 0.3), future, ahead);

          float glowStr = (1.0 - reveal) * 0.8 + 0.2;
          float leadGlow = smoothstep(0.05, 0.0, abs(vAlong - uProgress)) * 2.0;
          col += vec3(0.4, 0.6, 1.0) * leadGlow * 0.3;

          // Truck-proximity pulse — route glows brighter near the vehicle
          float truckProx = smoothstep(0.06, 0.0, abs(vAlong - uTruckAlong));
          col += vec3(0.9, 0.55, 0.2) * truckProx * 0.15; // warm orange halo

          float d = uFogDensity;
          float fogFade = 1.0 - exp(-d * d * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFade * 0.65);
          float alpha = glowStr * (1.0 - fogFade * 0.8) * (1.0 - reveal * 0.5);
          alpha += truckProx * 0.1; // slightly more visible near truck
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
    return { geom: g, mat: m }
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    mat.uniforms.uProgress.value = t
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uTruckAlong.value = t // truck is at scroll progress
    // Fog-responsive to day/sunset/night
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uFogDensity.value = lerpValue3(0.015, 0.018, 0.020, t)
  })

  return <mesh ref={ref} geometry={geom} material={mat} />
}



/* ═══════════════════════════════════════════════
   BRANDED MILESTONES — Kavya route markers
   ═══════════════════════════════════════════════ */
function BrandedMilestones() {
  const progressRef = useProgress()
  const refs = useRef([])

  const cityTs = [0, 0.2, 0.4, 0.65, 0.999]
  const positions = useMemo(() => {
    return cityTs.map(t => routeCurve.getPointAt(Math.min(t, 0.999)))
  }, [])

  useFrame(() => {
    const t = progressRef.current
    refs.current.forEach((g, i) => {
      if (!g) return
      const active = t >= cityTs[i] - 0.03
      const target = active ? 1.0 : 0.15
      g.scale.lerp(new THREE.Vector3(target, target, target), 0.04)
    })
  })

  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={[pos.x, 0, pos.z]} ref={el => { refs.current[i] = el }} scale={0.15}>
          {/* Steel post */}
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 3.0, 6]} />
            <meshStandardMaterial color="#555" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Orange accent band */}
          <mesh position={[0, 2.9, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.15, 6]} />
            <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.5} />
          </mesh>
          {/* Ground ring — Kavya blue */}
          <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.7, 24]} />
            <meshStandardMaterial color="#2f6cff" transparent opacity={0.2} side={THREE.DoubleSide} />
          </mesh>
          {/* Name plate */}
          <mesh position={[0, 2.5, 0.06]}>
            <boxGeometry args={[1.2, 0.35, 0.03]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   KAVYA WAREHOUSES — sunset-responsive logistics infrastructure
   ═══════════════════════════════════════════════ */
const _dayWall = new THREE.Color('#f7f9fc')
const _sunsetWall = new THREE.Color('#f5e4d2')
const _nightWall = new THREE.Color('#f0dcc8')

const _dayRoof = new THREE.Color('#e8ecf2')
const _sunsetRoof = new THREE.Color('#e8d8c6')
const _nightRoof = new THREE.Color('#e0ccb8')

const _dayDoor = new THREE.Color('#555860')
const _sunsetDoor = new THREE.Color('#6a5844')
const _nightDoor = new THREE.Color('#5a4a3a')

function KavyaWarehouses() {
  const progressRef = useProgress()
  const glowRefs = useRef([])

  const { wallMat, roofMat, doorMat, baseDirtMat } = useMemo(() => ({
    wallMat: new THREE.MeshStandardMaterial({ color: '#f7f9fc', metalness: 0.08, roughness: 0.65 }),
    roofMat: new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 0.12, roughness: 0.55 }),
    doorMat: new THREE.MeshStandardMaterial({ color: '#555860', metalness: 0.6, roughness: 0.3 }),
    baseDirtMat: new THREE.MeshStandardMaterial({
      color: '#6b6050', metalness: 0.02, roughness: 0.95, transparent: true, opacity: 0.15
    }),
  }), [])

  const warehouses = useMemo(() => [
    { pos: [-10, 0, 28], size: [6, 3.5, 8], rot: 0.2 },
    { pos: [14, 0, 15], size: [8, 3, 5], rot: -0.1 },
    { pos: [-14, 0, 2], size: [5, 4, 7], rot: 0.15 },
    { pos: [22, 0, -12], size: [7, 3, 6], rot: -0.25 },
    { pos: [-8, 0, -22], size: [6, 3.5, 8], rot: 0.1 },
    { pos: [30, 0, -28], size: [8, 3, 5], rot: -0.15 },
  ], [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    lerpColor3(_dayWall, _sunsetWall, _nightWall, t)
    wallMat.color.copy(_tmpColor)
    lerpColor3(_dayRoof, _sunsetRoof, _nightRoof, t)
    roofMat.color.copy(_tmpColor)
    lerpColor3(_dayDoor, _sunsetDoor, _nightDoor, t)
    doorMat.color.copy(_tmpColor)

    // Subtle warm glow for golden hour ambience
    const baseGlow = t > 0.6 ? Math.min(1, (t - 0.6) / 0.25) * 0.3 : 0
    const flicker = 1.0

    // Truck proximity — warehouses "wake up" when truck passes nearby
    glowRefs.current.forEach((g, i) => {
      if (!g) return
      const wPos = warehouses[i].pos
      const dx = _truckWorldPos.x - wPos[0]
      const dz = _truckWorldPos.z - wPos[2]
      const dist = Math.sqrt(dx * dx + dz * dz)
      // Proximity boost: starts at 20 units, max at 5 units
      const proximity = Math.max(0, 1 - dist / 20) * 0.6
      g.intensity = (baseGlow + proximity) * flicker
    })
  })

  const setGlowRef = (i) => (el) => { glowRefs.current[i] = el }

  return (
    <group>
      {warehouses.map((w, i) => (
        <group key={i} position={w.pos} rotation={[0, w.rot, 0]}>
          {/* Main structure — corrugated industrial steel */}
          <mesh position={[0, w.size[1] / 2, 0]} material={wallMat}>
            <boxGeometry args={w.size} />
          </mesh>
          {/* Flat roof */}
          <mesh position={[0, w.size[1] + 0.05, 0]} material={roofMat}>
            <boxGeometry args={[w.size[0] + 0.2, 0.08, w.size[2] + 0.2]} />
          </mesh>
          {/* Orange accent stripe at roofline — brand identity */}
          <mesh position={[0, w.size[1] - 0.1, w.size[2] / 2 + 0.01]}>
            <boxGeometry args={[w.size[0] - 0.2, 0.2, 0.02]} />
            <meshStandardMaterial color="#f97316" metalness={0.2} roughness={0.5} />
          </mesh>
          {/* Loading bay doors */}
          {[...Array(Math.max(2, Math.floor(w.size[0] / 3)))].map((_, j) => (
            <mesh key={j} position={[j * 2.5 - w.size[0] / 2 + 1.2, w.size[1] * 0.35, w.size[2] / 2 + 0.02]} material={doorMat}>
              <boxGeometry args={[1.8, w.size[1] * 0.6, 0.02]} />
            </mesh>
          ))}
          {/* KAVYA branding on front wall — painted */}
          <Text
            position={[0, w.size[1] * 0.85, w.size[2] / 2 + 0.03]}
            fontSize={0.35} color="#e8e8ec"
            anchorX="center" anchorY="middle" letterSpacing={0.2}
          >
            KAVYA
          </Text>

          {/* ── Dirt band at warehouse base — ground-contact weathering ── */}
          <mesh position={[0, 0.2, w.size[2] / 2 + 0.02]} material={baseDirtMat}>
            <planeGeometry args={[w.size[0], 0.5]} />
          </mesh>
          <mesh position={[0, 0.2, -w.size[2] / 2 - 0.02]} rotation={[0, Math.PI, 0]} material={baseDirtMat}>
            <planeGeometry args={[w.size[0], 0.5]} />
          </mesh>

          {/* ── Warm interior glow — point light inside, visible at night ── */}
          <pointLight
            ref={setGlowRef(i)}
            position={[0, w.size[1] * 0.5, 0]}
            color="#ffcc80"
            intensity={0}
            distance={w.size[0] * 1.5}
            decay={2}
          />
        </group>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   KAVYA CONTAINER YARD — branded shipping containers
   ═══════════════════════════════════════════════ */
function KavyaContainerYard() {
  const containers = useMemo(() => {
    const brandColors = ['#f1f4f8', '#e4e8ee', '#2b2f36', '#2f6cff', '#d0d6e0']
    const items = []
    const yards = [
      [15, 0, 22], [-20, 0, -8], [28, 0, -35], [-12, 0, 38],
    ]

    yards.forEach(([bx, _, bz]) => {
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const stackH = (bx + bz + r + c) % 3 === 0 ? 2 : 1
          for (let h = 0; h < stackH; h++) {
            items.push({
              pos: [bx + c * 2.8, h * 1.4 + 0.7, bz + r * 1.5],
              color: brandColors[(bx + bz + c + h) % brandColors.length],
              branded: (c + r + h) % 2 === 0,
            })
          }
        }
      }
    })
    return items
  }, [])

  return (
    <group>
      {containers.map((c, i) => (
        <group key={i} position={c.pos}>
          <mesh>
            <boxGeometry args={[2.5, 1.3, 1.2]} />
            <meshStandardMaterial color={c.color} metalness={0.45} roughness={0.55} envMapIntensity={0.8} />
          </mesh>
          {/* Corrugation ridges — front face */}
          <mesh position={[0, 0, 0.61]}>
            <boxGeometry args={[2.48, 1.28, 0.01]} />
            <meshStandardMaterial color={c.color} metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Branding on select containers */}
          {c.branded && (
            <Text
              position={[0, 0.15, 0.62]}
              fontSize={0.12}
              color={c.color === '#2b2f36' || c.color === '#2f6cff' ? '#f1f4f8' : '#0f1a2b'}
              anchorX="center" anchorY="middle" letterSpacing={0.08}
            >
              KAVYA TRANSPORTS
            </Text>
          )}
        </group>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   KAVYA SIGNBOARDS — branded route direction signs
   ═══════════════════════════════════════════════ */
function KavyaSignboards() {
  const signs = useMemo(() => {
    const labels = ['KAVYA', 'FTL', 'ODC', '3PL', 'KAVYA', 'HUB', 'KAVYA', 'DEPOT']
    const items = []
    for (let i = 0; i < 8; i++) {
      const t = (i + 1) / 9
      const p = routeCurve.getPointAt(Math.min(t, 0.999))
      const tangent = routeCurve.getTangentAt(Math.min(t, 0.999))
      const side = i % 2 === 0 ? 4 : -4
      items.push({
        pos: [p.x + tangent.z * side, 0, p.z - tangent.x * side],
        label: labels[i],
      })
    }
    return items
  }, [])

  return (
    <group>
      {signs.map((s, i) => (
        <group key={i} position={s.pos}>
          {/* Steel post */}
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 2.8, 6]} />
            <meshStandardMaterial color="#606068" metalness={0.75} roughness={0.25} />
          </mesh>
          {/* Sign board — dark background */}
          <mesh position={[0, 2.6, 0]}>
            <boxGeometry args={[1.2, 0.6, 0.04]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.3} roughness={0.6} />
          </mesh>
          {/* Orange top edge — brand accent */}
          <mesh position={[0, 2.91, 0]}>
            <boxGeometry args={[1.22, 0.04, 0.05]} />
            <meshStandardMaterial color="#f97316" metalness={0.2} roughness={0.5} />
          </mesh>
          {/* Sign text — Kavya typography */}
          <Text
            position={[0, 2.6, 0.03]}
            fontSize={0.18} color="#e8e8ec"
            anchorX="center" anchorY="middle" letterSpacing={0.15}
          >
            {s.label}
          </Text>
        </group>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   INDUSTRIAL PYLONS — branded infrastructure markers
   ═══════════════════════════════════════════════ */
function IndustrialPylons() {
  const pylons = useMemo(() => [
    [-25, 0, 35], [20, 0, 28], [-18, 0, -5], [30, 0, -18],
    [-5, 0, -35], [35, 0, -45], [-20, 0, -45], [10, 0, 40],
  ], [])

  return (
    <group>
      {pylons.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Main steel column */}
          <mesh position={[0, 3.5, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 7.0, 6]} />
            <meshStandardMaterial color="#5a5a62" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Cross beam */}
          <mesh position={[0.5, 5.5, 0]} rotation={[0, 0, Math.PI / 6]}>
            <boxGeometry args={[0.04, 2.0, 0.04]} />
            <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Orange accent band — brand marker */}
          <mesh position={[0, 6.5, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.3, 6]} />
            <meshStandardMaterial color="#f97316" metalness={0.3} roughness={0.5} />
          </mesh>
          {/* Navigation light */}
          <mesh position={[0, 7.0, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#ff6030" emissive="#ff6030" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}


/* ═══════════════════════════════════════════════
   ATMOSPHERE — subtle industrial dust
   ═══════════════════════════════════════════════ */
function Atmosphere() {
  const ref = useRef()
  const count = 50

  // Store base positions + per-particle wind phase for natural drift
  const { positions, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const ph = new Float32Array(count * 3) // windX phase, windZ phase, speed
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120
      pos[i * 3 + 1] = Math.random() * 20 + 0.5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120
      ph[i * 3] = Math.random() * Math.PI * 2     // X phase offset
      ph[i * 3 + 1] = Math.random() * Math.PI * 2 // Z phase offset
      ph[i * 3 + 2] = 0.3 + Math.random() * 0.7   // speed multiplier
    }
    return { positions: pos, phases: ph }
  }, [])

  // Store original positions for wind-relative drift
  const basePositions = useMemo(() => new Float32Array(positions), [positions])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.elapsedTime
    const attr = ref.current.geometry.attributes.position
    const arr = attr.array

    // Wind drift — each particle moves independently with sine-based wander
    // Dominant wind from +X (Indian road dust blowing across highway)
    for (let i = 0; i < count; i++) {
      const spd = phases[i * 3 + 2]
      const phX = phases[i * 3]
      const phZ = phases[i * 3 + 1]
      arr[i * 3] = basePositions[i * 3] + Math.sin(elapsed * 0.15 * spd + phX) * 3.0 + elapsed * 0.08 * spd
      arr[i * 3 + 1] = basePositions[i * 3 + 1] + Math.sin(elapsed * 0.2 * spd + phX * 1.3) * 0.4
      arr[i * 3 + 2] = basePositions[i * 3 + 2] + Math.sin(elapsed * 0.12 * spd + phZ) * 2.0

      // Wrap particles that drift too far
      if (arr[i * 3] > 70) arr[i * 3] -= 140
      if (arr[i * 3] < -70) arr[i * 3] += 140
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#b8c4da"
        transparent
        opacity={0.2}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}


/* ═══════════════════════════════════════════════
   HEAT SHIMMER — road-level UV distortion (day/sunset only)
   ═══════════════════════════════════════════════ */
function HeatShimmer({ progressRef }) {
  const ref = useRef()

  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.06 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFogDepth;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vFogDepth;
        void main() {
          // Multi-frequency shimmer — industrial heat haze, not sci-fi
          float wave1 = sin(vUv.x * 12.0 + uTime * 1.5) * 0.5 + 0.5;
          float wave2 = sin(vUv.y * 8.0 - uTime * 0.8) * 0.5 + 0.5;
          float wave3 = sin((vUv.x + vUv.y) * 18.0 + uTime * 0.6) * 0.5 + 0.5;
          float shimmer = wave1 * wave2 * 0.7 + wave3 * 0.3;

          // Concentrate near road center, fade at edges
          float roadProximity = 1.0 - smoothstep(0.0, 0.3, abs(vUv.x - 0.5));

          // Fade with distance
          float fogFade = 1.0 - exp(-0.02 * 0.02 * vFogDepth * vFogDepth);
          float alpha = shimmer * uOpacity * (1.0 - fogFade) * (0.3 + roadProximity * 0.7);

          gl_FragColor = vec4(1.0, 0.98, 0.94, alpha);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    mat.uniforms.uTime.value = clock.elapsedTime
    // Visible during day/sunset, disabled at night
    mat.uniforms.uOpacity.value = t < 0.65 ? 0.06 * (1.0 - t / 0.65) : 0.0
  })

  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.15, 0]} material={mat}>
      <planeGeometry args={[120, 120, 1, 1]} />
    </mesh>
  )
}


/* ═══════════════════════════════════════════════
   STAR FIELD — sparse, subtle, night only (75%+ scroll)
   Per-star twinkle via custom attribute — each star has its own phase.
   ═══════════════════════════════════════════════ */
function StarField({ progressRef }) {
  const ref = useRef()
  const count = 120
  const matRef = useRef()

  const { positions, phases, baseSizes } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const ph = new Float32Array(count)
    const sz = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.4 + 0.1
      const r = 150 + Math.random() * 50
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi) + 20
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      ph[i] = Math.random() * Math.PI * 2         // unique twinkle phase
      sz[i] = 0.08 + Math.random() * 0.1          // varied base size
    }
    return { positions: pos, phases: ph, baseSizes: sz }
  }, [])

  // Custom shader for per-star twinkle
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          // Per-star twinkle — different frequency for each star
          float twinkle = sin(uTime * (1.5 + aPhase * 0.8) + aPhase * 6.283) * 0.5 + 0.5;
          vAlpha = uOpacity * (0.3 + twinkle * 0.7); // range 30%-100% of base opacity
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -mvPos.z) * (0.7 + twinkle * 0.3);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        void main() {
          float dist = length(gl_PointCoord - 0.5) * 2.0;
          float soft = 1.0 - smoothstep(0.0, 1.0, dist);
          gl_FragColor = vec4(0.78, 0.85, 0.94, vAlpha * soft);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = progressRef.current
    // Fade in from 75%, fully visible at 90%
    const starAlpha = t > 0.75 ? Math.min(1, (t - 0.75) / 0.15) * 0.6 : 0
    mat.uniforms.uOpacity.value = starAlpha
    mat.uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <points ref={ref} material={mat}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-aPhase" count={count} array={phases} itemSize={1} />
        <bufferAttribute attach="attributes-aSize" count={count} array={baseSizes} itemSize={1} />
      </bufferGeometry>
    </points>
  )
}

