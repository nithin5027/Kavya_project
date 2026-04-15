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
  const baseBlurKernel = LIGHTING.SHADOW.BLUR_KERNEL

  // Smooth state
  let smoothSpeed = 0
  let smoothExposure = POST.EXPOSURE
  let nightBlend = 0

  // ── Pre-allocated reusable objects — zero GC allocations per frame ──
  const tempStart = Color3.FromArray(POST.TEMP_START)
  const tempMid   = Color3.FromArray(POST.TEMP_MID)
  const tempEnd   = Color3.FromArray(POST.TEMP_END)
  const _tint     = new Color3()
  const _sunColor = new Color3()
  const _moonColor = new Color3(0.3, 0.35, 0.55)
  const _horizonColor = new Color3()
  const _fogColor  = new Color3()
  const _fillSpec  = new Color3()
  const _sunDir    = new Vector3(LIGHTING.SUN.DIRECTION[0], LIGHTING.SUN.DIRECTION[1], LIGHTING.SUN.DIRECTION[2])
  const _nightHorizon   = Color3.FromArray(NIGHT_MODE.SKY_HORIZON)
  const _nightTop       = Color3.FromArray(NIGHT_MODE.SKY_TOP)
  const _skyTopBase     = Color3.FromArray(SKY.TOP_COLOR)
  const _skyTopOut      = new Color3()
  const _dayAmbient     = new Color3(0.15, 0.18, 0.22)
  const daySunIntensity  = LIGHTING.SUN.INTENSITY
  const dayFillIntensity = LIGHTING.FILL.INTENSITY
  const dayFogColor      = Color3.FromArray(FOG.COLOR)
  const nightFogColor    = Color3.FromArray(NIGHT_MODE.FOG_COLOR)
  const nightAmbientColor= Color3.FromArray(NIGHT_MODE.AMBIENT_COLOR)
  const baseSunColor     = Color3.FromArray(LIGHTING.SUN.COLOR)

  // Shadow update throttle — only update blur kernel every 6 frames
  let shadowFrame = 0

  function updateCinematic(progress, dt) {
    const rawSpeed = getSpeedNorm()
    smoothSpeed += (rawSpeed - smoothSpeed) * Math.min(dt * 4, 1)
    const s = Math.min(smoothSpeed, 1)

    /* V — Night Mode */
    const nightTarget = progress > NIGHT_MODE.TRANSITION_START
      ? Math.min((progress - NIGHT_MODE.TRANSITION_START) / (NIGHT_MODE.TRANSITION_END - NIGHT_MODE.TRANSITION_START), 1)
      : 0
    nightBlend += (nightTarget - nightBlend) * Math.min(dt * 2, 1)

    /* J — Road Specular Response */
    if (asphaltMat) {
      const targetR = ROAD.ROUGHNESS - (ROAD.ROUGHNESS - ROAD.ROUGHNESS_SPEED_MIN) * s
      asphaltMat.roughness += (targetR - asphaltMat.roughness) * Math.min(dt * 3, 1)
      if (nightBlend > 0) {
        asphaltMat.roughness *= (1 - nightBlend * 0.3)
        asphaltMat.metallic = nightBlend * 0.15
      }
    }

    /* L — Dynamic Rim Light (reuse _fillSpec) */
    if (fill) {
      const ri = CINEMATIC.RIM_LIGHT_BASE + (CINEMATIC.RIM_LIGHT_MAX - CINEMATIC.RIM_LIGHT_BASE) * s
      _fillSpec.set(ri, ri * 0.9, ri * 0.8)
      fill.specular = _fillSpec
      fill.intensity = dayFillIntensity * (1 - nightBlend * 0.7)
    }

    /* M — Sky Parallax */
    if (skyDome) {
      skyDome.position.z = progress * (1 - CINEMATIC.SKY_PARALLAX_FACTOR) * 100
    }

    /* N — Color Temperature + Sun Color (zero allocations) */
    if (ipc && sun) {
      if (progress < 0.5) {
        Color3.LerpToRef(tempStart, tempMid, progress / 0.5, _tint)
      } else {
        Color3.LerpToRef(tempMid, tempEnd, (progress - 0.5) / 0.5, _tint)
      }
      _sunColor.set(baseSunColor.r * _tint.r, baseSunColor.g * _tint.g, baseSunColor.b * _tint.b)
      if (nightBlend > 0) {
        Color3.LerpToRef(_sunColor, _moonColor, nightBlend, _sunColor)
      }
      sun.diffuse.copyFrom(_sunColor)
      sun.intensity = daySunIntensity * (1 - nightBlend * 0.85)
    }

    /* P — Shadow blur throttled to every 6 frames */
    shadowFrame++
    if (shadowGen && shadowFrame >= 6) {
      shadowFrame = 0
      const targetK = baseBlurKernel + CINEMATIC.SHADOW_BLUR_SPEED_BOOST * s
      shadowGen.blurKernel = shadowGen.blurKernel + (targetK - shadowGen.blurKernel) * 0.15
    }

    /* T — Adaptive Exposure */
    if (ipc) {
      const expCurve = POST.EXPOSURE_MIN + (POST.EXPOSURE_MAX - POST.EXPOSURE_MIN) * (1 - Math.pow(2 * progress - 1, 2) * 0.4)
      smoothExposure += (expCurve - nightBlend * 0.25 - smoothExposure) * Math.min(dt, 1)
      ipc.exposure = Math.max(smoothExposure, POST.EXPOSURE_MIN - nightBlend * 0.3)
    }

    /* U — Sun Direction (mutate in place, no new Vector3) */
    if (sun) {
      const sunY = CINEMATIC.SUN_START_Y + (CINEMATIC.SUN_END_Y - CINEMATIC.SUN_START_Y) * progress + nightBlend * -0.3
      _sunDir.set(LIGHTING.SUN.DIRECTION[0], sunY, LIGHTING.SUN.DIRECTION[2])
      sun.direction.copyFrom(_sunDir)
    }

    /* Sky colours (reuse _horizonColor, _skyTopOut) */
    if (skyMat) {
      const ws = progress * 0.06
      _horizonColor.set(SKY.HORIZON_COLOR[0] + ws, SKY.HORIZON_COLOR[1] - ws * 0.2, SKY.HORIZON_COLOR[2] - ws * 0.3)
      if (nightBlend > 0) {
        Color3.LerpToRef(_horizonColor, _nightHorizon, nightBlend, _horizonColor)
        Color3.LerpToRef(_skyTopBase, _nightTop, nightBlend, _skyTopOut)
        skyMat.setColor3('uTopColor', _skyTopOut)
      }
      skyMat.setColor3('uHorizonColor', _horizonColor)
      skyMat.setFloat('uDayPhase', progress)
    }

    /* Fog (reuse _fogColor) */
    if (scene) {
      const sunsetFactor = Math.pow(Math.sin(progress * Math.PI), 2)
      scene.fogDensity = FOG.DENSITY - sunsetFactor * 0.0001 + nightBlend * 0.0004

      if (nightBlend > 0.01) {
        Color3.LerpToRef(dayFogColor, nightFogColor, nightBlend, _fogColor)
        scene.fogColor.copyFrom(_fogColor)
        scene.clearColor.r = _fogColor.r; scene.clearColor.g = _fogColor.g; scene.clearColor.b = _fogColor.b
        Color3.LerpToRef(_dayAmbient, nightAmbientColor, nightBlend, scene.ambientColor)
      } else if (sunsetFactor > 0.01) {
        const sf = sunsetFactor
        _fogColor.set(dayFogColor.r + sf * 0.12, dayFogColor.g - sf * 0.08, dayFogColor.b - sf * 0.10)
        scene.fogColor.copyFrom(_fogColor)
        scene.clearColor.r = _fogColor.r; scene.clearColor.g = _fogColor.g; scene.clearColor.b = _fogColor.b
      }
    }

    /* Heat shimmer */
    const turboIntensity = window._turboIntensity || 0
    const heatDaytime = (progress > 0.10 && progress < 0.45)
      ? Math.pow(Math.sin((progress - 0.10) / 0.35 * Math.PI), 0.5) : 0
    window._heatIntensity = heatDaytime * s * 0.8 + turboIntensity * 0.4

    /* Turbo overrides */
    if (turboIntensity > 0.05 && ipc) {
      ipc.exposure += turboIntensity * 0.3
      if (scene) scene.fogDensity -= turboIntensity * 0.0003
    }

    /* Atmosphere + Post */
    if (updateAtmosphere) updateAtmosphere(s, dt, progress)
    if (updatePostProcessing) {
      const focusDist = getFocusDistance ? getFocusDistance() : 12
      updatePostProcessing(s, dt, focusDist)
    }
  }

  return { updateCinematic }
}
