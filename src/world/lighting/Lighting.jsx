/**
 * LIGHTING — Animated cinematic 3-point setup with day→sunset→night (V2)
 * ═══════════════════════════════════════════════════════════════════════
 * All lights + fog now animate with scroll progress.
 * Fog color/density, ambient intensity, key color, hemisphere sky —
 * everything transitions smoothly.
 */
import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LIGHTING, FOG, COLORS } from '../config'
import { useProgress, lerpColor3, lerpValue3, _color } from '../core'

/* ── Pre-allocated colors for lerp ── */
const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)
const _dayAmb = new THREE.Color(COLORS.AMB_DAY)
const _sunsetAmb = new THREE.Color(COLORS.AMB_SUNSET)
const _nightAmb = new THREE.Color(COLORS.AMB_NIGHT)
const _dayKey = new THREE.Color(COLORS.KEY_DAY)
const _sunsetKey = new THREE.Color(COLORS.KEY_SUNSET)
const _nightKey = new THREE.Color(COLORS.KEY_NIGHT)
const _dayRim = new THREE.Color(COLORS.RIM_DAY)
const _sunsetRim = new THREE.Color(COLORS.RIM_SUNSET)
const _nightRim = new THREE.Color(COLORS.RIM_NIGHT)
const _dayHemiSky = new THREE.Color(LIGHTING.HEMI_SKY)
const _sunsetHemiSky = new THREE.Color('#FF9966')
const _nightHemiSky = new THREE.Color('#1a1a3e')
const _dayHemiGround = new THREE.Color(LIGHTING.HEMI_GROUND)
const _sunsetHemiGround = new THREE.Color('#6a7a3a')
const _nightHemiGround = new THREE.Color('#2a3a2a')

export default function Lighting() {
  const { scene, gl } = useThree()
  const progressRef = useProgress()
  const initialized = useRef(false)

  const ambientRef = useRef()
  const hemiRef = useRef()
  const keyRef = useRef()
  const rimRef = useRef()

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Initial fog
    scene.fog = new THREE.FogExp2(FOG.COLOR, FOG.DENSITY)

    // Renderer settings
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.05
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [scene, gl])

  // Animate all lights + fog every frame
  useFrame(() => {
    const t = progressRef.current

    // Fog
    if (scene.fog) {
      lerpColor3(_dayFog, _sunsetFog, _nightFog, t)
      scene.fog.color.copy(_color)
      scene.fog.density = lerpValue3(0.008, 0.010, 0.016, t)
    }

    // Ambient
    if (ambientRef.current) {
      ambientRef.current.intensity = lerpValue3(0.70, 0.45, 0.22, t)
      lerpColor3(_dayAmb, _sunsetAmb, _nightAmb, t)
      ambientRef.current.color.copy(_color)
    }

    // Hemisphere
    if (hemiRef.current) {
      hemiRef.current.intensity = lerpValue3(0.50, 0.38, 0.18, t)
      lerpColor3(_dayHemiSky, _sunsetHemiSky, _nightHemiSky, t)
      hemiRef.current.color.copy(_color)
      lerpColor3(_dayHemiGround, _sunsetHemiGround, _nightHemiGround, t)
      hemiRef.current.groundColor.copy(_color)
    }

    // Key directional
    if (keyRef.current) {
      keyRef.current.intensity = lerpValue3(1.5, 1.0, 0.4, t)
      lerpColor3(_dayKey, _sunsetKey, _nightKey, t)
      keyRef.current.color.copy(_color)
    }

    // Rim fill
    if (rimRef.current) {
      rimRef.current.intensity = lerpValue3(0.35, 0.25, 0.15, t)
      lerpColor3(_dayRim, _sunsetRim, _nightRim, t)
      rimRef.current.color.copy(_color)
    }

    // Exposure
    gl.toneMappingExposure = lerpValue3(1.05, 0.90, 0.7, t)
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={LIGHTING.AMBIENT_INTENSITY} color={LIGHTING.AMBIENT_COLOR} />
      <hemisphereLight
        ref={hemiRef}
        skyColor={LIGHTING.HEMI_SKY}
        groundColor={LIGHTING.HEMI_GROUND}
        intensity={LIGHTING.HEMI_INTENSITY}
      />
      <directionalLight
        ref={keyRef}
        position={LIGHTING.KEY_POSITION}
        intensity={LIGHTING.KEY_INTENSITY}
        color={LIGHTING.KEY_COLOR}
        castShadow={false}
      />
      <directionalLight
        ref={rimRef}
        position={LIGHTING.RIM_POSITION}
        intensity={LIGHTING.RIM_INTENSITY}
        color={LIGHTING.RIM_COLOR}
        castShadow={false}
      />
    </>
  )
}

/**
 * VOLUMETRIC LIGHT RAYS — screen-space god rays from sun
 */
export function VolumetricLightRays() {
  const meshRef = useRef()

  useEffect(() => {
    if (!meshRef.current) return
    meshRef.current.renderOrder = -500
  }, [])

  return (
    <mesh ref={meshRef} position={LIGHTING.KEY_POSITION} rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[120, 80]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uColor: { value: new THREE.Color('#FFF5E1') },
          uIntensity: { value: 0.03 },
        }}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uColor;
          uniform float uIntensity;
          varying vec2 vUv;
          void main() {
            float dist = distance(vUv, vec2(0.5));
            float ray = smoothstep(0.5, 0.0, dist) * uIntensity;
            gl_FragColor = vec4(uColor, ray);
          }
        `}
      />
    </mesh>
  )
}
