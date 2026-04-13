/**
 * VOLUMETRIC HEADLIGHT BEAMS — 3D cone shaders + dust motes
 * ══════════════════════════════════════════════════════════
 * Two cone meshes with custom volumetric shader.
 * Exponential falloff, noise dust-in-beam effect.
 * Intensity scales day→night. Additive blending.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HEADLIGHT_BEAMS } from '../config'
import { useProgress, truckWorldPos, lerpValue3 } from '../core'

const beamVertexShader = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vLocalPos = position;
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
  }
`

const beamFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uBeamColor;
  uniform float uConeLength;
  varying vec3 vLocalPos;
  varying vec2 vUv;
  varying float vFogDepth;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec3(1,0,0));
    float c = hash(i + vec3(0,1,0));
    float d = hash(i + vec3(1,1,0));
    float e = hash(i + vec3(0,0,1));
    float f1 = hash(i + vec3(1,0,1));
    float g = hash(i + vec3(0,1,1));
    float h = hash(i + vec3(1,1,1));
    float k0 = mix(a, b, f.x);
    float k1 = mix(c, d, f.x);
    float k2 = mix(e, f1, f.x);
    float k3 = mix(g, h, f.x);
    return mix(mix(k0, k1, f.y), mix(k2, k3, f.y), f.z);
  }

  void main() {
    // Distance along cone axis (z in local space)
    float along = vLocalPos.z / uConeLength;
    if (along < 0.0) discard;

    // Radial distance from center
    float radial = length(vLocalPos.xy);
    float maxRadius = along * ${HEADLIGHT_BEAMS.CONE_RADIUS.toFixed(1)};
    float radialFade = 1.0 - smoothstep(0.0, maxRadius, radial);

    // Exponential falloff along length
    float lengthFade = exp(-along * 2.5);

    // Animated dust noise
    vec3 noisePos = vLocalPos * 1.5 + vec3(0, 0, uTime * 0.8);
    float dust = noise3D(noisePos) * 0.7 + noise3D(noisePos * 2.5) * 0.3;
    dust = smoothstep(0.3, 0.7, dust);

    // Combine
    float alpha = radialFade * lengthFade * uIntensity * (0.5 + dust * 0.5);
    alpha *= smoothstep(0.0, 0.05, along); // fade near origin

    vec3 col = uBeamColor * (1.0 + dust * 0.2);

    gl_FragColor = vec4(col, alpha);
  }
`

/* ── Dust particles caught in headlight ── */
function HeadlightDust({ progressRef }) {
    const pointsRef = useRef()
    const count = HEADLIGHT_BEAMS.DUST_PARTICLE_COUNT

    const { positions, phases } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const ph = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            // Random positions in cone volume
            const z = Math.random() * HEADLIGHT_BEAMS.CONE_LENGTH
            const rMax = (z / HEADLIGHT_BEAMS.CONE_LENGTH) * HEADLIGHT_BEAMS.CONE_RADIUS
            const angle = Math.random() * Math.PI * 2
            const r = Math.random() * rMax
            pos[i * 3] = Math.cos(angle) * r
            pos[i * 3 + 1] = Math.sin(angle) * r
            pos[i * 3 + 2] = z
            ph[i * 3] = Math.random() * Math.PI * 2
            ph[i * 3 + 1] = Math.random() * Math.PI * 2
            ph[i * 3 + 2] = 0.3 + Math.random() * 0.7 // speed
        }
        return { positions: pos, phases: ph }
    }, [count])

    useFrame(({ clock }) => {
        if (!pointsRef.current) return
        const elapsed = clock.elapsedTime
        const attr = pointsRef.current.geometry.attributes.position
        const arr = attr.array
        for (let i = 0; i < count; i++) {
            const spd = phases[i * 3 + 2]
            arr[i * 3] += Math.sin(elapsed * 0.5 * spd + phases[i * 3]) * 0.005
            arr[i * 3 + 1] += Math.cos(elapsed * 0.4 * spd + phases[i * 3 + 1]) * 0.005
        }
        attr.needsUpdate = true

        // Fade dust based on time of day
        const t = progressRef.current
        const nightFactor = lerpValue3(0.0, 0.2, 1.0, t)
        pointsRef.current.material.opacity = nightFactor * 0.5
    })

    return (
        <points ref={pointsRef} renderOrder={103} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial
                size={0.06}
                color="#fffae0"
                transparent
                opacity={0}
                sizeAttenuation
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    )
}

export default function HeadlightBeams({ progressRef }) {
    const leftConeRef = useRef()
    const rightConeRef = useRef()
    const groupRef = useRef()

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uBeamColor: { value: new THREE.Color(HEADLIGHT_BEAMS.BEAM_COLOR_DAY) },
            uConeLength: { value: HEADLIGHT_BEAMS.CONE_LENGTH },
        },
        vertexShader: beamVertexShader,
        fragmentShader: beamFragmentShader,
    }), [])

    // Clone material for right beam
    const materialRight = useMemo(() => material.clone(), [material])

    useFrame(({ clock }) => {
        if (!groupRef.current) return
        const t = progressRef.current
        const elapsed = clock.elapsedTime

        // Position the beam group at truck position
        groupRef.current.position.copy(truckWorldPos)

        // Intensity: faint during day, bright at night
        const intensity = lerpValue3(
            HEADLIGHT_BEAMS.DAY_INTENSITY,
            HEADLIGHT_BEAMS.DAY_INTENSITY * 3,
            HEADLIGHT_BEAMS.NIGHT_INTENSITY,
            t
        )

        material.uniforms.uTime.value = elapsed
        material.uniforms.uIntensity.value = intensity
        materialRight.uniforms.uTime.value = elapsed
        materialRight.uniforms.uIntensity.value = intensity

        // Beam color warms at night
        const r = lerpValue3(1.0, 1.0, 1.0, t)
        const g = lerpValue3(0.97, 0.88, 0.85, t)
        const b = lerpValue3(0.88, 0.65, 0.55, t)
        material.uniforms.uBeamColor.value.setRGB(r, g, b)
        materialRight.uniforms.uBeamColor.value.setRGB(r, g, b)
    })

    const coneGeo = useMemo(() =>
        new THREE.ConeGeometry(HEADLIGHT_BEAMS.CONE_RADIUS, HEADLIGHT_BEAMS.CONE_LENGTH, 16, 1, true),
        [])

    return (
        <group ref={groupRef}>
            {/* Left headlight beam */}
            <mesh
                ref={leftConeRef}
                geometry={coneGeo}
                material={material}
                position={[0.7, 1.0, HEADLIGHT_BEAMS.CONE_LENGTH / 2 + 4.2]}
                rotation={[Math.PI / 2, 0, 0]}
                renderOrder={3}
            />
            {/* Right headlight beam */}
            <mesh
                ref={rightConeRef}
                geometry={coneGeo}
                material={materialRight}
                position={[-0.7, 1.0, HEADLIGHT_BEAMS.CONE_LENGTH / 2 + 4.2]}
                rotation={[Math.PI / 2, 0, 0]}
                renderOrder={3}
            />
            {/* Dust particles in beam */}
            <HeadlightDust progressRef={progressRef} />
        </group>
    )
}
