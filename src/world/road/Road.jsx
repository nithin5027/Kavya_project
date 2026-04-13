/**
 * ROAD V3 — 6-lane Delhi-Dehradun style expressway
 * ═══════════════════════════════════════════════════
 * Wide asphalt with median concrete divider + green strip,
 * 3 lanes each side, dashed white lane lines, solid yellow median edges,
 * wide green shoulder blending into farmland.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SCENE, COLORS } from '../config'
import { useProgress, routeCurve, lerpColor3, lerpValue3, _color } from '../core'

const HALF = SCENE.ROAD_HALF_WIDTH   // 4.5
const SEGS_ALONG = 200
const SEGS_ACROSS = 10

const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)
const _dayKey = new THREE.Color(COLORS.KEY_DAY)
const _sunsetKey = new THREE.Color(COLORS.KEY_SUNSET)
const _nightKey = new THREE.Color(COLORS.KEY_NIGHT)
const _dayGrass = new THREE.Color(COLORS.GROUND1_DAY)
const _sunsetGrass = new THREE.Color('#5a7a40')
const _nightGrass = new THREE.Color('#2a3a2a')

/* ── Road shoulder geometry (grass blend) ── */
function createShoulderGeometry(side) {
  const points = routeCurve.getSpacedPoints(SEGS_ALONG)
  const frames = routeCurve.computeFrenetFrames(SEGS_ALONG, false)
  const positions = [], uvs = []
  const shoulderWidth = 5.0
  const subdivs = 5

  for (let i = 0; i <= SEGS_ALONG; i++) {
    const p = points[i]
    const bn = frames.binormals[i]
    for (let j = 0; j <= subdivs; j++) {
      const t = j / subdivs
      const offset = side === 'left'
        ? (-HALF - t * shoulderWidth)
        : ( HALF + t * shoulderWidth)
      positions.push(
        p.x + bn.x * offset,
        SCENE.ROAD_Y - 0.02 - t * 0.04,
        p.z + bn.z * offset
      )
      uvs.push(t, i / SEGS_ALONG)
    }
  }
  const indices = []
  for (let i = 0; i < SEGS_ALONG; i++) {
    for (let j = 0; j < subdivs; j++) {
      const w = subdivs + 1
      const a = i * w + j, b = a + 1, c = (i + 1) * w + j, d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

export default function Road() {
  const progressRef = useProgress()

  /* ── Main road geometry — full width expressway ── */
  const geom = useMemo(() => {
    const points = routeCurve.getSpacedPoints(SEGS_ALONG)
    const frames = routeCurve.computeFrenetFrames(SEGS_ALONG, false)
    const positions = [], uvs = []

    for (let i = 0; i <= SEGS_ALONG; i++) {
      const p = points[i]
      const bn = frames.binormals[i]
      for (let j = 0; j <= SEGS_ACROSS; j++) {
        const t = (j / SEGS_ACROSS) * HALF * 2 - HALF
        const waveY = Math.sin(i * 0.15 + j * 0.2) * 0.008
        positions.push(
          p.x + bn.x * t,
          SCENE.ROAD_Y + waveY,
          p.z + bn.z * t
        )
        uvs.push(j / SEGS_ACROSS, i / SEGS_ALONG)
      }
    }

    const indices = []
    const w = SEGS_ACROSS + 1
    for (let i = 0; i < SEGS_ALONG; i++) {
      for (let j = 0; j < SEGS_ACROSS; j++) {
        const a = i * w + j, b = a + 1, c = (i + 1) * w + j, d = c + 1
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

  /* ── Shoulder geometries ── */
  const leftShoulder = useMemo(() => createShoulderGeometry('left'), [])
  const rightShoulder = useMemo(() => createShoulderGeometry('right'), [])

  /* ── Expressway shader ── */
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
        uFogDensity: { value: 0.008 },
        uRoadColor: { value: new THREE.Color('#5a5a5a') },
        uLineColor: { value: new THREE.Color('#ffffff') },
        uSunDirection: { value: new THREE.Vector3(1, 0.9, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(COLORS.SUN_DAY) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vFogDepth; varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec3 uRoadColor; uniform vec3 uLineColor;
        uniform vec3 uSunDirection; uniform vec3 uSunColor;
        varying vec2 vUv; varying float vFogDepth; varying vec3 vWorldPos;
        varying vec3 vNormal;

        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
          float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }

        void main() {
          vec3 road = uRoadColor;
          float x = vUv.x; // 0=left edge, 1=right edge

          // ── Asphalt texture ──
          float coarse = noise(vWorldPos.xz * 10.0);
          float fine = noise(vWorldPos.xz * 50.0);
          road += (coarse * 0.03 + fine * 0.015 - 0.025) * vec3(1.0, 0.97, 0.94);

          // ── Aggregate speckle ──
          float spk = hash(floor(vWorldPos.xz * 35.0));
          if (spk > 0.88) road += vec3(0.05);
          else if (spk < 0.08) road -= vec3(0.02);

          // === MEDIAN DIVIDER (center strip) ===
          // Concrete barrier zone: |x - 0.5| < 0.035  (~7% of width)
          float medianDist = abs(x - 0.5);
          float concrete = 1.0 - smoothstep(0.012, 0.035, medianDist);
          vec3 concreteColor = vec3(0.72, 0.70, 0.66); // light grey concrete
          // Green median strip in the very center
          float greenStrip = 1.0 - smoothstep(0.0, 0.012, medianDist);
          vec3 medianGreen = vec3(0.15, 0.45, 0.12);
          road = mix(road, concreteColor, concrete * 0.9);
          road = mix(road, medianGreen, greenStrip * 0.85);

          // === SOLID YELLOW MEDIAN EDGE LINES ===
          // Inner edge of each carriageway, just outside the concrete
          float yLineL = 1.0 - smoothstep(0.0, 0.008, abs(x - 0.46));
          float yLineR = 1.0 - smoothstep(0.0, 0.008, abs(x - 0.54));
          road = mix(road, vec3(1.0, 0.85, 0.0), (yLineL + yLineR) * 0.9);

          // === DASHED WHITE LANE LINES (3 lanes each side) ===
          // Left carriageway lanes at x ≈ 0.15, 0.30
          // Right carriageway lanes at x ≈ 0.70, 0.85
          float dashes = step(0.5, fract(vUv.y * 40.0));
          float lane1 = 1.0 - smoothstep(0.0, 0.006, abs(x - 0.155));
          float lane2 = 1.0 - smoothstep(0.0, 0.006, abs(x - 0.305));
          float lane3 = 1.0 - smoothstep(0.0, 0.006, abs(x - 0.695));
          float lane4 = 1.0 - smoothstep(0.0, 0.006, abs(x - 0.845));
          float allLanes = (lane1 + lane2 + lane3 + lane4) * dashes;
          float paintNoise = noise(vWorldPos.xz * 18.0) * 0.15;
          road = mix(road, uLineColor, allLanes * (0.85 - paintNoise));

          // === SOLID WHITE EDGE LINES ===
          float edgeL = 1.0 - smoothstep(0.0, 0.008, abs(x - 0.04));
          float edgeR = 1.0 - smoothstep(0.0, 0.008, abs(x - 0.96));
          road = mix(road, uLineColor, (edgeL + edgeR) * 0.8);

          // ── Edge gutter darkening ──
          float edgeDark = smoothstep(0.04, 0.0, x) + smoothstep(0.96, 1.0, x);
          road *= 1.0 - edgeDark * 0.12;

          // ── Specular ──
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(uSunDirection + viewDir);
          float spec = pow(max(0.0, dot(vNormal, halfDir)), 48.0);
          road += uSunColor * spec * 0.03;

          // ── Fog ──
          float fogFade = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 col = mix(road, uFogColor, fogFade);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  }, [])

  /* ── Shoulder shader — asphalt edge blending into grass ── */
  const shoulderMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
        uFogDensity: { value: 0.008 },
        uEdgeColor: { value: new THREE.Color('#6a6a6a') },
        uGrassColor: { value: new THREE.Color(COLORS.GROUND1_DAY) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vFogDepth; varying vec3 vWorldPos;
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
        uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec3 uEdgeColor; uniform vec3 uGrassColor;
        varying vec2 vUv; varying float vFogDepth; varying vec3 vWorldPos;

        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){
          vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
          float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }

        void main() {
          float t = vUv.x;
          float nz = noise(vWorldPos.xz * 6.0) * 0.12;
          t = smoothstep(0.0, 0.6, t + nz);

          vec3 col = mix(uEdgeColor, uGrassColor, t);
          // gravel speckle near road edge
          float gravel = noise(vWorldPos.xz * 25.0);
          col += (gravel - 0.5) * 0.03 * (1.0 - t);

          float fogFade = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFade);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    mat.uniforms.uTime.value = clock.elapsedTime

    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_color)
    shoulderMat.uniforms.uFogColor.value.copy(_color)

    mat.uniforms.uFogDensity.value = lerpValue3(0.008, 0.010, 0.016, t)
    shoulderMat.uniforms.uFogDensity.value = lerpValue3(0.008, 0.010, 0.016, t)

    const brightness = lerpValue3(0.35, 0.30, 0.12, t)
    mat.uniforms.uRoadColor.value.setRGB(brightness, brightness * 0.97, brightness * 0.94)

    mat.uniforms.uSunDirection.value.set(
      lerpValue3(1.0, 0.8, 0.5, t), lerpValue3(0.9, 0.3, -0.1, t), 0.5
    ).normalize()
    lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
    mat.uniforms.uSunColor.value.copy(_color)

    // Shoulder grass color animation
    lerpColor3(_dayGrass, _sunsetGrass, _nightGrass, t)
    shoulderMat.uniforms.uGrassColor.value.copy(_color)
  })

  return (
    <group>
      <mesh geometry={geom} material={mat} />
      <mesh geometry={leftShoulder} material={shoulderMat} />
      <mesh geometry={rightShoulder} material={shoulderMat} />
    </group>
  )
}
