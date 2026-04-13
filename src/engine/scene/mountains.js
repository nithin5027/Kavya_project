/**
 * MOUNTAINS — Distant Atmospheric Silhouettes
 * ═══════════════════════════════════════════════
 * Three layers of procedural mountain ridges at varying
 * distances, fading into atmospheric haze.
 *
 * Uses tapered cylinders (cones) for natural mountain silhouettes.
 * Warm earth tones sell Indian landscape.
 * freezeWorldMatrix for performance — mountains never move.
 */
import {
  MeshBuilder, Color3, Vector3, Mesh, StandardMaterial,
} from '@babylonjs/core'
import { MOUNTAINS } from '../config'

/**
 * setupMountains — Places 3 concentric layers of mountain cones
 */
export function setupMountains(scene) {
  const allMeshes = []

  MOUNTAINS.LAYERS.forEach((layer, layerIdx) => {
    const { distance, count, scaleY, color, opacity } = layer

    const mat = new StandardMaterial(`mountainMat_${layerIdx}`, scene)
    mat.diffuseColor = new Color3(color[0], color[1], color[2])
    mat.specularColor = Color3.Black()
    mat.emissiveColor = Color3.Black()
    mat.alpha = opacity
    mat.backFaceCulling = false
    mat.disableLighting = true
    mat.freeze()

    const angleStep = (Math.PI * 1.8) / count
    const startAngle = -Math.PI * 0.9

    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * angleStep + (Math.random() - 0.5) * 0.2

      const height = scaleY[0] + Math.random() * (scaleY[1] - scaleY[0])
      const baseRadius = height * (1.8 + Math.random() * 2.2)
      const tessellation = 12 + Math.floor(Math.random() * 7) // 12-18 sides for smooth silhouette

      const peak = MeshBuilder.CreateCylinder(`mountain_${layerIdx}_${i}`, {
        diameterTop: 0,
        diameterBottom: baseRadius * 2,
        height,
        tessellation,
      }, scene)

      peak.material = mat
      peak.position.x = Math.sin(angle) * distance + (Math.random() - 0.5) * 30
      peak.position.z = Math.cos(angle) * distance + (Math.random() - 0.5) * 40
      peak.position.y = height / 2 - 4 + Math.random() * 3 // sink base well below terrain
      peak.rotation.y = Math.random() * Math.PI * 2 // random rotation for variety
      peak.isPickable = false
      peak.receiveShadows = false
      peak.freezeWorldMatrix()

      allMeshes.push(peak)
    }
  })

  return { mountains: allMeshes }
}
