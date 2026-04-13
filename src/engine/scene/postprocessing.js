/**
 * POST-PROCESSING — Advanced Cinematic Pipeline
 * ═══════════════════════════════════════════════════════
 * Uses Babylon.js DefaultRenderingPipeline for:
 * - ACES filmic tone mapping + exposure + contrast
 * - Depth of field (DOF) — dynamic focus on truck
 * - Chromatic aberration — speed-driven edge color shift
 * - Film grain
 * - FXAA anti-aliasing
 * - Bloom (glow)
 * - Sharpen
 * - Vignette
 *
 * Plus standalone GlowLayer for emissive surface bloom.
 *
 * All dynamic parameters (DOF focus, chromatic intensity)
 * are updated per-frame by the cinematic director.
 */
import {
  GlowLayer,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Color4,
  DepthOfFieldEffectBlurLevel,
  ColorCurves,
  PostProcess,
  Effect,
} from '@babylonjs/core'
import { POST, ADVANCED_POST, IS_MOBILE } from '../config'

// [PERF-FIX] Shared runtime tier mutator for post stack without reloading assets.
export function applyPostTier(tier, pipeline, glow, engineAntialias = true) {
  const isHigh = tier === 'high'
  const isBalanced = tier === 'balanced'
  const isLow = tier === 'low'

  if (pipeline) {
    pipeline.bloomEnabled = !isLow
    pipeline.bloomWeight = isHigh ? 0.3 : isBalanced ? 0.15 : 0.0
    pipeline.depthOfFieldEnabled = isHigh && ADVANCED_POST.DOF_ENABLED
    pipeline.chromaticAberrationEnabled = isHigh && ADVANCED_POST.CHROMATIC_ENABLED
    pipeline.sharpenEnabled = isHigh && ADVANCED_POST.SHARPEN_ENABLED
    pipeline.fxaaEnabled = isHigh
      ? (ADVANCED_POST.FXAA_ENABLED && !engineAntialias)
      : (ADVANCED_POST.FXAA_ENABLED && (isBalanced || isLow))
  }

  if (glow) {
    glow.intensity = isHigh ? 0.3 : isBalanced ? 0.15 : 0.1
  }
}

/**
 * setupPostProcessing
 * @param {BABYLON.Scene} scene
 * @param {BABYLON.Camera} camera
 * @returns {{ glow, pipeline, updatePostProcessing }}
 */
