/**
 * CINEMATIC DIRECTOR — Master Orchestrator
 * ══════════════════════════════════════════
 * Reads speedNorm from camera and scroll progress,
 * then drives ALL cinematic sub-systems each frame:
 *
 *   J — Road specular response (asphalt roughness → lower at speed)
 *   L — Dynamic rim light (intensity boost at side angles)
 *   M — Parallax horizon drift (sky dome subtle shift)
 *   N — Color temperature shift through scroll (morning→afternoon→sunset)
 *   P — Motion-based shadow softening (blur kernel)
 *   T — Adaptive exposure (brighter in shade, dimmer toward sun)
 *   U — Time-of-day sun Y progression through scroll
 *   V — Night mode transition
 *   W — Dynamic lighting response (truck reflections react to sun)
 *   X — Atmosphere orchestration
 *   Y — Post-processing dynamics (DOF, chromatic aberration)
 *
 * Philosophy: Every effect is continuous, smooth, and driven
 * by speedNormalized (0→1) — coherent "pulse" of motion.
 */
import { Vector3, Color3 } from '@babylonjs/core'
import { ROAD, LIGHTING, POST, CINEMATIC, NIGHT_MODE, FOG, SKY } from '../config'

/**
 * setupCinematicDirector
 * @param {object} refs  — scene references
 */
