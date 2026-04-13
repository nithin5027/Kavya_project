/**
 * ROUTE GLOW — Glowing trail following the spline
 * ════════════════════════════════════════════════
 * Reveals progress, traveling pulse, truck proximity halo.
 * depthWrite: false, proper renderOrder.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../config'
import { useProgress, routeCurve, lerpColor3, lerpValue3, _color } from '../core'

const _dayFog = new THREE.Color(COLORS.FOG_DAY)
const _sunsetFog = new THREE.Color(COLORS.FOG_SUNSET)
const _nightFog = new THREE.Color(COLORS.FOG_NIGHT)

export default function RouteGlow() {
  const ref = useRef()
  const progressRef = useProgress()

  const { geom, mat } = useMemo(() => {
    const g = new THREE.TubeGeometry(routeCurve, 300, 0.08, 8, false)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      renderOrder: 2,
      uniforms: {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(COLORS.FOG_DAY) },
        uFogDensity: { value: 0.012 },
      },
      vertexShader: /* glsl */ `
        varying float vAlong; varying float vFogDepth;
        void main() {
          vAlong = uv.x;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uProgress; uniform float uTime;
        uniform vec3 uFogColor; uniform float uFogDensity;
        varying float vAlong; varying float vFogDepth;
        void main() {
          float reveal = smoothstep(uProgress - 0.03, uProgress, vAlong);
          float ahead = smoothstep(uProgress, uProgress + 0.02, vAlong);
          float pulse = sin(vAlong * 80.0 - uTime * 4.0) * 0.5 + 0.5;
          vec3 activeCol = vec3(0.18, 0.42, 1.0);
          vec3 glowCol = vec3(0.4, 0.6, 1.0);
          vec3 futureCol = vec3(0.5, 0.55, 0.65);
          vec3 col = mix(mix(activeCol, glowCol, pulse * 0.4), futureCol, ahead);
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
    mat.uniforms.uFogColor.value.copy(_color)
    mat.uniforms.uFogDensity.value = lerpValue3(0.010, 0.014, 0.018, t)
  })

  return <mesh ref={ref} geometry={geom} material={mat} renderOrder={2} />
}
