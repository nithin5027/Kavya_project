/**
 * WEATHER EFFECTS — Dynamic rain + tyre water splash
 * ═══════════════════════════════════════════════════
 * Rain activates during sunset phase (t ≈ 0.35–0.70).
 * GPU rain streaks, road wetness, tyre spray mist.
 * Intensity ramps up, peaks, then clears before night.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WEATHER, SCENE } from '../config'
import { useProgress, truckWorldPos, lerpValue3 } from '../core'

/* ── Rain intensity curve ── */
function rainIntensity(t) {
    if (t < WEATHER.START_T) return 0
    if (t < WEATHER.PEAK_T) {
        return (t - WEATHER.START_T) / (WEATHER.PEAK_T - WEATHER.START_T)
    }
    if (t < WEATHER.END_T) {
        return 1.0 - (t - WEATHER.PEAK_T) / (WEATHER.END_T - WEATHER.PEAK_T)
    }
    return 0
}

/* ═══════════════════════════════════════
   RAIN STREAKS — elongated falling particles
   ═══════════════════════════════════════ */
export function RainStreaks() {
    const pointsRef = useRef()
    const progressRef = useProgress()
    const count = WEATHER.RAIN_COUNT

    const { positions, velocities, phases } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const vel = new Float32Array(count * 3)
        const ph = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * WEATHER.RAIN_AREA
            pos[i * 3 + 1] = Math.random() * WEATHER.RAIN_HEIGHT
            pos[i * 3 + 2] = (Math.random() - 0.5) * WEATHER.RAIN_AREA
            vel[i * 3] = WEATHER.WIND_DIRECTION[0] * (0.8 + Math.random() * 0.4)
            vel[i * 3 + 1] = -(WEATHER.RAIN_SPEED * (0.7 + Math.random() * 0.3))
            vel[i * 3 + 2] = WEATHER.WIND_DIRECTION[2] * (0.8 + Math.random() * 0.4)
            ph[i] = Math.random()
        }
        return { positions: pos, velocities: vel, phases: ph }
    }, [count])

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uIntensity: { value: 0 },
            uColor: { value: new THREE.Color(WEATHER.RAIN_COLOR) },
        },
        vertexShader: /* glsl */ `
      uniform float uIntensity;
      varying float vAlpha;
      void main() {
        vAlpha = uIntensity;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        // Elongated streaks
        gl_PointSize = max(1.0, 3.0 * uIntensity * (150.0 / -mvPos.z));
        gl_Position = projectionMatrix * mvPos;
      }
    `,
        fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        // Elongated vertically for rain streak look
        float d = length(vec2(c.x * 3.0, c.y));
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(uColor, soft * vAlpha * 0.5);
      }
    `,
    }), [])

    useFrame(({ clock }) => {
        if (!pointsRef.current) return
        const dt = 0.016
        const t = progressRef.current
        const intensity = rainIntensity(t)

        material.uniforms.uIntensity.value = intensity

        if (intensity <= 0) return // Skip updates when no rain

        const attr = pointsRef.current.geometry.attributes.position
        const arr = attr.array

        // Center rain around truck for performance
        const cx = truckWorldPos.x
        const cz = truckWorldPos.z
        const halfArea = WEATHER.RAIN_AREA / 2

        for (let i = 0; i < count; i++) {
            arr[i * 3] += velocities[i * 3] * dt
            arr[i * 3 + 1] += velocities[i * 3 + 1] * dt * intensity
            arr[i * 3 + 2] += velocities[i * 3 + 2] * dt

            // Recycle fallen drops
            if (arr[i * 3 + 1] < 0) {
                arr[i * 3] = cx + (Math.random() - 0.5) * WEATHER.RAIN_AREA
                arr[i * 3 + 1] = WEATHER.RAIN_HEIGHT + Math.random() * 5
                arr[i * 3 + 2] = cz + (Math.random() - 0.5) * WEATHER.RAIN_AREA
            }

            // Wrap horizontally around truck
            if (arr[i * 3] > cx + halfArea) arr[i * 3] -= WEATHER.RAIN_AREA
            if (arr[i * 3] < cx - halfArea) arr[i * 3] += WEATHER.RAIN_AREA
            if (arr[i * 3 + 2] > cz + halfArea) arr[i * 3 + 2] -= WEATHER.RAIN_AREA
            if (arr[i * 3 + 2] < cz - halfArea) arr[i * 3 + 2] += WEATHER.RAIN_AREA
        }
        attr.needsUpdate = true
    })

    return (
        <points ref={pointsRef} renderOrder={104} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <primitive object={material} attach="material" />
        </points>
    )
}

/* ═══════════════════════════════════════
   TYRE WATER SPRAY — fan mist behind wheels in rain
   ═══════════════════════════════════════ */
export function TyreWaterSpray() {
    const pointsRef = useRef()
    const progressRef = useProgress()
    const count = WEATHER.SPLASH_COUNT
    const prevTruckPos = useRef(new THREE.Vector3())

    const { positions, velocities, lifetimes } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const vel = new Float32Array(count * 3)
        const life = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            pos[i * 3 + 1] = -200
            life[i] = -1
        }
        return { positions: pos, velocities: vel, lifetimes: life }
    }, [count])

    useFrame(() => {
        if (!pointsRef.current) return
        const dt = 0.016
        const t = progressRef.current
        const intensity = rainIntensity(t)
        if (intensity <= 0.1) return

        const truckSpeed = truckWorldPos.distanceTo(prevTruckPos.current)
        prevTruckPos.current.copy(truckWorldPos)

        const attr = pointsRef.current.geometry.attributes.position
        const arr = attr.array
        const spawnRate = Math.floor(intensity * truckSpeed * 60)
        let spawned = 0

        for (let i = 0; i < count; i++) {
            if (spawned < spawnRate && lifetimes[i] < 0) {
                // Spawn behind rear wheels
                const side = spawned % 2 === 0 ? -1.2 : 1.2
                arr[i * 3] = truckWorldPos.x + side + (Math.random() - 0.5) * 0.8
                arr[i * 3 + 1] = 0.15 + Math.random() * 0.2
                arr[i * 3 + 2] = truckWorldPos.z - 3.0 + (Math.random() - 0.5) * 1.0

                // Fan-shaped spray
                velocities[i * 3] = (Math.random() - 0.5) * 4.0
                velocities[i * 3 + 1] = Math.random() * 3.0 + 1.0
                velocities[i * 3 + 2] = (Math.random() - 0.5) * 4.0 - truckSpeed * 10

                lifetimes[i] = 0.4 + Math.random() * 0.4
                spawned++
            }

            if (lifetimes[i] > 0) {
                arr[i * 3] += velocities[i * 3] * dt
                arr[i * 3 + 1] += velocities[i * 3 + 1] * dt
                arr[i * 3 + 2] += velocities[i * 3 + 2] * dt
                velocities[i * 3 + 1] -= 6.0 * dt
                velocities[i * 3] *= 0.94
                velocities[i * 3 + 2] *= 0.94
                lifetimes[i] -= dt
                if (lifetimes[i] <= 0 || arr[i * 3 + 1] < 0) {
                    arr[i * 3 + 1] = -200
                    lifetimes[i] = -1
                }
            }
        }
        attr.needsUpdate = true
    })

    return (
        <points ref={pointsRef} renderOrder={105} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial
                size={0.25}
                color={WEATHER.SPLASH_COLOR}
                transparent
                opacity={0.35}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    )
}

/* ═══════════════════════════════════════
   ROAD WETNESS OVERLAY — subtle reflective sheen
   ═══════════════════════════════════════ */
export function RoadWetness() {
    const progressRef = useProgress()

    const material = useMemo(() => new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
        },
        vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9993, 1.0);
      }
    `,
        fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1,0));
        float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
        return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
      }

      void main() {
        // Wetness reflection effect on lower portion of screen (road area)
        float roadMask = smoothstep(0.5, 0.1, vUv.y);

        // Puddle-like noise patches
        float n = noise(vUv * 20.0 + uTime * 0.1);
        float puddle = smoothstep(0.55, 0.7, n) * roadMask;

        // Subtle reflection shimmer
        float shimmer = noise(vec2(vUv.x * 30.0, vUv.y * 10.0 + uTime * 0.5));
        shimmer = smoothstep(0.4, 0.8, shimmer);

        vec3 reflectionColor = vec3(0.6, 0.7, 0.85);
        float alpha = puddle * shimmer * uIntensity * 0.06;

        gl_FragColor = vec4(reflectionColor, alpha);
      }
    `,
    }), [])

    useFrame(({ clock }) => {
        const t = progressRef.current
        material.uniforms.uTime.value = clock.elapsedTime
        material.uniforms.uIntensity.value = rainIntensity(t)
    })

    return (
        <mesh renderOrder={9993} material={material} frustumCulled={false}>
            <planeGeometry args={[2, 2]} />
        </mesh>
    )
}
