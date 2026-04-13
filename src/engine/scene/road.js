/**
 * ROAD — Procedural Multi-Lane Expressway
 * ════════════════════════════════════════
 * Dark asphalt PBR ground with painted lane markings.
 * Receives shadows from the truck.
 *
 * Architecture (Static Surface + Scrolling Marks):
 *   - Road surface (asphalt) stays centered at z=0 — visually uniform, never moves
 *   - Solid lane lines stay at z=0 — uniform, no motion needed
 *   - Dashed lane lines are the ONLY road meshes that scroll
 *     (they provide the forward-motion illusion for the road)
 *   - Shoulders stay at z=0
 *
 * Returns: { road, solidLines, dashedLines, leftShoulder, rightShoulder }
 *   worldMotion.js will only scroll dashedLines.
 */
import {
  MeshBuilder, PBRMaterial, Color3, StandardMaterial,
  Vector3, Mesh, DynamicTexture,
} from '@babylonjs/core'
import { ROAD } from '../config'

export function setupRoad(scene, shadowGen) {
  /* ── ASPHALT GROUND ────────────────────────────────────
     Large rectangle centered at z=0, always under the truck. */
  const road = MeshBuilder.CreateGround('road', {
    width: ROAD.WIDTH,
    height: ROAD.LENGTH,
    subdivisions: 2,
  }, scene)
  road.position.y = ROAD.Y
  road.position.z = 0            // ← centered on truck
  road.receiveShadows = true
  road.renderingGroupId = 1      // render above terrain

  const asphalt = new PBRMaterial('asphaltMat', scene)
  asphalt.albedoColor = new Color3(ROAD.ASPHALT_COLOR[0], ROAD.ASPHALT_COLOR[1], ROAD.ASPHALT_COLOR[2])
  asphalt.roughness = ROAD.ROUGHNESS
  asphalt.metallic = ROAD.METALLIC
  asphalt.environmentIntensity = 0.3
  asphalt.directIntensity = 1.2
  road.material = asphalt

  /* ── LANE MARKINGS ──────────────────────────────────────
     Split into solidLines (static) and dashedLines (scroll). */
  const solidLines = []
  const dashedLines = []

  // Helper: solid lane line (does NOT move)
  function createSolidLine(xOffset, color, width = 0.12) {
    const mat = new StandardMaterial(`solidMat_${xOffset}`, scene)
    mat.diffuseColor = color
    mat.specularColor = Color3.Black()
    mat.emissiveColor = Color3.Black()

    const line = MeshBuilder.CreateBox(`solidLine_${xOffset}`, {
      width, height: 0.005, depth: ROAD.LENGTH,
    }, scene)
    line.position.set(xOffset, ROAD.Y + 0.005, 0)
    line.material = mat
    line.isPickable = false
    line.renderingGroupId = 1
    solidLines.push(line)
  }

  // Dashed lane line — single ground plane per lane with tiled DynamicTexture
  // Scrolled via texture vOffset instead of individual mesh positions.
  const dashTextures = []
  function createDashedLine(xOffset, color, width = 0.10) {
    const plane = MeshBuilder.CreateGround(`dashPlane_${xOffset}`, {
      width,
      height: ROAD.LENGTH,
      subdivisions: 1,
    }, scene)
    plane.position.set(xOffset, ROAD.Y + 0.006, 0)
    plane.isPickable = false
    plane.renderingGroupId = 1

    // Procedural dash pattern via DynamicTexture
    const texH = 128, texW = 8
    const tex = new DynamicTexture(`dashTex_${xOffset}`, { width: texW, height: texH }, scene, false)
    const ctx = tex.getContext()
    ctx.clearRect(0, 0, texW, texH)
    const dashFrac = ROAD.DASH_LEN / (ROAD.DASH_LEN + ROAD.DASH_GAP)
    const dashPx = Math.round(dashFrac * texH)
    ctx.fillStyle = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`
    ctx.fillRect(0, 0, texW, dashPx)
    tex.hasAlpha = true
    tex.update()

    // Tile pattern along road length
    tex.vScale = ROAD.LENGTH / (ROAD.DASH_LEN + ROAD.DASH_GAP)
    tex.uScale = 1

    const mat = new StandardMaterial(`dashPlaneMat_${xOffset}`, scene)
    mat.diffuseTexture = tex
    mat.specularColor = Color3.Black()
    mat.emissiveColor = Color3.Black()
    mat.useAlphaFromDiffuseTexture = true
    mat.transparencyMode = 1 // ALPHATEST — crisp edges, no z-sorting issues
    mat.backFaceCulling = false
    plane.material = mat

    dashTextures.push(tex)
  }

  const white = new Color3(0.85, 0.85, 0.82)
  const yellow = new Color3(0.85, 0.72, 0.0)

  // Solid edge lines (outer edges of road) — STATIC
  createSolidLine(-ROAD.WIDTH / 2 + 0.3, white, 0.15)
  createSolidLine(ROAD.WIDTH / 2 - 0.3, white, 0.15)

  // Solid yellow median lines (center divider — double yellow) — STATIC
  createSolidLine(-0.18, yellow, 0.12)
  createSolidLine(0.18, yellow, 0.12)

  // Dashed white lane dividers — SCROLL to create motion illusion
  createDashedLine(-3.3, white, 0.10)
  createDashedLine(-1.7, white, 0.10)
  createDashedLine(1.7, white, 0.10)
  createDashedLine(3.3, white, 0.10)

  /* ── GREEN SHOULDERS ────────────────────────────────────
     Grass strips on both sides — STATIC, uniform surface. */
  function createShoulder(side) {
    const shoulderWidth = 6
    const shoulder = MeshBuilder.CreateGround(`shoulder_${side}`, {
      width: shoulderWidth,
      height: ROAD.LENGTH,
      subdivisions: 1,
    }, scene)
    const xPos = side === 'left'
      ? -ROAD.WIDTH / 2 - shoulderWidth / 2
      : ROAD.WIDTH / 2 + shoulderWidth / 2
    shoulder.position.set(xPos, ROAD.Y - 0.02, 0)
    shoulder.receiveShadows = true
    shoulder.renderingGroupId = 1

    const grass = new PBRMaterial(`shoulderMat_${side}`, scene)
    grass.albedoColor = new Color3(ROAD.SHOULDER_COLOR[0], ROAD.SHOULDER_COLOR[1], ROAD.SHOULDER_COLOR[2])
    grass.roughness = 0.95
    grass.metallic = 0
    grass.environmentIntensity = 0.2
    shoulder.material = grass
    shoulder.isPickable = false
    return shoulder
  }

  const leftShoulder = createShoulder('left')
  const rightShoulder = createShoulder('right')

  // Texture-based dash scrolling — called by worldMotion each frame
  let dashVOffset = 0
  function updateDashes(frameDist) {
    dashVOffset += frameDist / ROAD.LENGTH
    dashVOffset = ((dashVOffset % 1) + 1) % 1
    for (const tex of dashTextures) {
      tex.vOffset = dashVOffset
    }
  }

  return { road, solidLines, dashedLines, leftShoulder, rightShoulder, updateDashes }
}
