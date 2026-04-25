import { useRef, useMemo, createContext, useContext, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import CameraRig, { getCameraPaused } from './CameraRig'
import NetworkMap from './NetworkMap'
import Truck from './Truck'

/*
  CINEMATIC WORLD — Premium 3D Logistics Environment
  ════════════════════════════════════════════════════
  High-quality cinematic 3D animated environment with:
  - HDR gradient sky with animated clouds
  - Procedural mountains with parallax depth
  - Ground terrain with height variation
  - Physically based materials
  - Volumetric light rays
  - Contact shadows
  - Atmospheric fog with depth realism
  - Dust particle trails
*/

const ProgressCtx = createContext({ current: 0 })
export const useProgress = () => useContext(ProgressCtx)

/* ══════════════════════════════════════════════════════════
   COLOR GRADING KEYFRAMES — Day → Golden Hour → Dusk
   ══════════════════════════════════════════════════════════ */
const _dayBg = new THREE.Color('#87CEEB')
const _sunsetBg = new THREE.Color('#FF7E47')
const _nightBg = new THREE.Color('#1a1a2e')

const _dayFog = new THREE.Color('#c8e6ff')
const _sunsetFog = new THREE.Color('#FFB088')
const _nightFog = new THREE.Color('#2d2d44')

const _dayAmb = new THREE.Color('#ffffff')
const _sunsetAmb = new THREE.Color('#FFE4CC')
const _nightAmb = new THREE.Color('#4a4a6a')

const _dayKey = new THREE.Color('#FFFAF0')
const _sunsetKey = new THREE.Color('#FF8C42')
const _nightKey = new THREE.Color('#6B5B95')

const _dayRim = new THREE.Color('#87CEEB')
const _sunsetRim = new THREE.Color('#FF6B35')
const _nightRim = new THREE.Color('#3d3d5c')

const _tmpColor = new THREE.Color()

/* ── Pre-allocated sky colors (NEVER allocate inside useFrame) ── */
const _skyMid_day = new THREE.Color('#87CEEB')
const _skyMid_sunset = new THREE.Color('#FF9966')
const _skyBot_day = new THREE.Color('#E0F4FF')
const _skyBot_sunset = new THREE.Color('#FFD4B8')
const _skyTop_day = new THREE.Color('#1e3a5f')
const _skyTop_dusk = new THREE.Color('#0f1a2e')
const _skyMid_dusk = new THREE.Color('#FF6B35')
const _skyBot_dusk = new THREE.Color('#FF8C42')
const _skyTop_night = new THREE.Color('#050510')
const _skyMid_night = new THREE.Color('#1a1a3e')
const _skyBot_night = new THREE.Color('#2d2d5c')
const _sunCol_day = new THREE.Color('#FFFAF0')
const _sunCol_sunset = new THREE.Color('#FF6B35')
const _sunCol_night = new THREE.Color('#4a3060')

/* ── Pre-allocated ground colors ── */
const _ground1_day = new THREE.Color(0x228B22)
const _ground2_day = new THREE.Color(0x32CD32)
const _ground1_sunset = new THREE.Color(0x6B8E23)
const _ground2_sunset = new THREE.Color(0x9ACD32)
const _ground1_night = new THREE.Color(0x2d4a2d)
const _ground2_night = new THREE.Color(0x3d5a3d)

function lerpColor3(a, b, c, t) {
  if (t <= 0.3) return _tmpColor.copy(a).lerp(b, t / 0.3)
  if (t <= 0.7) return _tmpColor.copy(b).lerp(c, (t - 0.3) / 0.4)
  return _tmpColor.copy(c)
}

function lerpValue3(a, b, c, t) {
  if (t <= 0.3) return a + (b - a) * (t / 0.3)
  if (t <= 0.7) return b + (c - b) * ((t - 0.3) / 0.4)
  return c
}


/* ══════════════════════════════════════════════════════════
   HDR GRADIENT SKY WITH ANIMATED CLOUDS
   ══════════════════════════════════════════════════════════ */
function CinematicSky({ progressRef }) {
  const meshRef = useRef()

  const skyMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uSunPosition: { value: new THREE.Vector3(100, 50, -100) },
        uTopColor: { value: new THREE.Color('#1e3a5f') },
        uMidColor: { value: new THREE.Color('#87CEEB') },
        uBottomColor: { value: new THREE.Color('#E0F4FF') },
        uSunColor: { value: new THREE.Color('#FFFAF0') },
        uCloudColor: { value: new THREE.Color('#ffffff') },
        uCloudDensity: { value: 0.4 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uProgress;
        uniform vec3 uSunPosition;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunColor;
        uniform vec3 uCloudColor;
        uniform float uCloudDensity;
        
        varying vec3 vWorldPosition;
        varying vec3 vPosition;

        // Simplex noise for clouds
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        float fbm(vec3 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          for (int i = 0; i < 5; i++) {
            value += amplitude * snoise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
          }
          return value;
        }

        void main() {
          vec3 viewDir = normalize(vPosition);
          float height = viewDir.y;
          
          // Sky gradient
          vec3 skyColor;
          if (height > 0.0) {
            float t = pow(height, 0.4);
            skyColor = mix(uMidColor, uTopColor, t);
          } else {
            skyColor = mix(uMidColor, uBottomColor, -height * 2.0);
          }
          
          // Sun disc and glow
          vec3 sunDir = normalize(uSunPosition);
          float sunAngle = dot(viewDir, sunDir);
          float sunDisc = smoothstep(0.9995, 0.9998, sunAngle);
          float sunGlow = pow(max(0.0, sunAngle), 8.0) * 0.5;
          float sunHalo = pow(max(0.0, sunAngle), 2.0) * 0.15;
          
          skyColor += uSunColor * (sunDisc + sunGlow + sunHalo);
          
          // Animated clouds
          if (height > -0.1) {
            vec3 cloudPos = viewDir * 8.0 + vec3(uTime * 0.02, 0.0, uTime * 0.01);
            float cloudNoise = fbm(cloudPos) * 0.5 + 0.5;
            cloudNoise = smoothstep(0.3, 0.7, cloudNoise);
            
            // Cloud shadows and highlights
            float cloudShadow = fbm(cloudPos + vec3(0.1, 0.05, 0.0)) * 0.5 + 0.5;
            vec3 cloudShaded = mix(uCloudColor * 0.7, uCloudColor, cloudShadow);
            
            // Clouds lit by sun
            float cloudSunlight = pow(max(0.0, dot(viewDir, sunDir) + 0.5), 2.0);
            cloudShaded += uSunColor * cloudSunlight * 0.2;
            
            float cloudMask = cloudNoise * uCloudDensity * smoothstep(-0.1, 0.3, height);
            skyColor = mix(skyColor, cloudShaded, cloudMask);
          }
          
          // Horizon haze
          float horizonHaze = 1.0 - abs(height);
          horizonHaze = pow(horizonHaze, 4.0) * 0.3;
          skyColor = mix(skyColor, uSunColor * 0.8, horizonHaze);
          
          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
    })
  }, [])

  // Sky animation — LOCKED STATIC colors, only time for cloud movement
  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    
    skyMaterial.uniforms.uTime.value = time
    skyMaterial.uniforms.uProgress.value = 0 // Locked to day
    
    // Sun position — LOCKED, no animation
    skyMaterial.uniforms.uSunPosition.value.set(100, 60, -100)
    
    // Sky colors — LOCKED to warm day palette
    skyMaterial.uniforms.uTopColor.value.setHex(0x1e3a5f)
    skyMaterial.uniforms.uMidColor.value.setHex(0x87CEEB)
    skyMaterial.uniforms.uBottomColor.value.setHex(0xE0F4FF)
    skyMaterial.uniforms.uSunColor.value.setHex(0xFFFAF0)
    
    // Cloud density — LOCKED
    skyMaterial.uniforms.uCloudDensity.value = 0.15
  })

  return (
    <mesh ref={meshRef} material={skyMaterial}>
      <sphereGeometry args={[200, 64, 64]} />
    </mesh>
  )
}


