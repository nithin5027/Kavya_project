/**
 * TERRAIN — Vast Dry Earth Ground Plane + Far Horizon
 * ═══════════════════════════════════════════════════
 * Large procedural terrain with gentle height variation.
 * PBR warm earth material — Indian highway feel.
 *
 * Key: terrain renderingGroupId = 0, road renderingGroupId = 1
 *      → road always renders ON TOP of terrain, no z-fighting.
 *
 * Road mask:
 *   - Terrain vertices near the road corridor (|x| < ROAD.WIDTH + shoulder + transition)
 *     are clamped to a low Y to prevent terrain poking through the road surface.
 *
 * Far ground planes extend the visible world to the horizon.
 */
import {
  MeshBuilder, PBRMaterial, Color3, VertexData, Mesh, StandardMaterial,
} from '@babylonjs/core'
import { TERRAIN, ROAD } from '../config'

/* ── Simple seeded noise (JS-side, for vertex displacement) ── */
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function noise2D(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz), b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbm(x, z, octaves = 4) {
  let val = 0, amp = 0.5, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    val += noise2D(x * freq, z * freq) * amp
    max += amp
    amp *= 0.5
    freq *= 2.1
  }
  return val / max
}

export function setupTerrain(scene) {
  const size = TERRAIN.SIZE
  const subs = TERRAIN.SUBDIVISIONS

  const ground = MeshBuilder.CreateGround('terrain', {
    width: size,
    height: size,
    subdivisions: subs,
    updatable: true,
  }, scene)
  ground.position.y = -0.15
  ground.receiveShadows = true
  ground.renderingGroupId = 0

  /* ── Displace vertices for gentle rolling hills ── */
  const positions = ground.getVerticesData('position')
  if (positions) {
    const roadHalf = ROAD.WIDTH / 2
    const shoulderWidth = 6
    const transitionWidth = 20
    const maskStart = roadHalf + shoulderWidth
    const maskEnd = maskStart + transitionWidth

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      const distFromCenter = Math.abs(x)
      const roadMask = Math.max(0, Math.min(1, (distFromCenter - maskStart) / transitionWidth))

      // Mix of gentle rolling + micro detail for visual texture
      const h1 = fbm(x * 0.008, z * 0.008, 4) * 3.0
      const h2 = fbm(x * 0.03, z * 0.03, 2) * 0.4      // micro detail
      positions[i + 1] = (h1 + h2) * roadMask
    }

    ground.updateVerticesData('position', positions)
    ground.createNormals(false)
  }

  /* ── PBR dry earth material ── */
  const mat = new PBRMaterial('terrainMat', scene)
  mat.albedoColor = new Color3(TERRAIN.COLOR[0], TERRAIN.COLOR[1], TERRAIN.COLOR[2])
  mat.roughness = TERRAIN.ROUGHNESS
  mat.metallic = 0
  mat.environmentIntensity = 0.25
  mat.directIntensity = 1.0
  ground.material = mat
  ground.isPickable = false

  /* ── Far ground planes — extend world to horizon ── */
  const farSize = 1200
  const farPlanes = ['left', 'right', 'front', 'back'].map((side) => {
    const plane = MeshBuilder.CreateGround(`farGround_${side}`, {
      width: side === 'front' || side === 'back' ? farSize : farSize,
      height: side === 'front' || side === 'back' ? farSize : farSize,
      subdivisions: 1,
    }, scene)
    const offset = size / 2 + farSize / 2 - 20
    if (side === 'left') plane.position.x = -offset
    else if (side === 'right') plane.position.x = offset
    else if (side === 'front') plane.position.z = offset
    else plane.position.z = -offset
    plane.position.y = -0.5

    const farMat = new PBRMaterial(`farGroundMat_${side}`, scene)
    // Slightly lighter/hazier version of terrain color (fades into fog)
    farMat.albedoColor = new Color3(
      TERRAIN.COLOR[0] * 0.8 + 0.15,
      TERRAIN.COLOR[1] * 0.8 + 0.12,
      TERRAIN.COLOR[2] * 0.8 + 0.10,
    )
    farMat.roughness = 1.0
    farMat.metallic = 0
    farMat.environmentIntensity = 0.1
    plane.material = farMat
    plane.renderingGroupId = 0
    plane.isPickable = false
    plane.receiveShadows = false
    return plane
  })

  return { ground, farPlanes }
}
