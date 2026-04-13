/**
 * TERRAIN — Patchwork Indian farmland with road corridor flattening (V3)
 * ═══════════════════════════════════════════════════════════════════════
 * Delhi-Dehradun expressway style: Lush green agricultural plots,
 * nearly flat terrain, rectangular patchwork pattern, instanced grass.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SCENE, ROAD_CORRIDOR_WIDTH, COLORS, IS_MOBILE } from '../config'
import { useProgress, routeCurve, lerpColor3, lerpValue3, _color } from '../core'

/* ── Pre-allocated lerp colors ── */
const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)
const _dayKey = new THREE.Color(COLORS.KEY_DAY)
const _sunsetKey = new THREE.Color(COLORS.KEY_SUNSET)
const _nightKey = new THREE.Color(COLORS.KEY_NIGHT)
const _dayGround1 = new THREE.Color(COLORS.GROUND1_DAY)
const _sunsetGround1 = new THREE.Color('#6a7a30')
const _nightGround1 = new THREE.Color('#2a3a2a')
const _dayGround2 = new THREE.Color(COLORS.GROUND2_DAY)
const _sunsetGround2 = new THREE.Color('#8a9a40')
const _nightGround2 = new THREE.Color('#3a4a3a')
const _dayDirt = new THREE.Color(COLORS.DIRT_DAY)
const _sunsetDirt = new THREE.Color('#a09030')
const _nightDirt = new THREE.Color('#4a4a3a')

/* ── Noise for ground height ── */
function hashGround(x, z) {
  return Math.abs(Math.sin(x * 127.1 + z * 311.7) * 43758.5453) % 1
}