// [PERF-FIX] Tiered post-processing to cap GPU cost on balanced/low devices.
export function setupPostProcessing(scene, camera, deviceTier = 'balanced', engineAntialias = true) {
  let currentTier = deviceTier

  /* ── DefaultRenderingPipeline (master pipeline) ── */
  const pipeline = new DefaultRenderingPipeline(
    'defaultPipeline',
    true, // HDR
    scene,
    camera ? [camera] : scene.cameras,
  )

  /* ── Image Processing (tone mapping, exposure, contrast) ── */
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.toneMappingEnabled = POST.TONE_MAPPING_ENABLED
  pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
  pipeline.imageProcessing.exposure = POST.EXPOSURE
  pipeline.imageProcessing.contrast = POST.CONTRAST

  /* ── Vignette ── */
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = POST.VIGNETTE_WEIGHT
  pipeline.imageProcessing.vignetteStretch = POST.VIGNETTE_STRETCH
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 1)
  pipeline.imageProcessing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY

  /* ── Color Curves — warm shadows, cool highlights ── */
  pipeline.imageProcessing.colorCurvesEnabled = true
  const curves = new ColorCurves()
  curves.shadowsHue = 30        // warm amber shadows
  curves.shadowsDensity = 25
  curves.shadowsSaturation = 40
  curves.highlightsHue = 210    // cool blue highlights
  curves.highlightsDensity = 15
  curves.highlightsSaturation = 20
  pipeline.imageProcessing.colorCurves = curves

  /* ── Bloom ── */
  pipeline.bloomEnabled = true
  pipeline.bloomThreshold = 0.92
  pipeline.bloomWeight = 0.15
  pipeline.bloomKernel = POST.GLOW_BLUR_SIZE
  pipeline.bloomScale = 0.5

  /* ── Depth of Field ── */
  pipeline.depthOfFieldEnabled = ADVANCED_POST.DOF_ENABLED
  pipeline.depthOfFieldBlurLevel = IS_MOBILE
    ? DepthOfFieldEffectBlurLevel.Low
    : DepthOfFieldEffectBlurLevel.Medium
  pipeline.depthOfField.focalLength = ADVANCED_POST.DOF_FOCAL_LENGTH
  pipeline.depthOfField.fStop = ADVANCED_POST.DOF_FSTOP
  pipeline.depthOfField.focusDistance = ADVANCED_POST.DOF_FOCUS_DISTANCE
  pipeline.depthOfField.lensSize = ADVANCED_POST.DOF_MAX_BLUR

  /* ── Chromatic Aberration ── */
  pipeline.chromaticAberrationEnabled = ADVANCED_POST.CHROMATIC_ENABLED
  pipeline.chromaticAberration.aberrationAmount = ADVANCED_POST.CHROMATIC_BASE
  pipeline.chromaticAberration.radialIntensity = 0.8
  pipeline.chromaticAberration.direction.x = 0.5
  pipeline.chromaticAberration.direction.y = 0.5

  /* ── Film Grain ── */
  pipeline.grainEnabled = true
  pipeline.grain.intensity = POST.GRAIN_INTENSITY
  pipeline.grain.animated = true

  /* ── FXAA ── */
  pipeline.fxaaEnabled = ADVANCED_POST.FXAA_ENABLED

  /* ── Sharpen ── */
  pipeline.sharpenEnabled = ADVANCED_POST.SHARPEN_ENABLED
  if (pipeline.sharpen) {
    pipeline.sharpen.edgeAmount = ADVANCED_POST.SHARPEN_AMOUNT
  }

  /* ── GlowLayer (separate from pipeline bloom — for emissive surfaces) ── */
  const glow = new GlowLayer('glowLayer', scene, {
    mainTextureFixedSize: IS_MOBILE ? 256 : 512,
    blurKernelSize: POST.GLOW_BLUR_SIZE,
  })
  glow.intensity = 0.15

  applyPostTier(currentTier, pipeline, glow, engineAntialias)

  /* ═══════════════════════════════════════
     HEAT SHIMMER POST-PROCESS — Road area distortion
     ═══════════════════════════════════════ */
  // Register custom shader
  Effect.ShadersStore['heatShimmerFragmentShader'] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;
    uniform float intensity;
    void main(void) {
      vec2 uv = vUV;
      // Only distort lower 40% of screen (road area)
      float roadMask = smoothstep(0.42, 0.30, uv.y);
      if (roadMask > 0.001 && intensity > 0.001) {
        float wave = sin(uv.x * 40.0 + time * 3.0) * cos(uv.y * 30.0 + time * 2.5);
        float wave2 = sin(uv.x * 25.0 - time * 2.0) * cos(uv.y * 20.0 + time * 1.8);
        vec2 distortion = vec2(wave + wave2 * 0.5, wave * 0.7 + wave2) * intensity * roadMask * 0.003;
        uv += distortion;
      }
      gl_FragColor = texture2D(textureSampler, uv);
    }
  `

  let heatShimmer = null
  let heatTime = 0
  if (!IS_MOBILE && currentTier !== 'low') {
    heatShimmer = new PostProcess(
      'heatShimmer',
      'heatShimmer',
      ['time', 'intensity'],
      null,
      1.0,
      camera,
      0, // NEAREST sampling
      scene.getEngine(),
    )
    heatShimmer.onApply = (effect) => {
      effect.setFloat('time', heatTime)
      effect.setFloat('intensity', window._heatIntensity || 0)
    }
  }
  // Expose for external control
  window._heatIntensity = 0

  /* ── Dynamic update function (called by cinematicDirector) ── */
  let smoothChromatic = 0
  let smoothDofFocus = ADVANCED_POST.DOF_FOCUS_DISTANCE

  /**
   * updatePostProcessing — per-frame dynamic post-processing
   * @param {number} speedNorm — 0→1
   * @param {number} dt — seconds
   * @param {number} focusDistance — camera-to-truck distance in world units
   */
  function updatePostProcessing(speedNorm, dt, focusDistance) {
    const isHigh = currentTier === 'high'
    const isBalanced = currentTier === 'balanced'
    const isLow = currentTier === 'low'
    const sn = Math.min(speedNorm, 1)
    const turboIntensity = window._turboIntensity || 0

    /* ── Chromatic aberration scales with speed + TURBO SURGE ── */
    if (isHigh && ADVANCED_POST.CHROMATIC_ENABLED && pipeline.chromaticAberration) {
      const turboChromatic = turboIntensity * ADVANCED_POST.CHROMATIC_SPEED_MAX * 1.5
      const targetChromatic = ADVANCED_POST.CHROMATIC_BASE + sn * ADVANCED_POST.CHROMATIC_SPEED_MAX + turboChromatic
      smoothChromatic += (targetChromatic - smoothChromatic) * Math.min(dt * 3, 1)
      pipeline.chromaticAberration.aberrationAmount = smoothChromatic
    }

    /* ── DOF focus distance tracks camera-truck distance ── */
    if (isHigh && ADVANCED_POST.DOF_ENABLED && pipeline.depthOfField) {
      const targetFocus = focusDistance * 1000
      smoothDofFocus += (targetFocus - smoothDofFocus) * Math.min(dt * 2, 1)
      pipeline.depthOfField.focusDistance = smoothDofFocus
      // Turbo: tighter DOF for intense focus on truck
      pipeline.depthOfField.fStop = ADVANCED_POST.DOF_FSTOP + sn * 2 - turboIntensity * 1.5
    }

    /* ── Bloom intensity boost at speed + TURBO BLOOM SURGE ── */
    pipeline.bloomWeight = isHigh ? 0.3 : isBalanced ? 0.15 : 0.0

    /* ── Grain intensity subtle at speed ── */
    if (pipeline.grain) {
      const baseGrain = isLow ? POST.GRAIN_INTENSITY * 0.35 : POST.GRAIN_INTENSITY
      pipeline.grain.intensity = baseGrain + sn * 0.02 + turboIntensity * 0.03
    }

    /* ── Vignette tightens during turbo ── */
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.vignetteWeight = POST.VIGNETTE_WEIGHT * (1 + turboIntensity * 0.6)
    }

    /* ── Heat shimmer time advance ── */
    heatTime += dt
  }

  function setTier(nextTier) {
    currentTier = nextTier
    applyPostTier(currentTier, pipeline, glow, engineAntialias)
  }

  return { glow, pipeline, updatePostProcessing, setTier }
}

