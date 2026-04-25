/**
 * MOUNTAINS — Distant hazy silhouettes (V3 — Expressway style)
 * ═══════════════════════════════════════════════════════════
 * Three depth layers pushed far back like distant Himalayan foothills.
 * Blue-grey atmospheric perspective, very faint on horizon.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PERF, COLORS, ROUTE_POINTS } from '../config'
import { useProgress, lerpColor3, lerpValue3, _color } from '../core'

/* ── Pre-allocated colors for lerp ── */
const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)
const _dayKey = new THREE.Color(COLORS.KEY_DAY)
const _sunsetKey = new THREE.Color(COLORS.KEY_SUNSET)
const _nightKey = new THREE.Color(COLORS.KEY_NIGHT)

/* ── Seeded PRNG (mulberry32) — deterministic random ── */
function mulberry32(seed) {
  let s = seed | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Route corridor samples for exclusion checking ── */
const _routeSamples = []
for (let i = 0; i < ROUTE_POINTS.length; i++) {
  _routeSamples.push({ x: ROUTE_POINTS[i].x, z: ROUTE_POINTS[i].z })
}
// Also sample midpoints between route points for denser coverage
for (let i = 0; i < ROUTE_POINTS.length - 1; i++) {
  _routeSamples.push({
    x: (ROUTE_POINTS[i].x + ROUTE_POINTS[i + 1].x) * 0.5,
    z: (ROUTE_POINTS[i].z + ROUTE_POINTS[i + 1].z) * 0.5,
  })
}

function minDistToRoute(px, pz) {
  let minD = Infinity
  for (const s of _routeSamples) {
    const dx = px - s.x, dz = pz - s.z
    const d = Math.sqrt(dx * dx + dz * dz)
    if (d < minD) minD = d
  }
  return minD
}

/* ═══════════════════════════════════════════════════
   Simplified geometry — distant silhouettes need less detail
   ═══════════════════════════════════════════════════ */
function createMountainGeometry(segments, heightVariation, ridgeStrength, erosionAmount, octaves, verticalExag, asymmetry) {
  const geom = new THREE.BufferGeometry()
  const vertices = [], uvs = [], indices = [], colors = []
  const width = 2, depth = 1.5
  const segsX = segments * 2, segsZ = Math.floor(segments * 1.2)

  const hash = (x, z) => {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const smoothNoise = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z)
    const fx = x - ix, fz = z - iz
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    const a = hash(ix, iz), b = hash(ix + 1, iz)
    const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
  }
  const fbm = (x, z, oct) => {
    let value = 0, amplitude = 0.5, frequency = 1, maxValue = 0
    for (let i = 0; i < oct; i++) {
      value += smoothNoise(x * frequency, z * frequency) * amplitude
      maxValue += amplitude
      amplitude *= 0.46
      frequency *= 2.15
    }
    return value / maxValue
  }
  const ridgeNoise = (x, z) => {
    let v = smoothNoise(x * 1.5, z * 1.5)
    v = Math.abs(v * 2.0 - 1.0)
    v = 1.0 - v
    return v * v
  }

  // Blue-green-grey color palette for distant mountains
  const baseGreen = new THREE.Color('#2a4a3a')
  const midGrey = new THREE.Color('#5a6a7a')
  const highBlue = new THREE.Color('#7a8aa0')
  const peakLight = new THREE.Color('#9aaab8')

  for (let iz = 0; iz <= segsZ; iz++) {
    for (let ix = 0; ix <= segsX; ix++) {
      const u = ix / segsX, v = iz / segsZ
      const x = (u - 0.5) * width, z = (v - 0.5) * depth

      const centerX = smoothNoise(ix * 0.04 + 100, iz * 0.04 + 200) * 0.15 - 0.075
      const centerZ = smoothNoise(ix * 0.04 + 300, iz * 0.04 + 400) * 0.1 - 0.05
      const distFromCenter = Math.sqrt(
        Math.pow((u - 0.5 + centerX) * 2, 2) +
        Math.pow((v - 0.5 + centerZ) * 2, 2) * 0.5
      )
      let peakShape = Math.exp(-distFromCenter * distFromCenter * 2.0)

      if (asymmetry > 0) {
        const sideBlend = u < 0.5 ? 1.0 : (1.0 - asymmetry * 0.4)
        peakShape *= sideBlend
      }

      let y = peakShape
      y += fbm(ix * 0.12, iz * 0.12, octaves) * heightVariation * peakShape
      y += ridgeNoise(ix * 0.08, iz * 0.08) * ridgeStrength * 0.2 * peakShape
      y += smoothNoise(ix * 0.5, iz * 0.5) * 0.025 * peakShape
      y *= verticalExag
      y = Math.max(0, y)

      vertices.push(x, y, z)
      uvs.push(u, v)

      const normalizedH = Math.min(y / ((heightVariation + 0.5) * verticalExag), 1.0)
      const c = new THREE.Color()
      if (normalizedH < 0.3) {
        c.copy(baseGreen).lerp(midGrey, normalizedH / 0.3)
      } else if (normalizedH < 0.7) {
        c.copy(midGrey).lerp(highBlue, (normalizedH - 0.3) / 0.4)
      } else {
        c.copy(highBlue).lerp(peakLight, (normalizedH - 0.7) / 0.3)
      }
      const colorNoise = hash(ix * 3.7, iz * 5.3) * 0.06 - 0.03
      c.r = Math.max(0, Math.min(1, c.r + colorNoise))
      c.g = Math.max(0, Math.min(1, c.g + colorNoise * 0.8))
      c.b = Math.max(0, Math.min(1, c.b + colorNoise * 0.6))
      colors.push(c.r, c.g, c.b)
    }
  }
  for (let iz = 0; iz < segsZ; iz++) {
    for (let ix = 0; ix < segsX; ix++) {
      const a = iz * (segsX + 1) + ix
      indices.push(a, a + segsX + 1, a + 1, a + 1, a + segsX + 1, a + segsX + 2)
    }
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

/* ═══════════════════════════════════════════════════
   Mountain shader — heavy aerial perspective
   ═══════════════════════════════════════════════════ */
function createMountainMaterial(config) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(config.baseColor) },
      uPeakColor: { value: new THREE.Color(config.peakColor) },
      uSnowColor: { value: new THREE.Color(config.snowColor || '#e8e8f0') },
      uSnowLine: { value: config.snowLine },
      uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
      uFogDensity: { value: config.fogDensity || 0.008 },
      uSunDirection: { value: new THREE.Vector3(1, 0.9, 0.5).normalize() },
      uSunColor: { value: new THREE.Color(COLORS.SUN_DAY) },
      uOpacity: { value: config.opacity },
      uDepthLayer: { value: config.depthLayer || 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv;
      varying float vHeight; varying float vFogDepth; varying float vSlope;
      varying vec3 vVertexColor;
      void main() {
        vUv = uv; vNormal = normalize(normalMatrix * normal);
        vHeight = position.y;
        vSlope = 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));
        vVertexColor = color;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uBaseColor; uniform vec3 uPeakColor;
      uniform vec3 uSnowColor; uniform float uSnowLine; uniform vec3 uFogColor;
      uniform float uFogDensity; uniform vec3 uSunDirection; uniform vec3 uSunColor;
      uniform float uOpacity; uniform float uDepthLayer;
      varying vec3 vWorldPos; varying vec3 vNormal; varying vec2 vUv;
      varying float vHeight; varying float vFogDepth; varying float vSlope;
      varying vec3 vVertexColor;

      float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
      float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
        float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
      float fbm(vec2 p){float v=0.0,amp=0.5,mx=0.0;for(int i=0;i<4;i++){v+=amp*noise(p);mx+=amp;p*=1.95;amp*=0.52;}return v/mx;}

      void main() {
        vec3 col = vVertexColor;
        float heightGrad = smoothstep(0.0, 1.0, vHeight);
        vec3 layerTint = mix(uBaseColor, uPeakColor, heightGrad);
        col = mix(col, layerTint, 0.4);

        // Subtle detail
        float rockNoise = fbm(vWorldPos.xz * 0.1);
        col *= 0.9 + rockNoise * 0.1;

        float slopeFactor = smoothstep(0.25, 0.75, vSlope);
        vec3 rockColor = vec3(0.45, 0.48, 0.52);
        col = mix(col, rockColor, slopeFactor * 0.3);

        // Snow — very high only
        float snowMask = smoothstep(uSnowLine - 0.1, uSnowLine + 0.15, vHeight);
        snowMask *= (1.0 - smoothstep(0.2, 0.6, vSlope));
        snowMask *= 0.5 + fbm(vWorldPos.xz * 0.5) * 0.5;
        col = mix(col, uSnowColor, snowMask * 0.6);

        // Simple lighting
        float NdotL = dot(vNormal, uSunDirection);
        float diffuse = max(0.0, NdotL);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float rim = pow(1.0 - max(0.0, dot(viewDir, vNormal)), 3.0) * 0.2;
        col *= vec3(0.35) + diffuse * uSunColor * 0.65 + rim * uSunColor * 0.15;

        // Heavy atmospheric perspective — fog washes to blue haze
        float fogDensityAdj = uFogDensity * (1.0 + uDepthLayer * 0.8);
        float fogFactor = 1.0 - exp(-fogDensityAdj * fogDensityAdj * vFogDepth * vFogDepth);
        vec3 aerialColor = mix(uFogColor, uFogColor * vec3(0.85, 0.9, 1.15), uDepthLayer * 0.4);
        col = mix(col, aerialColor, fogFactor);
        col = mix(col, aerialColor, uDepthLayer * 0.25);
        gl_FragColor = vec4(col, uOpacity * (1.0 - fogFactor * 0.5));
      }
    `,
  })
}

/* ═══════════════════════════════════════════════════
   Mountain ranges — pushed very far back
   ═══════════════════════════════════════════════════ */
function buildRanges() {
  const rng = mulberry32(42)
  const ranges = []

  // Far background — blue-grey silhouettes on distant horizon
  const far = {
    baseColor: '#6a7a9a', peakColor: '#8a9ab8', snowColor: '#c8d0e0',
    snowLine: 0.90, opacity: 0.35, depthLayer: 1.5, fogDensity: 0.010, mountains: [],
  }
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI + Math.PI * 0.5 + (rng() - 0.5) * 0.15
    const px = Math.cos(angle) * 280
    const pz = Math.sin(angle) * 280
    if (minDistToRoute(px, pz) < 60) continue
    far.mountains.push({
      pos: [px, -3, pz],
      scale: [80 + rng() * 55, 55 + rng() * 40, 45],
      rot: rng() * 0.3,
      segments: PERF.MOUNTAIN_SEGMENTS_FAR,
      heightVar: 0.12, ridgeStr: 0.2, octaves: 4, verticalExag: 1.2, asymmetry: 0,
    })
  }
  ranges.push(far)

  // Mid range — dark forest green, moderate distance
  const mid = {
    baseColor: '#3a6a3a', peakColor: '#5a8a5a', snowColor: '#d0e0d0',
    snowLine: 0.92, opacity: 0.50, depthLayer: 0.8, fogDensity: 0.008, mountains: [],
  }
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + (rng() - 0.5) * 0.3
    const px = Math.cos(angle) * 220
    const pz = Math.sin(angle) * 220
    const mScale = 40 + rng() * 30
    if (minDistToRoute(px, pz) < mScale + 40) continue
    mid.mountains.push({
      pos: [px, -2, pz],
      scale: [mScale, 35 + rng() * 28, 35],
      rot: rng() * 0.4,
      segments: PERF.MOUNTAIN_SEGMENTS_MID,
      heightVar: 0.16, ridgeStr: 0.4, octaves: 5, verticalExag: 1.15, asymmetry: rng() * 0.3,
    })
  }
  ranges.push(mid)

  // Near foothills — green, still distant
  const near = {
    baseColor: '#4a7a4a', peakColor: '#6a9a6a', snowColor: '#e0e8e0',
    snowLine: 0.95, opacity: 0.65, depthLayer: 0.3, fogDensity: 0.006, mountains: [],
  }
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + (rng() - 0.5) * 0.4
    const px = Math.cos(angle) * 180
    const pz = Math.sin(angle) * 180
    const mScale = 35 + rng() * 20
    if (minDistToRoute(px, pz) < mScale + 35) continue
    near.mountains.push({
      pos: [px, -1, pz],
      scale: [mScale, 28 + rng() * 20, 28],
      rot: rng() * 0.5,
      segments: PERF.MOUNTAIN_SEGMENTS_NEAR,
      heightVar: 0.18, ridgeStr: 0.5, octaves: 6, verticalExag: 1.2, asymmetry: rng() * 0.4,
    })
  }
  ranges.push(near)

  return ranges
}

/* ═══════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════ */
export default function Mountains() {
  const progressRef = useProgress()
  const materialsRef = useRef([])

  const { meshData } = useMemo(() => {
    const mountainRanges = buildRanges()
    const meshes = []

    mountainRanges.forEach((range) => {
      range.mountains.forEach((m) => {
        const geometry = createMountainGeometry(
          m.segments, m.heightVar, m.ridgeStr, 0.3,
          m.octaves || 5, m.verticalExag || 1.0, m.asymmetry || 0
        )
        const material = createMountainMaterial({ ...range })
        meshes.push({ geometry, material, pos: m.pos, scale: m.scale, rot: m.rot })
      })
    })

    return { meshData: meshes }
  }, [])

  const setMatRef = useMemo(() => {
    return (idx) => (mesh) => {
      if (mesh) materialsRef.current[idx] = mesh.material
    }
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    const time = clock.elapsedTime
    materialsRef.current.forEach((mat) => {
      if (!mat) return
      mat.uniforms.uTime.value = time
      lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
      mat.uniforms.uFogColor.value.copy(_color)
      const sunY = lerpValue3(0.9, 0.3, -0.1, t)
      mat.uniforms.uSunDirection.value.set(lerpValue3(1.0, 0.8, 0.5, t), sunY, 0.5).normalize()
      lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
      mat.uniforms.uSunColor.value.copy(_color)
    })
  })

  return (
    <group>
      {meshData.map((m, i) => (
        <mesh
          key={i}
          position={m.pos}
          scale={m.scale}
          rotation={[0, m.rot, 0]}
          geometry={m.geometry}
          material={m.material}
          ref={setMatRef(i)}
        />
      ))}
    </group>
  )
}