export function setupCinematicDirector(refs) {
  const {
    scene, asphaltMat, sun, fill, shadowGen, skyMat, skyDome, getSpeedNorm,
    updatePostProcessing, getFocusDistance, updateAtmosphere,
  } = refs

  const ipc = scene.imageProcessingConfiguration
  const baseSunDirY = LIGHTING.SUN.DIRECTION[1]
  const baseBlurKernel = LIGHTING.SHADOW.BLUR_KERNEL

  // Smooth state
  let smoothSpeed = 0
  let smoothExposure = POST.EXPOSURE
  let nightBlend = 0

  // Pre-compute color temp arrays as Color3 for lerping
  const tempStart = Color3.FromArray(POST.TEMP_START)
  const tempMid = Color3.FromArray(POST.TEMP_MID)
  const tempEnd = Color3.FromArray(POST.TEMP_END)

  // Original lighting values for night mode interpolation
  const daySunIntensity = LIGHTING.SUN.INTENSITY
  const dayFillIntensity = LIGHTING.FILL.INTENSITY
  const dayFogColor = Color3.FromArray(FOG.COLOR)
  const nightFogColor = Color3.FromArray(NIGHT_MODE.FOG_COLOR)
  const nightAmbientColor = Color3.FromArray(NIGHT_MODE.AMBIENT_COLOR)

  /**
   * updateCinematic — called every frame from render loop
   */
  function updateCinematic(progress, dt) {
    const rawSpeed = getSpeedNorm()
    // Smooth the speed for gentle transitions
    smoothSpeed += (rawSpeed - smoothSpeed) * Math.min(dt * 4, 1)
    const s = Math.min(smoothSpeed, 1) // clamped speedNorm

    /* ═══════════════════════════════════════
       V — Night Mode Transition
       Environment transitions to night in final scroll segment
       ═══════════════════════════════════════ */
    const nightTarget = progress > NIGHT_MODE.TRANSITION_START
      ? Math.min((progress - NIGHT_MODE.TRANSITION_START) / (NIGHT_MODE.TRANSITION_END - NIGHT_MODE.TRANSITION_START), 1)
      : 0
    nightBlend += (nightTarget - nightBlend) * Math.min(dt * 2, 1)

    /* ═══════════════════════════════════════
       J — Road Specular Response
       ═══════════════════════════════════════ */
    if (asphaltMat) {
      const targetRoughness = ROAD.ROUGHNESS - (ROAD.ROUGHNESS - ROAD.ROUGHNESS_SPEED_MIN) * s
      asphaltMat.roughness += (targetRoughness - asphaltMat.roughness) * Math.min(dt * 3, 1)
      // Night: road becomes slightly more reflective (wet look)
      if (nightBlend > 0) {
        asphaltMat.roughness = asphaltMat.roughness * (1 - nightBlend * 0.3)
        asphaltMat.metallic = nightBlend * 0.15
      }
    }

    /* ═══════════════════════════════════════
       L — Dynamic Rim Light + Reflections
       ═══════════════════════════════════════ */
    if (fill) {
      const rimIntensity = CINEMATIC.RIM_LIGHT_BASE + (CINEMATIC.RIM_LIGHT_MAX - CINEMATIC.RIM_LIGHT_BASE) * s
      fill.specular = new Color3(rimIntensity, rimIntensity * 0.9, rimIntensity * 0.8)
      // Night mode: reduce fill, boost specular for moonlight feel
      fill.intensity = dayFillIntensity * (1 - nightBlend * 0.7)
    }

    /* ═══════════════════════════════════════
       M — Parallax Horizon Drift
       ═══════════════════════════════════════ */
    if (skyDome) {
      const parallaxOffset = progress * (1 - CINEMATIC.SKY_PARALLAX_FACTOR) * 100
      skyDome.position.z = parallaxOffset
    }

    /* ═══════════════════════════════════════
       N — Color Temperature Shift (morning → afternoon → sunset)
       ═══════════════════════════════════════ */
    if (ipc && sun) {
      let tintColor
      if (progress < 0.5) {
        const t = progress / 0.5
        tintColor = Color3.Lerp(tempStart, tempMid, t)
      } else {
        const t = (progress - 0.5) / 0.5
        tintColor = Color3.Lerp(tempMid, tempEnd, t)
      }

      const baseSunColor = Color3.FromArray(LIGHTING.SUN.COLOR)
      let finalSunColor = new Color3(
        baseSunColor.r * tintColor.r,
        baseSunColor.g * tintColor.g,
        baseSunColor.b * tintColor.b,
      )

      // Night: shift sun to deep blue moonlight
      if (nightBlend > 0) {
        const moonColor = new Color3(0.3, 0.35, 0.55)
        finalSunColor = Color3.Lerp(finalSunColor, moonColor, nightBlend)
      }

      sun.diffuse = finalSunColor

      // Night: dim sun significantly
      sun.intensity = daySunIntensity * (1 - nightBlend * 0.85)
    }

    /* ═══════════════════════════════════════
       P — Motion-Based Shadow Softening
       ═══════════════════════════════════════ */
    if (shadowGen) {
      const targetKernel = baseBlurKernel + CINEMATIC.SHADOW_BLUR_SPEED_BOOST * s
      shadowGen.blurKernel += (targetKernel - shadowGen.blurKernel) * Math.min(dt * 2, 1)
    }

    /* ═══════════════════════════════════════
       T — Adaptive Exposure
       ═══════════════════════════════════════ */
    if (ipc) {
      const exposureCurve = POST.EXPOSURE_MIN +
        (POST.EXPOSURE_MAX - POST.EXPOSURE_MIN) * (1 - Math.pow(2 * progress - 1, 2) * 0.4)

      // Night: slightly lower exposure for mood
      const nightExposureShift = nightBlend * -0.25
      smoothExposure += (exposureCurve + nightExposureShift - smoothExposure) * Math.min(dt * 1.0, 1)
      ipc.exposure = Math.max(smoothExposure, POST.EXPOSURE_MIN - nightBlend * 0.3)
    }

    /* ═══════════════════════════════════════
       U — Time-of-Day Sun Progression
       ═══════════════════════════════════════ */
    if (sun) {
      const sunY = CINEMATIC.SUN_START_Y + (CINEMATIC.SUN_END_Y - CINEMATIC.SUN_START_Y) * progress
      // Night: sun drops below horizon
      const nightSunY = sunY + nightBlend * -0.3
      sun.direction = new Vector3(
        LIGHTING.SUN.DIRECTION[0],
        nightSunY,
        LIGHTING.SUN.DIRECTION[2],
      )
    }

    /* ═══════════════════════════════════════
       Sky color temperature + Night transition
       ═══════════════════════════════════════ */
    if (skyMat) {
      const warmShift = progress * 0.06
      let horizonColor = new Color3(
        SKY.HORIZON_COLOR[0] + warmShift,
        SKY.HORIZON_COLOR[1] - warmShift * 0.2,
        SKY.HORIZON_COLOR[2] - warmShift * 0.3,
      )

      // Night sky transition
      if (nightBlend > 0) {
        const nightHorizon = Color3.FromArray(NIGHT_MODE.SKY_HORIZON)
        const nightTop = Color3.FromArray(NIGHT_MODE.SKY_TOP)
        horizonColor = Color3.Lerp(horizonColor, nightHorizon, nightBlend)
        skyMat.setColor3('uTopColor', Color3.Lerp(
          Color3.FromArray(SKY.TOP_COLOR),
          nightTop,
          nightBlend,
        ))
      }
      skyMat.setColor3('uHorizonColor', horizonColor)
      skyMat.setFloat('uDayPhase', progress)
    }

    /* ═══════════════════════════════════════
       Dynamic Fog — Night fog color transition
       ═══════════════════════════════════════ */
    if (scene) {
      const baseDensity = FOG.DENSITY
      // Sunset factor peaks at progress ~0.5
      const sunsetFactor = Math.pow(Math.sin(progress * Math.PI), 2)
      // Density DECREASES at sunset — clear golden air lets terrain show through
      scene.fogDensity = baseDensity - (sunsetFactor * 0.0001) + nightBlend * 0.0004

      // Sunset fog color — warm golden but NOT opaque orange
      if (sunsetFactor > 0.01 && nightBlend < 0.5) {
        const sf = sunsetFactor
        scene.fogColor = new Color3(
          dayFogColor.r + sf * 0.12,
          dayFogColor.g - sf * 0.08,
          dayFogColor.b - sf * 0.10,
        )
        scene.clearColor.r = scene.fogColor.r
        scene.clearColor.g = scene.fogColor.g
        scene.clearColor.b = scene.fogColor.b
      }

      // Transition fog color for night
      if (nightBlend > 0) {
        const fogColor = Color3.Lerp(dayFogColor, nightFogColor, nightBlend)
        scene.fogColor = fogColor
        scene.clearColor.r = fogColor.r
        scene.clearColor.g = fogColor.g
        scene.clearColor.b = fogColor.b
      }

      // Night ambient
      if (nightBlend > 0) {
        scene.ambientColor = Color3.Lerp(
          new Color3(0.15, 0.18, 0.22),
          nightAmbientColor,
          nightBlend,
        )
      }
    }

    /* ═══════════════════════════════════════
       HEAT SHIMMER INTENSITY — Active during daytime road sections
       ═══════════════════════════════════════ */
    // Heat is strongest in daytime (progress 0.10–0.45), fades at sunset/night
    const heatDaytime = progress > 0.10 && progress < 0.45
      ? Math.pow(Math.sin((progress - 0.10) / 0.35 * Math.PI), 0.5)
      : 0
    const turboIntensity = window._turboIntensity || 0
    window._heatIntensity = heatDaytime * s * 0.8 + turboIntensity * 0.4

    /* ═══════════════════════════════════════
       TURBO BURST — Cinematic overrides during turbo window
       ═══════════════════════════════════════ */
    if (turboIntensity > 0.05) {
      // Exposure flash — brief bright surge at turbo peak
      if (ipc) {
        ipc.exposure += turboIntensity * 0.3
      }
      // Fog clears dramatically during turbo (speed blows it away)
      if (scene) {
        scene.fogDensity -= turboIntensity * 0.0003
      }
    }

    /* ═══════════════════════════════════════
       X — Atmosphere system update
       ═══════════════════════════════════════ */
    if (updateAtmosphere) {
      updateAtmosphere(s, dt, progress)
    }

    /* ═══════════════════════════════════════
       Y — Post-processing dynamics (DOF, chromatic)
       ═══════════════════════════════════════ */
    if (updatePostProcessing) {
      const focusDist = getFocusDistance ? getFocusDistance() : 12
      updatePostProcessing(s, dt, focusDist)
    }
  }

  return { updateCinematic }
}