/* ══════════════════════════════════════════════════════════
   CINEMATIC MOUNTAIN RANGES — Realistic Rocky Peaks
   ══════════════════════════════════════════════════════════ */
function CinematicMountains({ progressRef }) {
  const groupRef = useRef()
  const materialsRef = useRef([])
  
  // Generate realistic mountain range geometry with smooth terrain
  const createMountainGeometry = useMemo(() => {
    return (segments, heightVariation, ridgeStrength) => {
      const geom = new THREE.BufferGeometry()
      const vertices = []
      const normals = []
      const uvs = []
      const indices = []
      
      const width = 2
      const depth = 1.5
      const segsX = segments * 2  // Double resolution for smoothness
      const segsZ = Math.floor(segments * 1.2)
      
      // Smooth hash function
      const hash = (x, z) => {
        const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
        return n - Math.floor(n)
      }
      
      // Smooth interpolation
      const smoothstep = (a, b, t) => {
        t = Math.max(0, Math.min(1, t))
        t = t * t * (3 - 2 * t)
        return a + (b - a) * t
      }
      
      // Smooth noise with quintic interpolation
      const smoothNoise = (x, z) => {
        const ix = Math.floor(x)
        const iz = Math.floor(z)
        const fx = x - ix
        const fz = z - iz
        
        // Quintic smooth curve
        const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
        const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
        
        const a = hash(ix, iz)
        const b = hash(ix + 1, iz)
        const c = hash(ix, iz + 1)
        const d = hash(ix + 1, iz + 1)
        
        return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
      }
      
      // FBM for smooth layered detail
      const fbm = (x, z, octaves = 5) => {
        let value = 0
        let amplitude = 0.5
        let frequency = 1
        let maxValue = 0
        
        for (let i = 0; i < octaves; i++) {
          value += smoothNoise(x * frequency, z * frequency) * amplitude
          maxValue += amplitude
          amplitude *= 0.5
          frequency *= 2.1
        }
        return value / maxValue
      }
      
      // Generate vertices with smooth height variation
      for (let iz = 0; iz <= segsZ; iz++) {
        for (let ix = 0; ix <= segsX; ix++) {
          const u = ix / segsX
          const v = iz / segsZ
          const x = (u - 0.5) * width
          const z = (v - 0.5) * depth
          
          // Smooth peak shape with Gaussian-like falloff
          const distFromCenter = Math.sqrt(Math.pow((u - 0.5) * 2, 2) + Math.pow((v - 0.5) * 2, 2) * 0.5)
          const peakShape = Math.exp(-distFromCenter * distFromCenter * 2.5)
          
          let y = peakShape
          
          // Add smooth terrain detail using FBM
          const detailScale = 0.15
          y += fbm(ix * detailScale, iz * detailScale, 5) * heightVariation * peakShape
          
          // Soft ridge lines
          const ridgeWave = Math.sin(ix * ridgeStrength * 0.3) * 0.03 * peakShape
          y += ridgeWave
          
          vertices.push(x, Math.max(0, y), z)
          uvs.push(u, v)
        }
      }
      
      // Generate indices
      for (let iz = 0; iz < segsZ; iz++) {
        for (let ix = 0; ix < segsX; ix++) {
          const a = iz * (segsX + 1) + ix
          const b = a + 1
          const c = a + segsX + 1
          const d = c + 1
          indices.push(a, c, b, b, c, d)
        }
      }
      
      geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geom.setIndex(indices)
      geom.computeVertexNormals()
      
      return geom
    }
  }, [])
  
  // Mountain configurations for realistic ranges
  const mountainRanges = useMemo(() => {
    const ranges = []
    
    // Far background range - purple/lavender mountains  
    const farRange = {
      distance: 160,
      mountains: [],
      baseColor: '#6b5b95',
      peakColor: '#b8a9c9',
      snowColor: '#f0e6ff',
      snowLine: 0.7,
      opacity: 0.5,
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI + Math.PI * 0.5 + (Math.random() - 0.5) * 0.2
      farRange.mountains.push({
        pos: [Math.cos(angle) * 160, 0, Math.sin(angle) * 160],
        scale: [50 + Math.random() * 30, 35 + Math.random() * 25, 30],
        rot: Math.random() * 0.3,
        segments: 48,   // Higher resolution
        heightVar: 0.12,
        ridgeStr: 0.3,
      })
    }
    ranges.push(farRange)
    
    // Mid range — warm blue-grey mountains (was green, caused green wall)
    const midRange = {
      distance: 110,
      mountains: [],
      baseColor: '#5a6878',
      peakColor: '#8899a8',
      snowColor: '#f0f5ff',
      snowLine: 0.65,
      opacity: 0.7,
    }
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      if (Math.abs(Math.sin(angle)) < 0.4) continue // Wider gap for road corridor
      midRange.mountains.push({
        pos: [Math.cos(angle) * 110, 0, Math.sin(angle) * 110],
        scale: [35 + Math.random() * 20, 25 + Math.random() * 18, 25],
        rot: Math.random() * 0.4,
        segments: 56,   // Higher resolution
        heightVar: 0.15,
        ridgeStr: 0.4,
      })
    }
    ranges.push(midRange)
    
    // Near foothills - warm golden brown — pushed further out
    const nearRange = {
      distance: 75,
      mountains: [],
      baseColor: '#8b6914',
      peakColor: '#c9a227',
      snowColor: '#fffef0',
      snowLine: 0.75,
      opacity: 0.85,
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      // Wide gap along route corridor (positive X, negative Z quadrant + positive Z approach)
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)
      // Skip mountains whose positions are near the truck route corridor
      if (Math.abs(sinA) < 0.45) continue // clear front & back corridor
      nearRange.mountains.push({
        pos: [cosA * 85, 0, sinA * 85], // pushed to 85 units out
        scale: [20 + Math.random() * 12, 12 + Math.random() * 10, 15],  // smaller
        rot: Math.random() * 0.5,
        segments: 64,
        heightVar: 0.18,
        ridgeStr: 0.5,
      })
    }
    ranges.push(nearRange)
    
    return ranges
  }, [])
  
  // Create shader material for realistic mountains
  const createMountainMaterial = useMemo(() => {
    return (config) => new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.FrontSide,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(config.baseColor) },
        uPeakColor: { value: new THREE.Color(config.peakColor) },
        uSnowColor: { value: new THREE.Color(config.snowColor) },
        uSnowLine: { value: config.snowLine },
        uFogColor: { value: new THREE.Color('#e8f0f8') },
        uFogDensity: { value: 0.001 },
        uSunDirection: { value: new THREE.Vector3(1, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color('#FFFAF0') },
        uOpacity: { value: config.opacity },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vHeight;
        varying float vFogDepth;
        varying float vSlope;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vHeight = position.y;
          
          // Calculate slope for cliff texturing
          vSlope = 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));
          
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uPeakColor;
        uniform vec3 uSnowColor;
        uniform float uSnowLine;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uOpacity;
        
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vHeight;
        varying float vFogDepth;
        varying float vSlope;
        
        // Smooth noise for natural rock texture
        float hash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          // Quintic interpolation for ultra-smooth gradients
          f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // High quality FBM with 6 octaves for smooth terrain
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float maxValue = 0.0;
          for (int i = 0; i < 6; i++) {
            value += amplitude * noise(p);
            maxValue += amplitude;
            p *= 1.95;  // Slightly less than 2.0 for organic look
            amplitude *= 0.52;
          }
          return value / maxValue;
        }
        
        void main() {
          // Smooth rock texture from layered noise
          float rockNoise = fbm(vWorldPos.xz * 0.15);
          float detailNoise = fbm(vWorldPos.xz * 0.6);
          
          // Base color gradient by height with smooth transition
          float heightGrad = smoothstep(0.0, 1.0, vHeight);
          vec3 rockColor = mix(uBaseColor, uPeakColor, heightGrad);
          
          // Add rock texture variation - very subtle
          rockColor *= 0.92 + rockNoise * 0.16;
          
          // Cliff faces slightly darker (exposed rock)
          float cliffDarkening = mix(1.0, 0.8, smoothstep(0.4, 0.85, vSlope));
          rockColor *= cliffDarkening;
          
          // Smooth detail color variation
          rockColor += (detailNoise - 0.5) * 0.05;
          
          // Snow coverage with very smooth transitions
          float snowMask = smoothstep(uSnowLine - 0.15, uSnowLine + 0.2, vHeight);
          snowMask *= (1.0 - smoothstep(0.25, 0.7, vSlope)); // Less snow on steep slopes
          snowMask *= 0.75 + fbm(vWorldPos.xz * 0.8) * 0.5; // Smooth patchy snow
          
          vec3 color = mix(rockColor, uSnowColor, snowMask);
          
          // Lighting - diffuse + ambient
          float NdotL = dot(vNormal, uSunDirection);
          float diffuse = max(0.0, NdotL);
          float ambient = 0.35;
          
          // Soft shadow on back faces
          float wrap = max(0.0, (NdotL + 0.3) / 1.3);
          
          // Rim lighting for atmosphere
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float rim = 1.0 - max(0.0, dot(viewDir, vNormal));
          rim = pow(rim, 3.0) * 0.2;
          
          vec3 lighting = vec3(ambient) + diffuse * uSunColor * 0.7 + rim * uSunColor * 0.3;
          color *= lighting;
          
          // Subsurface scattering simulation for snow
          if (snowMask > 0.3) {
            float sss = pow(max(0.0, -NdotL), 2.0) * 0.15;
            color += uSunColor * sss * snowMask;
          }
          
          // Atmospheric fog with depth
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          color = mix(color, uFogColor, fogFactor);
          
          // Atmospheric perspective - blue tint in distance
          color = mix(color, uFogColor, fogFactor * 0.3);
          
          float alpha = uOpacity * (1.0 - fogFactor * 0.5);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    const time = clock.elapsedTime
    
    // Update all mountain materials
    materialsRef.current.forEach(mat => {
      if (!mat) return
      mat.uniforms.uTime.value = time
      
      // Fog color for time of day
      lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
      mat.uniforms.uFogColor.value.copy(_tmpColor)
      mat.uniforms.uFogDensity.value = 0.001
      
      // Sun direction changes with time
      const sunY = lerpValue3(0.8, 0.3, -0.1, t)
      const sunX = lerpValue3(1.0, 0.8, 0.5, t)
      mat.uniforms.uSunDirection.value.set(sunX, sunY, 0.5).normalize()
      
      // Sun color warm at sunset
      lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
      mat.uniforms.uSunColor.value.copy(_tmpColor)
    })
  })

  let matIndex = 0

  return (
    <group ref={groupRef}>
      {mountainRanges.map((range, ri) => (
        <group key={ri}>
          {range.mountains.map((m, mi) => {
            const geom = createMountainGeometry(m.segments, m.heightVar, m.ridgeStr)
            const mat = createMountainMaterial(range)
            const idx = matIndex++
            
            return (
              <mesh
                key={mi}
                position={m.pos}
                scale={m.scale}
                rotation={[0, m.rot, 0]}
                geometry={geom}
                ref={(mesh) => {
                  if (mesh) materialsRef.current[idx] = mesh.material
                }}
              >
                <primitive object={mat} attach="material" />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}


/* ══════════════════════════════════════════════════════════
   ENHANCED GROUND WITH TERRAIN VARIATION
   ══════════════════════════════════════════════════════════ */
function CinematicGround({ progressRef }) {
  const matRef = useRef()

  const groundMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color('#e8f0f8') },
        uFogDensity: { value: 0.001 },
        uGroundColor1: { value: new THREE.Color('#A89880') },
        uGroundColor2: { value: new THREE.Color('#BBA890') },
        uDirtColor: { value: new THREE.Color('#C4A77D') },
        uSunDirection: { value: new THREE.Vector3(1, 1, 0.5).normalize() },
        uSunColor: { value: new THREE.Color('#FFFAF0') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        varying vec3 vNormal;
        
        // Noise for height variation
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += amplitude * noise(p);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        void main() {
          vUv = uv;
          
          // Add height variation
          vec3 pos = position;
          float heightNoise = fbm(pos.xz * 0.02) * 2.0;
          heightNoise += fbm(pos.xz * 0.08) * 0.5;
          pos.y += heightNoise * 0.3;
          
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          
          // Calculate normal from height gradient
          float eps = 0.5;
          float hL = fbm((pos.xz + vec2(-eps, 0.0)) * 0.02) * 2.0;
          float hR = fbm((pos.xz + vec2(eps, 0.0)) * 0.02) * 2.0;
          float hD = fbm((pos.xz + vec2(0.0, -eps)) * 0.02) * 2.0;
          float hU = fbm((pos.xz + vec2(0.0, eps)) * 0.02) * 2.0;
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
        
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        float noise(vec2 p) {
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
          // Multi-scale noise for ground texture
          float n1 = noise(vWorldPos.xz * 0.1);
          float n2 = noise(vWorldPos.xz * 0.5);
          float n3 = noise(vWorldPos.xz * 2.0);
          float detail = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
          
          // Blend between grass and dirt
          vec3 groundColor = mix(uGroundColor1, uGroundColor2, detail);
          
          // Add dirt patches
          float dirtNoise = noise(vWorldPos.xz * 0.03);
          float dirtMask = smoothstep(0.4, 0.6, dirtNoise);
          groundColor = mix(groundColor, uDirtColor, dirtMask * 0.5);
          
          // Grid overlay (very subtle)
          vec2 grid = abs(fract(vWorldPos.xz * 0.1 - 0.5) - 0.5);
          float gridLine = min(grid.x, grid.y);
          float gridMask = 1.0 - smoothstep(0.0, 0.015, gridLine);
          groundColor *= 1.0 - gridMask * 0.08;
          
          // Simple diffuse lighting
          float diffuse = max(0.4, dot(vNormal, uSunDirection));
          groundColor *= diffuse;
          
          // Add subtle sun tint
          groundColor += uSunColor * 0.03;
          
          // Atmospheric fog
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 col = mix(groundColor, uFogColor, fogFactor);
          
          // Distance fade — ground only visible near the road/truck corridor
          // Beyond ~40 units from world origin, ground fades to fully transparent
          float distFromCenter = length(vWorldPos.xz);
          float distFade = 1.0 - smoothstep(20.0, 50.0, distFromCenter);
          
          float alpha = distFade * 0.18;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  }, [])

  // Ground colors — LOCKED STATIC (no animation)
  useFrame(({ clock }) => {
    groundMat.uniforms.uTime.value = clock.elapsedTime
    
    // Fog color — match sky background (no warm tint)
    groundMat.uniforms.uFogColor.value.setHex(0xe8f0f8)
    groundMat.uniforms.uFogDensity.value = 0.001
    
    // Ground colors — warm sandy brown (was grey-green, caused green wall)
    groundMat.uniforms.uGroundColor1.value.setHex(0xA89880)
    groundMat.uniforms.uGroundColor2.value.setHex(0xBBA890)
    
    // Sun direction — LOCKED
    groundMat.uniforms.uSunDirection.value.set(1.0, 0.8, 0.5).normalize()
    groundMat.uniforms.uSunColor.value.setHex(0xFFFAF0)
  })

  return null // Ground plane removed — road surface is sufficient
}


/* ══════════════════════════════════════════════════════════
   VOLUMETRIC LIGHT RAYS (GOD RAYS)
   ══════════════════════════════════════════════════════════ */
function VolumetricLightRays({ progressRef }) {
  const groupRef = useRef()
  
  const rays = useMemo(() => [
    { pos: [45, 0, 35], rot: [0.35, 0.3, 0.1], scale: [1.2, 30, 1] },
    { pos: [-40, 0, 20], rot: [0.3, -0.25, 0.15], scale: [0.8, 25, 1] },
    { pos: [50, 0, -25], rot: [0.4, 0.2, -0.1], scale: [1.0, 28, 1] },
    { pos: [-45, 0, -35], rot: [0.32, -0.35, 0.08], scale: [0.9, 22, 1] },
    { pos: [35, 0, 50], rot: [0.28, 0.4, 0.12], scale: [1.1, 26, 1] },
    { pos: [55, 0, -45], rot: [0.38, 0.15, -0.05], scale: [0.7, 20, 1] },
  ], [])
  
  const rayMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color('#FFFAF0') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        
        void main() {
          // Vertical gradient (bright at top, fading down)
          float gradient = pow(1.0 - vUv.y, 0.5);
          
          // Horizontal falloff (centered)
          float horizontal = 1.0 - abs(vUv.x - 0.5) * 2.0;
          horizontal = pow(horizontal, 2.0);
          
          // Animated shimmer
          float shimmer = sin(vUv.y * 10.0 + uTime * 0.5) * 0.1 + 0.9;
          
          float alpha = gradient * horizontal * shimmer * uOpacity;
          gl_FragColor = vec4(uColor, alpha * 0.15);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    const time = clock.elapsedTime
    
    rayMaterial.uniforms.uTime.value = time
    
    // Rays visible during golden hour (20%-70% scroll)
    let opacity = 0
    if (t > 0.15 && t < 0.75) {
      const enter = Math.min(1, (t - 0.15) / 0.15)
      const exit = Math.min(1, (0.75 - t) / 0.15)
      opacity = Math.min(enter, exit)
    }
    rayMaterial.uniforms.uOpacity.value = opacity
    
    // Color shifts with time of day (pre-allocated colors — no per-frame alloc)
    lerpColor3(_sunCol_day, _sunCol_sunset, _sunCol_night, t)
    rayMaterial.uniforms.uColor.value.copy(_tmpColor)
    
    // Animate ray rotation slightly
    if (groupRef.current) {
      groupRef.current.children.forEach((ray, i) => {
        ray.rotation.z = rays[i].rot[2] + Math.sin(time * 0.3 + i) * 0.02
      })
    }
  })

  return (
    <group ref={groupRef}>
      {rays.map((r, i) => (
        <mesh 
          key={i} 
          position={r.pos} 
          rotation={r.rot} 
          scale={r.scale}
          material={rayMaterial}
        >
          <planeGeometry args={[1, 1, 1, 8]} />
        </mesh>
      ))}
    </group>
  )
}


/* ══════════════════════════════════════════════════════════
   DUST TRAIL PARTICLE SYSTEM
   ══════════════════════════════════════════════════════════ */
function DustTrail({ truckWorldPos, progressRef }) {
  const particlesRef = useRef()
  const count = 100
  const velocitiesRef = useRef(new Float32Array(count * 3))
  const lifetimesRef = useRef(new Float32Array(count))
  const prevTruckPos = useRef(new THREE.Vector3())
  
  const { positions, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const sz = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = -100 // Hidden initially
      pos[i * 3 + 2] = 0
      sz[i] = 0.1 + Math.random() * 0.2
      lifetimesRef.current[i] = -1
    }
    return { positions: pos, sizes: sz }
  }, [])

  useFrame(({ clock }) => {
    if (!particlesRef.current) return
    
    const t = progressRef.current
    const dt = 0.016
    const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
    prevTruckPos.current.copy(truckWorldPos)
    
    const attr = particlesRef.current.geometry.attributes.position
    const arr = attr.array
    const vel = velocitiesRef.current
    const life = lifetimesRef.current
    
    // Spawn new particles based on truck speed
    const spawnRate = Math.min(5, Math.floor(truckSpeed * 30))
    let spawned = 0
    
    for (let i = 0; i < count; i++) {
      // Spawn new particle
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
      
      // Update existing particles
      if (life[i] > 0) {
        // Apply velocity
        arr[i * 3] += vel[i * 3] * dt
        arr[i * 3 + 1] += vel[i * 3 + 1] * dt
        arr[i * 3 + 2] += vel[i * 3 + 2] * dt
        
        // Gravity and drag
        vel[i * 3 + 1] -= 1.5 * dt
        vel[i * 3] *= 0.98
        vel[i * 3 + 2] *= 0.98
        
        // Decrease lifetime
        life[i] -= dt
        
        // Hide dead particles
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
      <pointsMaterial
        size={0.3}
        color="#C4A77D"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}


/* ══════════════════════════════════════════════════════════
   WORLD GRADING — SCENE ATMOSPHERE CONTROLLER
   ══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   WORLD GRADING — LOCKED STATIC COLORS (NO ANIMATION)
   ══════════════════════════════════════════════════════════
   CRITICAL: Colors are SET ONCE and NEVER CHANGE.
   This eliminates color flicker, random shifts, and grading instability.
*/
function WorldGrading({ progressRef, ambRef, keyRef, rimRef, hemiRef }) {
  const { scene } = useThree()

  // SET ONCE — warm industrial palette, never changes
  useMemo(() => {
    scene.fog = null
    scene.background = new THREE.Color('#e8f0f8')
  }, [scene])

  // Static light setup — no useFrame color changes
  useEffect(() => {
    if (ambRef.current) {
      ambRef.current.color.set('#fff2e6')
      ambRef.current.intensity = 0.55
    }
    if (hemiRef.current) {
      hemiRef.current.color.set('#ffeedd')
      hemiRef.current.groundColor.set('#d4b896')
      hemiRef.current.intensity = 0.45
    }
    if (keyRef.current) {
      keyRef.current.color.set('#ffb57a')
      keyRef.current.intensity = 1.2
      keyRef.current.position.set(8, 14, -6)
    }
    if (rimRef.current) {
      rimRef.current.color.set('#9fb8ff')
      rimRef.current.intensity = 0.35
    }
  }, [ambRef, hemiRef, keyRef, rimRef])

  return null
}


/* ══════════════════════════════════════════════════════════
   ROUTE CURVE DEFINITION — extended into tunnel
   ══════════════════════════════════════════════════════════ */
const ROUTE_POINTS = [
  new THREE.Vector3(-40, 0.1, 45),
  new THREE.Vector3(-25, 0.1, 30),
  new THREE.Vector3(-10, 0.1, 18),
  new THREE.Vector3(0, 0.1, 8),
  new THREE.Vector3(8, 0.1, 0),
  new THREE.Vector3(15, 0.1, -10),
  new THREE.Vector3(20, 0.1, -22),
  new THREE.Vector3(22, 0.1, -34),
  new THREE.Vector3(24, 0.1, -44),   // Truck stops well before mountains
  new THREE.Vector3(25, 0.1, -50),   // Final position — fog hides it
]
const routeCurve = new THREE.CatmullRomCurve3(ROUTE_POINTS, false, 'centripetal', 0.5)
const _truckWorldPos = new THREE.Vector3()


/* ══════════════════════════════════════════════════════════
   CINEMATIC TUNNEL — Narrative ending (truck disappears into darkness)
   ══════════════════════════════════════════════════════════ */
function CinematicTunnel() {
  const progressRef = useProgress()
  const interiorLightRef = useRef()
  
  // Tunnel position (entrance at route end point)
  const tunnelPos = useMemo(() => [30, 3, -62], [])
  
  useFrame(() => {
    const t = progressRef.current
    // Interior glow increases as camera approaches (t > 0.85)
    if (interiorLightRef.current) {
      const approach = Math.max(0, (t - 0.85) / 0.15)
      interiorLightRef.current.intensity = approach * 1.5
    }
  })
  
  return (
    <group position={tunnelPos}>
      {/* Tunnel cylinder — BackSide rendering for interior */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, -8]}>
        <cylinderGeometry args={[6, 6, 20, 32, 1, true]} />
        <meshStandardMaterial
          color="#2a2a2a"
          side={THREE.BackSide}
          roughness={0.85}
          metalness={0.1}
        />
      </mesh>
      
      {/* Tunnel entrance arch — mountain cut-through */}
      <mesh position={[0, 0, 2]}>
        <torusGeometry args={[6, 1.2, 8, 32, Math.PI]} />
        <meshStandardMaterial color="#4a4a3a" roughness={0.9} />
      </mesh>
      
      {/* Rock face around entrance */}
      <mesh position={[8, 2, 0]} rotation={[0, -0.3, 0]}>
        <boxGeometry args={[8, 10, 6]} />
        <meshStandardMaterial color="#5a5a4a" roughness={0.95} />
      </mesh>
      <mesh position={[-8, 2, 0]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[8, 10, 6]} />
        <meshStandardMaterial color="#5a5a4a" roughness={0.95} />
      </mesh>
      
      {/* Warm interior light — cinematic glow */}
      <pointLight
        ref={interiorLightRef}
        position={[0, 2, -12]}
        color="#ffbb77"
        intensity={0}
        distance={20}
        decay={2}
      />
      
      {/* Road continuation into tunnel */}
      <mesh position={[0, 0.05, -8]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 20]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
    </group>
  )
}


/* ══════════════════════════════════════════════════════════
   ENHANCED ROAD WITH ASPHALT TEXTURE
   ══════════════════════════════════════════════════════════ */
function CinematicRoad({ progressRef }) {
  const geom = useMemo(() => {
    const points = routeCurve.getSpacedPoints(200)
    const frames = routeCurve.computeFrenetFrames(200, false)
    const positions = []
    const uvs = []

    for (let i = 0; i <= 200; i++) {
      const p = points[i]
      const binormal = frames.binormals[i]
      for (let j = 0; j <= 4; j++) {
        const t = (j / 4) * 4.5 - 2.25
        const px = p.x + binormal.x * t
        const py = 0.08
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
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color('#e8f0f8') },
        uFogDensity: { value: 0.001 },
        uRoadColor: { value: new THREE.Color('#3a3a3a') },
        uLineColor: { value: new THREE.Color('#ffffff') },
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
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uRoadColor;
        uniform vec3 uLineColor;
        varying vec2 vUv;
        varying float vFogDepth;
        varying vec3 vWorldPos;
        
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        
        void main() {
          vec3 road = uRoadColor;
          
          // Asphalt texture noise
          float noise1 = hash(vWorldPos.xz * 10.0);
          float noise2 = hash(vWorldPos.xz * 50.0);
          road += (noise1 - 0.5) * 0.03 + (noise2 - 0.5) * 0.02;
          
          // Tire tracks (subtle darkening)
          float track1 = 1.0 - smoothstep(0.0, 0.02, abs(vUv.x - 0.28));
          float track2 = 1.0 - smoothstep(0.0, 0.02, abs(vUv.x - 0.72));
          road *= 1.0 - (track1 + track2) * 0.08;
          
          // Center dashed line (yellow)
          float center = abs(vUv.x - 0.5);
          float dashes = step(0.5, fract(vUv.y * 50.0));
          float centerLine = (1.0 - smoothstep(0.0, 0.018, center)) * dashes;
          road = mix(road, vec3(1.0, 0.85, 0.0), centerLine * 0.9);
          
          // Edge lines (white)
          float edgeL = 1.0 - smoothstep(0.0, 0.02, abs(vUv.x - 0.08));
          float edgeR = 1.0 - smoothstep(0.0, 0.02, abs(vUv.x - 0.92));
          road = mix(road, uLineColor, (edgeL + edgeR) * 0.8);
          
          // Fog
          float fogFade = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 col = mix(road, uFogColor, fogFade);
          float alpha = (1.0 - fogFade) * 0.95;
          
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })
  }, [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    mat.uniforms.uTime.value = clock.elapsedTime
    
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uFogDensity.value = 0.001
    
    // Road gets slightly warmer at sunset
    const roadBrightness = lerpValue3(0.23, 0.28, 0.12, t)
    mat.uniforms.uRoadColor.value.setRGB(roadBrightness, roadBrightness * 0.95, roadBrightness * 0.9)
  })

  return <mesh geometry={geom} material={mat} />
}


/* ══════════════════════════════════════════════════════════
   ROUTE GLOW TRAIL
   ══════════════════════════════════════════════════════════ */
function RouteGlow() {
  const ref = useRef()
  const progressRef = useProgress()

  const { geom, mat } = useMemo(() => {
    const g = new THREE.TubeGeometry(routeCurve, 300, 0.08, 8, false)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color('#e8f0f8') },
        uFogDensity: { value: 0.001 },
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
        varying float vAlong;
        varying float vFogDepth;
        
        void main() {
          float reveal = smoothstep(uProgress - 0.03, uProgress, vAlong);
          float ahead = smoothstep(uProgress, uProgress + 0.02, vAlong);
          float pulse = sin(vAlong * 80.0 - uTime * 4.0) * 0.5 + 0.5;
          
          vec3 activeColor = vec3(0.18, 0.42, 1.0);
          vec3 glowColor = vec3(0.4, 0.6, 1.0);
          vec3 futureColor = vec3(0.5, 0.55, 0.65);
          
          vec3 col = mix(mix(activeColor, glowColor, pulse * 0.4), futureColor, ahead);
          
          float leadGlow = smoothstep(0.04, 0.0, abs(vAlong - uProgress)) * 1.5;
          col += vec3(0.3, 0.5, 1.0) * leadGlow;
          
          float d = uFogDensity;
          float fogFade = 1.0 - exp(-d * d * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, fogFade * 0.5);
          
          float alpha = (1.0 - reveal) * 0.7 * (1.0 - fogFade * 0.6);
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
    lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
    mat.uniforms.uFogColor.value.copy(_tmpColor)
    mat.uniforms.uFogDensity.value = 0.001
  })

  return <mesh ref={ref} geometry={geom} material={mat} />
}


/* ══════════════════════════════════════════════════════════
   ATMOSPHERIC DUST PARTICLES
   ══════════════════════════════════════════════════════════ */
function AtmosphericDust({ progressRef }) {
  const ref = useRef()
  const count = 80

  const { positions, phases } = useMemo(() => {
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
    return { positions: pos, phases: ph }
  }, [])

  const basePositions = useMemo(() => new Float32Array(positions), [positions])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const elapsed = clock.elapsedTime
    const attr = ref.current.geometry.attributes.position
    const arr = attr.array

    for (let i = 0; i < count; i++) {
      const spd = phases[i * 3 + 2]
      const phX = phases[i * 3]
      const phZ = phases[i * 3 + 1]
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
      <pointsMaterial
        size={0.15}
        color="#d4c4a8"
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}


/* ══════════════════════════════════════════════════════════
   CINEMATIC INDUSTRIAL BUILDINGS — Realistic Warehouses
   ══════════════════════════════════════════════════════════ */
function CinematicWarehouses() {
  const progressRef = useProgress()
  const glowRefs = useRef([])
  const windowRefs = useRef([])

  const warehouses = useMemo(() => [
    { pos: [-18, 0, 35], size: [8, 5, 12], rot: 0.2, type: 'main', color: '#D4856A' },      // Warm terracotta - far left
    { pos: [35, 0, 25], size: [12, 4, 8], rot: -0.1, type: 'logistics', color: '#8B9DAF' }, // Steel blue-grey - far right
    { pos: [-28, 0, 5], size: [7, 6, 10], rot: 0.15, type: 'storage', color: '#9AACBA' },   // Cool grey-blue - far left
    { pos: [40, 0, -5], size: [10, 4.5, 9], rot: -0.25, type: 'distribution', color: '#B5AA98' }, // Warm stone - far right
    { pos: [-22, 0, -30], size: [9, 5, 11], rot: 0.1, type: 'main', color: '#D4C5A9' },     // Sand - far left
    { pos: [45, 0, -35], size: [11, 4, 7], rot: -0.15, type: 'logistics', color: '#A89BBC' }, // Muted lavender - far right
  ], [])

  useFrame(({ clock }) => {
    const t = progressRef.current
    const time = clock.elapsedTime
    
    // Interior glow increases at dusk/night
    const baseGlow = t > 0.4 ? Math.min(1, (t - 0.4) / 0.3) * 1.2 : 0
    
    // Window emissive flicker
    const flicker = 0.9 + Math.sin(time * 2.3) * 0.05 + Math.sin(time * 5.7) * 0.03

    glowRefs.current.forEach((g, i) => {
      if (!g) return
      const wPos = warehouses[i].pos
      const dx = _truckWorldPos.x - wPos[0]
      const dz = _truckWorldPos.z - wPos[2]
      const dist = Math.sqrt(dx * dx + dz * dz)
      const proximity = Math.max(0, 1 - dist / 30) * 0.6
      g.intensity = (baseGlow + proximity) * flicker
    })
    
    // Animate window emission
    windowRefs.current.forEach((w, i) => {
      if (!w) return
      const emit = baseGlow * flicker * 0.4
      w.emissiveIntensity = emit
    })
  })

  const setGlowRef = (i) => (el) => { glowRefs.current[i] = el }
  const addWindowRef = (el) => { if (el && !windowRefs.current.includes(el)) windowRefs.current.push(el) }

  return (
    <group>
      {warehouses.map((w, i) => (
        <group key={i} position={w.pos} rotation={[0, w.rot, 0]}>
          
          {/* ═══ FOUNDATION / BASE ═══ */}
          <mesh position={[0, 0.15, 0]} receiveShadow>
            <boxGeometry args={[w.size[0] + 0.8, 0.3, w.size[2] + 0.8]} />
            <meshStandardMaterial color="#6b7280" metalness={0.1} roughness={0.9} />
          </mesh>
          
          {/* ═══ MAIN BUILDING STRUCTURE ═══ */}
          {/* Corrugated Steel Walls - Front */}
          <mesh position={[0, w.size[1] / 2 + 0.3, w.size[2] / 2]} receiveShadow>
            <boxGeometry args={[w.size[0], w.size[1], 0.15]} />
            <meshStandardMaterial 
              color={w.color} 
              metalness={0.35} 
              roughness={0.6}
            />
          </mesh>
          {/* Wall corrugation detail - front */}
          {[...Array(Math.floor(w.size[0] / 0.8))].map((_, ci) => (
            <mesh key={`cf${ci}`} position={[ci * 0.8 - w.size[0] / 2 + 0.4, w.size[1] / 2 + 0.3, w.size[2] / 2 + 0.08]}>
              <boxGeometry args={[0.03, w.size[1] - 0.2, 0.02]} />
              <meshStandardMaterial color="#b0b5bc" metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
          
          {/* Corrugated Steel Walls - Back */}
          <mesh position={[0, w.size[1] / 2 + 0.3, -w.size[2] / 2]} receiveShadow>
            <boxGeometry args={[w.size[0], w.size[1], 0.15]} />
            <meshStandardMaterial color={w.color} metalness={0.35} roughness={0.6} />
          </mesh>
          
          {/* Side Walls with depth */}
          <mesh position={[w.size[0] / 2, w.size[1] / 2 + 0.3, 0]} receiveShadow>
            <boxGeometry args={[0.15, w.size[1], w.size[2]]} />
            <meshStandardMaterial color={w.color} metalness={0.35} roughness={0.6} />
          </mesh>
          <mesh position={[-w.size[0] / 2, w.size[1] / 2 + 0.3, 0]} receiveShadow>
            <boxGeometry args={[0.15, w.size[1], w.size[2]]} />
            <meshStandardMaterial color={w.color} metalness={0.35} roughness={0.6} />
          </mesh>
          
          {/* ═══ PITCHED ROOF WITH BEAMS ═══ */}
          {/* Main roof panels */}
          <mesh position={[0, w.size[1] + 0.3 + 0.8, w.size[2] / 4]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[w.size[0] + 0.4, 0.08, w.size[2] / 2 + 0.5]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, w.size[1] + 0.3 + 0.8, -w.size[2] / 4]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[w.size[0] + 0.4, 0.08, w.size[2] / 2 + 0.5]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Roof ridge cap */}
          <mesh position={[0, w.size[1] + 0.3 + 1.05, 0]}>
            <boxGeometry args={[w.size[0] + 0.5, 0.12, 0.3]} />
            <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.3} />
          </mesh>
          
          {/* Roof support beams */}
          {[...Array(Math.floor(w.size[0] / 3) + 1)].map((_, bi) => (
            <mesh key={`rb${bi}`} position={[bi * 3 - w.size[0] / 2 + 0.5, w.size[1] + 0.3 + 0.4, 0]}>
              <boxGeometry args={[0.15, 0.15, w.size[2] - 0.5]} />
              <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          
          {/* ═══ LOADING BAY DOORS ═══ */}
          {[...Array(Math.max(2, Math.floor(w.size[0] / 4)))].map((_, j) => {
            const doorWidth = 2.5
            const doorHeight = w.size[1] * 0.7
            const xPos = j * (doorWidth + 0.8) - w.size[0] / 2 + doorWidth / 2 + 0.8
            
            return (
              <group key={`door${j}`} position={[xPos, doorHeight / 2 + 0.3, w.size[2] / 2 + 0.1]}>
                {/* Door frame */}
                <mesh>
                  <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.2, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* Rolling shutter door */}
                <mesh position={[0, 0, 0.05]}>
                  <boxGeometry args={[doorWidth, doorHeight, 0.06]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.25} />
                </mesh>
                {/* Shutter lines */}
                {[...Array(Math.floor(doorHeight / 0.25))].map((_, li) => (
                  <mesh key={`line${li}`} position={[0, li * 0.25 - doorHeight / 2 + 0.2, 0.09]}>
                    <boxGeometry args={[doorWidth - 0.1, 0.02, 0.01]} />
                    <meshStandardMaterial color="#4b5563" metalness={0.5} roughness={0.4} />
                  </mesh>
                ))}
                {/* Door surround lights */}
                <mesh position={[doorWidth / 2 + 0.3, doorHeight / 2 - 0.3, 0.1]}>
                  <boxGeometry args={[0.15, 0.25, 0.1]} />
                  <meshStandardMaterial 
                    color="#fef3c7" 
                    emissive="#fef3c7" 
                    emissiveIntensity={0.3}
                    ref={addWindowRef}
                  />
                </mesh>
              </group>
            )
          })}
          
          {/* ═══ OFFICE SECTION WITH WINDOWS ═══ */}
          <mesh position={[-w.size[0] / 2 + 1.5, w.size[1] * 0.4 + 0.3, w.size[2] / 2 + 0.3]} castShadow>
            <boxGeometry args={[3, w.size[1] * 0.8, 3]} />
            <meshStandardMaterial color="#f3f4f6" metalness={0.15} roughness={0.7} />
          </mesh>
          {/* Office windows */}
          {[[0, 0.5], [0, -0.5], [0.8, 0], [-0.8, 0]].map(([ox, oy], wi) => (
            <mesh key={`win${wi}`} position={[-w.size[0] / 2 + 1.5 + ox, w.size[1] * 0.5 + 0.3 + oy, w.size[2] / 2 + 1.82]}>
              <boxGeometry args={[0.6, 0.8, 0.05]} />
              <meshStandardMaterial 
                color="#5599cc" 
                metalness={0.9} 
                roughness={0.1}
                emissive="#ffeecc"
                emissiveIntensity={0}
                ref={addWindowRef}
              />
            </mesh>
          ))}
          
          {/* ═══ VENTILATION & HVAC UNITS ═══ */}
          {[...Array(Math.floor(w.size[0] / 5))].map((_, vi) => (
            <group key={`vent${vi}`} position={[vi * 5 - w.size[0] / 2 + 3, w.size[1] + 1.0, (vi % 2 === 0 ? 1 : -1) * w.size[2] * 0.2]}>
              <mesh>
                <boxGeometry args={[1.2, 0.6, 0.8]} />
                <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.3} />
              </mesh>
              {/* Fan grille */}
              <mesh position={[0.61, 0, 0]}>
                <boxGeometry args={[0.02, 0.4, 0.6]} />
                <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.6} />
              </mesh>
            </group>
          ))}
          
          {/* ═══ KAVYA BRANDING ═══ */}
          {/* Large brand signage */}
          <mesh position={[0, w.size[1] * 0.75 + 0.3, w.size[2] / 2 + 0.16]}>
            <boxGeometry args={[w.size[0] * 0.5, 0.8, 0.05]} />
            <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
          </mesh>
          <Text
            position={[0, w.size[1] * 0.75 + 0.3, w.size[2] / 2 + 0.2]}
            fontSize={0.5} 
            color="#f97316"
            anchorX="center" 
            anchorY="middle" 
            letterSpacing={0.15}
            font={undefined}
          >
            KAVYA
          </Text>
          <Text
            position={[0, w.size[1] * 0.75 + 0.3 - 0.35, w.size[2] / 2 + 0.2]}
            fontSize={0.18} 
            color="#e5e7eb"
            anchorX="center" 
            anchorY="middle" 
            letterSpacing={0.25}
          >
            TRANSPORTS
          </Text>
          
          {/* Orange accent stripe */}
          <mesh position={[0, w.size[1] + 0.25, w.size[2] / 2 + 0.08]}>
            <boxGeometry args={[w.size[0], 0.15, 0.02]} />
            <meshStandardMaterial 
              color="#f97316" 
              metalness={0.3} 
              roughness={0.5}
              emissive="#f97316"
              emissiveIntensity={0.1}
            />
          </mesh>
          
          {/* ═══ DOCK AREA ═══ */}
          {/* Loading dock platform */}
          <mesh position={[0, 0.6, w.size[2] / 2 + 1.5]} receiveShadow>
            <boxGeometry args={[w.size[0] - 1, 0.9, 2.5]} />
            <meshStandardMaterial color="#6b7280" metalness={0.2} roughness={0.8} />
          </mesh>
          {/* Dock bumpers */}
          {[...Array(Math.max(2, Math.floor(w.size[0] / 4)))].map((_, bi) => (
            <mesh key={`bump${bi}`} position={[bi * 3.3 - w.size[0] / 2 + 2, 0.7, w.size[2] / 2 + 2.7]}>
              <boxGeometry args={[0.3, 0.5, 0.2]} />
              <meshStandardMaterial color="#1f2937" metalness={0.1} roughness={0.9} />
            </mesh>
          ))}
          
          {/* ═══ GROUND MARKINGS ═══ */}
          {/* Forklift lanes */}
          <mesh position={[0, 0.02, w.size[2] / 2 + 4]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w.size[0] + 2, 6]} />
            <meshStandardMaterial color="#4b5563" metalness={0.1} roughness={0.9} transparent opacity={0.6} />
          </mesh>
          {/* Yellow safety lines */}
          {[-w.size[0] / 2 - 0.5, w.size[0] / 2 + 0.5].map((lx, li) => (
            <mesh key={`line${li}`} position={[lx, 0.025, w.size[2] / 2 + 4]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.15, 6]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.2} roughness={0.7} />
            </mesh>
          ))}
          
          {/* ═══ INTERIOR LIGHTING ═══ */}
          <pointLight
            ref={setGlowRef(i)}
            position={[0, w.size[1] * 0.7, 0]}
            color="#fff5e6"
            intensity={0}
            distance={w.size[0] * 2.5}
            decay={2}
          />
          
          {/* ═══ EXTERIOR FLOOD LIGHTS ═══ */}
          <mesh position={[w.size[0] / 2 - 0.5, w.size[1] + 0.8, w.size[2] / 2 - 0.5]}>
            <boxGeometry args={[0.4, 0.3, 0.25]} />
            <meshStandardMaterial 
              color="#e5e7eb" 
              emissive="#fffbe6"
              emissiveIntensity={0.2}
            />
          </mesh>
          <mesh position={[-w.size[0] / 2 + 0.5, w.size[1] + 0.8, w.size[2] / 2 - 0.5]}>
            <boxGeometry args={[0.4, 0.3, 0.25]} />
            <meshStandardMaterial 
              color="#e5e7eb" 
              emissive="#fffbe6"
              emissiveIntensity={0.2}
            />
          </mesh>
          
        </group>
      ))}
    </group>
  )
}


/* ══════════════════════════════════════════════════════════
   CINEMATIC CONTAINER YARD — Detailed Shipping Containers
   ══════════════════════════════════════════════════════════ */
function CinematicContainerYard() {
  const progressRef = useProgress()
  
  const containers = useMemo(() => {
    const brandColors = [
      { main: '#2563eb', accent: '#1d4ed8', text: '#ffffff' }, // Blue
      { main: '#f97316', accent: '#ea580c', text: '#ffffff' }, // Orange (Kavya)
      { main: '#1e293b', accent: '#0f172a', text: '#f1f5f9' }, // Dark
      { main: '#dc2626', accent: '#b91c1c', text: '#ffffff' }, // Red
      { main: '#f5f5f5', accent: '#e5e5e5', text: '#1f2937' }, // White
      { main: '#16a34a', accent: '#15803d', text: '#ffffff' }, // Green
    ]
    
    const items = []
    const yards = [
      { pos: [35, 0, 38], rows: 3, cols: 4 },    // Far right front
      { pos: [-35, 0, -8], rows: 2, cols: 5 },   // Far left middle  
      { pos: [45, 0, -42], rows: 3, cols: 3 },   // Far right back
      { pos: [-25, 0, 48], rows: 2, cols: 4 },   // Far left front
    ]

    yards.forEach((yard, yi) => {
      for (let r = 0; r < yard.rows; r++) {
        for (let c = 0; c < yard.cols; c++) {
          const stackH = (yi + r + c) % 4 === 0 ? 3 : (yi + r + c) % 2 === 0 ? 2 : 1
          for (let h = 0; h < stackH; h++) {
            const colorIdx = (yi + r + c + h) % brandColors.length
            items.push({
              pos: [yard.pos[0] + c * 3.2, h * 1.5 + 0.75, yard.pos[2] + r * 1.8],
              rot: (yi % 2) * 0.1,
              colors: brandColors[colorIdx],
              isKavya: colorIdx === 1,
              size: [3.0, 1.4, 1.4],
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
        <group key={i} position={c.pos} rotation={[0, c.rot, 0]}>
          {/* Main container body */}
          <mesh matrixAutoUpdate={false}>
            <boxGeometry args={c.size} />
            <meshStandardMaterial 
              color={c.colors.main} 
              metalness={0.55} 
              roughness={0.45}
            />
          </mesh>
          
          {/* Corrugated side panels */}
          {[-1, 1].map((side, si) => (
            <group key={`side${si}`}>
              {[...Array(12)].map((_, ri) => (
                <mesh key={`rib${ri}`} position={[ri * 0.23 - 1.3, 0, side * (c.size[2] / 2 + 0.01)]}>
                  <boxGeometry args={[0.04, c.size[1] - 0.1, 0.03]} />
                  <meshStandardMaterial color={c.colors.accent} metalness={0.6} roughness={0.4} />
                </mesh>
              ))}
            </group>
          ))}
          
          {/* Door end (back) */}
          <mesh position={[-c.size[0] / 2 - 0.01, 0, 0]}>
            <boxGeometry args={[0.05, c.size[1], c.size[2]]} />
            <meshStandardMaterial color={c.colors.accent} metalness={0.5} roughness={0.5} />
          </mesh>
          {/* Door handles */}
          {[[0.3, 0], [-0.3, 0]].map(([dy, dz], di) => (
            <mesh key={`handle${di}`} position={[-c.size[0] / 2 - 0.04, dy, dz * 0.3]}>
              <boxGeometry args={[0.03, 0.6, 0.08]} />
              <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
          
          {/* Corner posts */}
          {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([cx, cz], ci) => (
            <mesh key={`corner${ci}`} position={[cx * (c.size[0] / 2 - 0.05), 0, cz * (c.size[2] / 2 - 0.05)]}>
              <boxGeometry args={[0.1, c.size[1] + 0.02, 0.1]} />
              <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          
          {/* Top rails */}
          <mesh position={[0, c.size[1] / 2 + 0.02, 0]}>
            <boxGeometry args={[c.size[0], 0.04, c.size[2]]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
          
          {/* Branding */}
          <Text
            position={[0, 0.1, c.size[2] / 2 + 0.02]}
            fontSize={0.18}
            color={c.colors.text}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.1}
          >
            {c.isKavya ? 'KAVYA TRANSPORTS' : 'CONTAINER'}
          </Text>
          
          {/* ISO codes on corner */}
          <Text
            position={[c.size[0] / 2 - 0.3, c.size[1] / 2 - 0.15, c.size[2] / 2 + 0.02]}
            fontSize={0.08}
            color={c.colors.text}
            anchorX="right"
            anchorY="middle"
          >
            {c.isKavya ? 'KVYA' : 'CSLU'}{Math.floor(Math.random() * 900000 + 100000)}
          </Text>
          
          {/* Forklift pockets */}
          {[[0.8, 0], [-0.8, 0]].map(([px, pz], pi) => (
            <mesh key={`pocket${pi}`} position={[px, -c.size[1] / 2 + 0.08, pz]}>
              <boxGeometry args={[0.6, 0.12, c.size[2] + 0.02]} />
              <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.6} />
            </mesh>
          ))}
          
        </group>
      ))}
    </group>
  )
}


/* ══════════════════════════════════════════════════════════
   CINEMATIC ENDING — 4-Phase Brand Film Finale
   ══════════════════════════════════════════════════════════
   Phase 1 (t 0.92→0.94): Truck vanishes into fog
   Phase 2 (t 0.94→0.97): Camera ascends to sky
   Phase 3 (t 0.97→0.99): Sun flare reveal
   Phase 4 (t 0.99→1.0):  Logo hold (handled by OverlayUI CSS)
*/
export const ENDING_START = 0.92

const _endBgBase = new THREE.Color('#f3e2d2')
const _endBgFlare = new THREE.Color('#fff8ee')
const _endFogWarm = new THREE.Color('#ffe0b8')

function CinematicEnding({ progressRef, keyRef }) {
  const { scene } = useThree()
  const baseDensity = 0.014

  useFrame(() => {
    const t = progressRef.current
    if (t < 0.90) {
      // Reset fog if user scrolls back
      if (scene.fog) scene.fog.density = baseDensity
      scene.background.copy(_endBgBase)
      return
    }

    const endT = Math.max(0, (t - ENDING_START) / (1.0 - ENDING_START)) // 0→1

    /* ── Phase 1: Fog density ramp — truck vanishes ── */
    const fogPhase = Math.min(1, endT / 0.3) // 0→1 in first 30% of ending
    if (scene.fog) {
      scene.fog.density = baseDensity + fogPhase * 0.055 // 0.014 → 0.069
      // Warm the fog color slightly
      scene.fog.color.copy(_endFogWarm).lerp(scene.fog.color, 1.0 - fogPhase * 0.5)
    }

    /* ── Phase 3: Sun flare — bright warm background ── */
    const flareT = Math.max(0, Math.min(1, (endT - 0.625) / 0.25)) // 0→1 from 0.97→0.99
    if (flareT > 0) {
      scene.background.copy(_endBgBase).lerp(_endBgFlare, flareT * 0.7)
      // Boost key light for flare effect
      if (keyRef?.current) {
        keyRef.current.intensity = 1.2 + flareT * 1.5
        keyRef.current.color.setRGB(
          1.0,
          0.92 + flareT * 0.08,
          0.75 + flareT * 0.15
        )
      }
    }
  })

  return null
}


/* ══════════════════════════════════════════════════════════
   MAIN WORLD COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function CinematicWorld({ progressRef }) {
  const ambRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()
  const hemiRef = useRef()

  return (
    <ProgressCtx.Provider value={progressRef}>
      {/* ══ Production — diagnostics removed ══ */}

      <CameraRig progressRef={progressRef} truckWorldPos={_truckWorldPos} />
      <WorldGrading 
        progressRef={progressRef} 
        ambRef={ambRef} 
        keyRef={keyRef} 
        rimRef={rimRef}
        hemiRef={hemiRef}
      />

      {/* ══ LIGHTING — Warm Industrial (2 directional + ambient + hemi) ══ */}
      <ambientLight ref={ambRef} intensity={0.55} color="#fff2e6" />
      <hemisphereLight ref={hemiRef} args={['#ffeedd', '#d4b896', 0.45]} />
      <directionalLight
        ref={keyRef}
        position={[8, 14, -6]}
        intensity={1.2}
        color="#ffb57a"
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.002}
      />
      <directionalLight ref={rimRef} position={[-6, 6, 6]} intensity={0.35} color="#9fb8ff" />

      {/* ══ ENVIRONMENT — Sky, Mountains, Ground (no particles, no volumetrics) ══ */}
      <CinematicSky progressRef={progressRef} />
      <CinematicMountains progressRef={progressRef} />
      <CinematicGround progressRef={progressRef} />

      {/* ══ ROAD & ROUTE ══ */}
      <CinematicRoad progressRef={progressRef} />
      <RouteGlow />

      {/* ══ TRUCK ══ */}
      <Truck progressRef={progressRef} routeCurve={routeCurve} truckWorldPos={_truckWorldPos} />

      {/* ══ INFRASTRUCTURE ══ */}
      <CinematicWarehouses />
      <CinematicContainerYard />
      <NetworkMap />

      {/* ══ CINEMATIC ENDING — fog ramp, sun flare ══ */}
      <CinematicEnding progressRef={progressRef} keyRef={keyRef} />

      {/* No post-processing — clean render, CSS handles vignette/grade */}
    </ProgressCtx.Provider>
  )
}
