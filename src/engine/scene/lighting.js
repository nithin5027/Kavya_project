/**
 * LIGHTING — Golden Hour Cinematic Setup
 * ═══════════════════════════════════════
 * Warm directional sun from behind-left (dramatic long shadows),
 * soft hemispheric fill, 2048 soft-shadow generator.
 *
 * Cinematic reasoning:
 * - Sun low on horizon creates long contact shadows → depth
 * - Warm color temperature → emotional warmth / trust
 * - Hemisphere fill from above prevents pitch-black shadows
 * - Soft shadow blur kernel avoids harsh CG look
 */
import { DirectionalLight, HemisphericLight, ShadowGenerator, Vector3, Color3 } from '@babylonjs/core'
import { LIGHTING as CFG } from '../config'

// [PERF-FIX] Tier-aware shadows and explicit truck-only caster registration.
export function applyShadowTier(tier, shadowGen) {
  if (!shadowGen) return
  const quality = tier === 'high'
    ? ShadowGenerator.QUALITY_HIGH
    : tier === 'balanced'
      ? ShadowGenerator.QUALITY_MEDIUM
      : ShadowGenerator.QUALITY_LOW
  shadowGen.filteringQuality = quality
  shadowGen.transparencyShadow = tier === 'high'
}

export function setupLighting(scene, deviceTier = 'balanced') {
  /* ── Directional Sun (key light) ─────────────────────
     Low-angle golden sun — the hero light.
     Position set high and behind so the truck casts
     dramatic forward-facing shadows toward camera. */
  const sun = new DirectionalLight(
    'sunLight',
    new Vector3(CFG.SUN.DIRECTION[0], CFG.SUN.DIRECTION[1], CFG.SUN.DIRECTION[2]),
    scene
  )
  sun.position = new Vector3(CFG.SUN.POSITION[0], CFG.SUN.POSITION[1], CFG.SUN.POSITION[2])
  sun.intensity = CFG.SUN.INTENSITY
  sun.diffuse = new Color3(CFG.SUN.COLOR[0], CFG.SUN.COLOR[1], CFG.SUN.COLOR[2])
  sun.specular = new Color3(
    CFG.SUN.COLOR[0] * 0.6,
    CFG.SUN.COLOR[1] * 0.6,
    CFG.SUN.COLOR[2] * 0.6
  )

  /* ── Shadow Generator ────────────────────────────────
     2048 resolution with PCF (Percentage Closer Filtering)
     for cinema-quality soft shadows.
     Shadow darkness < 1.0 so shadows are slightly transparent
     (more natural — real shadows are never pure black). */
  const shadowMapSize = deviceTier === 'high' ? 2048 : deviceTier === 'balanced' ? 1536 : 1024
  const shadowGen = new ShadowGenerator(shadowMapSize, sun)
  shadowGen.usePercentageCloserFiltering = true   // PCF instead of blur ESM — cleaner
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM
  shadowGen.darkness = CFG.SHADOW.DARKNESS
  shadowGen.bias = CFG.SHADOW.BIAS
  shadowGen.setDarkness(CFG.SHADOW.DARKNESS)
  shadowGen.transparencyShadow = false
  applyShadowTier(deviceTier, shadowGen)

  // Shadow frustum — wide enough for the road + truck area
  sun.shadowMinZ = 1
  sun.shadowMaxZ = 120
  sun.autoUpdateExtends = false
  sun.shadowOrthoScale = 0
  sun.orthoLeft = -CFG.SHADOW.FRUSTUM_SIZE / 2
  sun.orthoRight = CFG.SHADOW.FRUSTUM_SIZE / 2
  sun.orthoTop = CFG.SHADOW.FRUSTUM_SIZE / 2
  sun.orthoBottom = -CFG.SHADOW.FRUSTUM_SIZE / 2

  /* ── Hemispheric Fill (ambient) ──────────────────────
     Sky color from above, earth tone from below.
     Very low intensity — just enough to lift shadows
     without flattening the scene. */
  const fill = new HemisphericLight(
    'fillLight',
    new Vector3(CFG.FILL.DIRECTION[0], CFG.FILL.DIRECTION[1], CFG.FILL.DIRECTION[2]),
    scene
  )
  fill.intensity = CFG.FILL.INTENSITY
  fill.diffuse = new Color3(CFG.FILL.SKY_COLOR[0], CFG.FILL.SKY_COLOR[1], CFG.FILL.SKY_COLOR[2])
  fill.groundColor = new Color3(
    CFG.FILL.GROUND_COLOR[0],
    CFG.FILL.GROUND_COLOR[1],
    CFG.FILL.GROUND_COLOR[2]
  )
  fill.specular = Color3.Black() // no specular from fill — only sun should produce highlights

  /* ── Ground Bounce Fill (4th light) ──────────────────
     Simulates light bouncing from the road surface.
     Very low intensity warm light from below — prevents
     pitch-black undersides of the truck. */
  const groundBounce = new HemisphericLight(
    'groundBounce',
    new Vector3(0, -1, 0),
    scene
  )
  groundBounce.intensity = 0.15
  groundBounce.diffuse = new Color3(0.95, 0.85, 0.7) // warm road reflection
  groundBounce.groundColor = new Color3(0.1, 0.12, 0.18) // minimal sky contribution
  groundBounce.specular = Color3.Black()

  return { sun, fill, shadowGen, groundBounce }
}

export function configureTruckShadowCasters(shadowGen, truckRoot) {
  if (!shadowGen || !truckRoot || !truckRoot.getChildMeshes) return
  truckRoot.getChildMeshes().forEach((mesh) => {
    if (mesh && mesh.getTotalVertices && mesh.getTotalVertices() > 0) {
      shadowGen.addShadowCaster(mesh, true)
    }
  })
}