function noiseGround(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hashGround(ix, iz), b = hashGround(ix + 1, iz)
  const c = hashGround(ix, iz + 1), d = hashGround(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbmGround(x, z) {
  let v = 0, amp = 0.5
  for (let i = 0; i < 4; i++) {
    v += amp * noiseGround(x, z)
    x *= 2.0; z *= 2.0
    amp *= 0.5
  }
  return v
}

/* ── Pre-sample road spline for corridor check ── */
const ROAD_SAMPLES = 300
let _roadSamples = null
function getRoadSamples() {
  if (_roadSamples) return _roadSamples
  _roadSamples = []
  for (let i = 0; i <= ROAD_SAMPLES; i++) {
    const t = i / ROAD_SAMPLES
    const p = routeCurve.getPointAt(t)
    _roadSamples.push({ x: p.x, z: p.z })
  }
  return _roadSamples
}

function distToRoad(x, z) {
  const samples = getRoadSamples()
  let minDist = Infinity
  for (const s of samples) {
    const dx = x - s.x, dz = z - s.z
    const d = dx * dx + dz * dz
    if (d < minDist) minDist = d
  }
  return Math.sqrt(minDist)
}

/* ════════════════════════════════════════════
   INSTANCED GRASS BLADES — useEffect-based
   ════════════════════════════════════════════ */
const GRASS_COUNT = IS_MOBILE ? 4000 : 12000
const GRASS_RANGE = 100
const GRASS_BLADE_WIDTH = 0.08
const GRASS_BLADE_HEIGHT_MIN = 0.2
const GRASS_BLADE_HEIGHT_MAX = 0.6

function GrassField() {
  const meshRef = useRef()

  const { grassGeom, grassMat, matrices } = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const verts = new Float32Array([
      -GRASS_BLADE_WIDTH * 0.5, 0, 0,
       GRASS_BLADE_WIDTH * 0.5, 0, 0,
       0, 1, 0,
    ])
    const uvArr = new Float32Array([0, 0, 1, 0, 0.5, 1])
    geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2))

    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWindStrength: { value: 0.8 },
        uGrassColorBase: { value: new THREE.Color('#1a7a2a') },
        uGrassColorTip: { value: new THREE.Color('#4ec04e') },
        uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
        uFogDensity: { value: 0.008 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uWindStrength;
        varying vec2 vUv;
        varying float vFogDepth;
        varying float vHeight;

        void main() {
          vUv = uv;
          vHeight = uv.y;
          vec3 pos = position;
          float windPhase = instanceMatrix[3][0] * 0.05 + instanceMatrix[3][2] * 0.03;
          float wind = sin(uTime * 1.5 + windPhase) * uWindStrength;
          float gust = sin(uTime * 3.7 + windPhase * 2.0) * 0.3;
          pos.x += (wind + gust) * uv.y * uv.y * 0.15;
          pos.z += sin(uTime * 1.2 + windPhase * 1.5) * uv.y * uv.y * 0.08;
          vec4 worldPos = instanceMatrix * vec4(pos, 1.0);
          vec4 mvPos = viewMatrix * worldPos;
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uGrassColorBase;
        uniform vec3 uGrassColorTip;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec2 vUv;
        varying float vFogDepth;
        varying float vHeight;

        void main() {
          vec3 col = mix(uGrassColorBase, uGrassColorTip, vHeight);
          col *= 0.7 + vHeight * 0.3;
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFactor);
          float alpha = smoothstep(1.0, 0.85, vHeight);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    })

    // Pre-compute instance matrices
    const mats = []
    const _m = new THREE.Matrix4()
    const _pos = new THREE.Vector3()
    const _quat = new THREE.Quaternion()
    const _scale = new THREE.Vector3()
    const _euler = new THREE.Euler()

    for (let i = 0; i < GRASS_COUNT; i++) {
      let x = (Math.random() - 0.5) * GRASS_RANGE * 2
      let z = (Math.random() - 0.5) * GRASS_RANGE * 2

      // Skip grass in road corridor
      const roadDist = distToRoad(x, z)
      if (roadDist < ROAD_CORRIDOR_WIDTH + 2) {
        const angle = Math.random() * Math.PI * 2
        const r = ROAD_CORRIDOR_WIDTH + 3 + Math.random() * (GRASS_RANGE - ROAD_CORRIDOR_WIDTH - 3)
        x = Math.cos(angle) * r
        z = Math.sin(angle) * r
      }

      _pos.set(x, 0, z)
      const bladeHeight = GRASS_BLADE_HEIGHT_MIN + Math.random() * (GRASS_BLADE_HEIGHT_MAX - GRASS_BLADE_HEIGHT_MIN)
      _euler.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.2)
      _quat.setFromEuler(_euler)
      _scale.set(1, bladeHeight, 1)
      _m.compose(_pos, _quat, _scale)
      mats.push(_m.clone())
    }

    return { grassGeom: geom, grassMat: mat, matrices: mats }
  }, [])

  // Set all instance matrices imperatively (NO React elements)
  useEffect(() => {
    if (!meshRef.current) return
    matrices.forEach((mat, i) => {
      meshRef.current.setMatrixAt(i, mat)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices])

  useFrame(({ clock }) => {
    if (grassMat) {
      grassMat.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[grassGeom, grassMat, GRASS_COUNT]}
      frustumCulled={false}
    />
  )
}

/* ════════════════════════════════════════════
   Build terrain geometry with roadMask attribute
   ════════════════════════════════════════════ */
function buildTerrainGeometry() {
  const size = 500, segs = 100
  const geom = new THREE.PlaneGeometry(size, size, segs, segs)
  geom.rotateX(-Math.PI / 2)

  const pos = geom.attributes.position
  const count = pos.count
  const roadMask = new Float32Array(count)
  const corridorWidth = ROAD_CORRIDOR_WIDTH + 3 // extra blend band

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const d = distToRoad(x, z)
    roadMask[i] = Math.min(1.0, Math.max(0.0, (d - ROAD_CORRIDOR_WIDTH) / 5.0))
  }

  geom.setAttribute('roadMask', new THREE.BufferAttribute(roadMask, 1))
  return geom
}

/* ════════════════════════════════════════════
   MAIN TERRAIN COMPONENT
   ════════════════════════════════════════════ */
export default function Terrain() {
  const progressRef = useProgress()

  const terrainGeom = useMemo(buildTerrainGeometry, [])

  const groundMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
        uFogDensity: { value: 0.008 },
        uGroundColor1: { value: new THREE.Color(COLORS.GROUND1_DAY) },
        uGroundColor2: { value: new THREE.Color(COLORS.GROUND2_DAY) },
        uDirtColor: { value: new THREE.Color(COLORS.DIRT_DAY) },
        uSunDirection: { value: new THREE.Vector3(1, 0.9, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(COLORS.SUN_DAY) },
      },
      vertexShader: /* glsl */ `
        attribute float roadMask;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        varying vec3 vNormal;
        varying float vRoadMask;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1,0));
          float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, amp = 0.5;
          for(int i=0;i<4;i++){v+=amp*noise(p);p*=2.0;amp*=0.5;}
          return v;
        }
        void main() {
          vUv = uv;
          vRoadMask = roadMask;
          vec3 pos = position;

          // Very gentle height — nearly flat farmland
          float h = fbm(pos.xz * 0.015) * 1.5 + fbm(pos.xz * 0.06) * 0.3;
          pos.y += h * 0.08 * roadMask;

          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;

          float eps = 0.5;
          float hL = (fbm((pos.xz + vec2(-eps, 0.0)) * 0.015) * 1.5) * roadMask;
          float hR = (fbm((pos.xz + vec2(eps, 0.0)) * 0.015) * 1.5) * roadMask;
          float hD = (fbm((pos.xz + vec2(0.0, -eps)) * 0.015) * 1.5) * roadMask;
          float hU = (fbm((pos.xz + vec2(0.0, eps)) * 0.015) * 1.5) * roadMask;
          vNormal = normalize(vec3(hL - hR, 2.0, hD - hU));

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uGroundColor1;
        uniform vec3 uGroundColor2;
        uniform vec3 uDirtColor;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        varying vec3 vNormal;
        varying float vRoadMask;

        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) {
          vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
          float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }

        void main() {
          // ── Patchwork farmland grid ──
          float cellSize = 12.0;
          vec2 cellId = floor(vWorldPos.xz / cellSize);
          vec2 cellUv = fract(vWorldPos.xz / cellSize);

          float cellRand = hash(cellId);
          float cellRand2 = hash(cellId + vec2(57.0, 113.0));

          // 6 crop color variations — lush Indian farmland
          vec3 cropColor;
          float idx = floor(cellRand * 6.0);
          if (idx < 1.0)      cropColor = vec3(0.15, 0.55, 0.22);  // Dark green (rice paddy)
          else if (idx < 2.0) cropColor = vec3(0.28, 0.65, 0.30);  // Medium green (sugarcane)
          else if (idx < 3.0) cropColor = vec3(0.35, 0.72, 0.25);  // Bright green (crops)
          else if (idx < 4.0) cropColor = vec3(0.45, 0.68, 0.18);  // Yellow-green (wheat)
          else if (idx < 5.0) cropColor = vec3(0.55, 0.70, 0.15);  // Golden-green (mustard)
          else                cropColor = vec3(0.22, 0.48, 0.20);  // Deep olive (vegetables)

          // Tint with animated ground colors
          cropColor = mix(cropColor, uGroundColor1, 0.15);

          // Within-cell crop row lines
          float rowAngle = cellRand2 * 3.14159;
          vec2 rowDir = vec2(cos(rowAngle), sin(rowAngle));
          float rowPattern = sin(dot(vWorldPos.xz, rowDir) * 8.0) * 0.5 + 0.5;
          cropColor *= 0.92 + rowPattern * 0.08;

          // Cell boundary — irrigation channels
          float edgeX = smoothstep(0.0, 0.04, cellUv.x) * smoothstep(1.0, 0.96, cellUv.x);
          float edgeZ = smoothstep(0.0, 0.04, cellUv.y) * smoothstep(1.0, 0.96, cellUv.y);
          float edgeMask = edgeX * edgeZ;
          vec3 boundaryColor = vec3(0.12, 0.30, 0.10);
          cropColor = mix(boundaryColor, cropColor, edgeMask);

          vec3 col = cropColor;

          // Fallow / plowed cells
          float fallowChance = step(0.85, cellRand);
          vec3 fallowColor = uDirtColor * vec3(0.7, 0.65, 0.5);
          col = mix(col, fallowColor, fallowChance * 0.7);

          // Micro detail noise
          float microNoise = noise(vWorldPos.xz * 2.0) * 0.06;
          col += vec3(microNoise * 0.5, microNoise, microNoise * 0.3);

          // Temperature variation
          float tempNoise = noise(vWorldPos.xz * 0.005);
          col += vec3(0.01, 0.02, -0.01) * (tempNoise - 0.5);

          // Distance fade
          float distFromCenter = length(vWorldPos.xz) / 150.0;
          vec3 distantColor = mix(uGroundColor1, uGroundColor2, 0.5) * 0.9;
          col = mix(col, distantColor, smoothstep(0.4, 1.0, distFromCenter) * 0.3);

          // Lighting
          float diffuse = max(0.45, dot(vNormal, uSunDirection));
          col *= diffuse;
          col += uSunColor * 0.02;

          // Fog
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFactor);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  }, [])

  // Animate uniforms per-frame
  useFrame(({ clock }) => {
    const t = progressRef.current
    groundMat.uniforms.uTime.value = clock.elapsedTime

    // Fog color
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    groundMat.uniforms.uFogColor.value.copy(_color)
    groundMat.uniforms.uFogDensity.value = lerpValue3(0.008, 0.007, 0.012, t)

    // Ground colors
    lerpColor3(_dayGround1, _sunsetGround1, _nightGround1, t)
    groundMat.uniforms.uGroundColor1.value.copy(_color)
    lerpColor3(_dayGround2, _sunsetGround2, _nightGround2, t)
    groundMat.uniforms.uGroundColor2.value.copy(_color)
    lerpColor3(_dayDirt, _sunsetDirt, _nightDirt, t)
    groundMat.uniforms.uDirtColor.value.copy(_color)

    // Sun
    const sunY = lerpValue3(0.9, 0.3, -0.1, t)
    groundMat.uniforms.uSunDirection.value.set(lerpValue3(1.0, 0.8, 0.5, t), sunY, 0.5).normalize()
    lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
    groundMat.uniforms.uSunColor.value.copy(_color)
  })

  return (
    <group>
      <mesh geometry={terrainGeom} material={groundMat} receiveShadow />
      <GrassField />
    </group>
  )
}
