/**
 * CREATE SCENE — Master Scene Assembler (Cinematic Architecture)
 * ═══════════════════════════════════════════════════════════════════
 * Five synchronized animation layers driven by speedNormalized:
 *
 *   Layer 1: Vehicle Physics (truck.js)
 *   Layer 2: World Motion (worldMotion.js)
 *   Layer 3: Camera Cinematography (scrollCamera.js)
 *   Layer 4: Atmospheric Effects (atmosphere.js)
 *   Layer 5: UI Motion System (driven via CSS custom properties)
 *
 * All layers read from a single normalized variable: speedNormalized (0→1)
 *
 * Returns:
 *  - engine, scene, updateFrame, dispose
 */
import {
  Scene,
  Color3,
  Color4,
  CubeTexture,
  SceneLoader,
  StandardMaterial,
  PBRMaterial,
  Effect,
  Mesh,
  SceneOptimizer,
  SceneOptimizerOptions,
} from '@babylonjs/core'
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader'
import '@babylonjs/loaders/glTF'
import { FOG, IS_MOBILE } from '../config'
import { setupLighting, configureTruckShadowCasters } from './lighting'
import { setupSky } from './sky'
import { setupRoad } from './road'
import { setupTerrain } from './terrain'
import { setupMountains } from './mountains'
import { setupTruck } from './truck'
import { setupScrollCamera } from './scrollCamera'
import { setupPostProcessing, applyPostTier } from './postprocessing'
import { setupCinematicDirector } from './cinematicDirector'
import { setupWorldMotion } from './worldMotion'
import { setupAtmosphere, createBillboards } from './atmosphere'
import { AudioEngine } from '../audio/audioEngine'
import { getAssetPaths } from '../config/assetManifest'
import { checkAssetAvailability } from '../utils/checkAssets'
import { startMonitoring, stopMonitoring } from '../utils/performanceMonitor'
import { startTierController } from '../utils/tierController'
import { applyShadowTier } from './lighting'

/**
 * loadEnvironment — Load kavya-env.glb (Blender-built environment)
 * Disposes road/ground meshes (JS versions handle scrolling),
 * extracts mountains for parallax, keeps decorations.
 * Has 8s timeout to prevent hanging.
 */
function splitAssetPath(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const idx = normalized.lastIndexOf('/')
  return {
    rootUrl: normalized.slice(0, idx + 1),
    fileName: normalized.slice(idx + 1),
  }
}

async function loadEnvironment(scene, envPath = '/assets/kavya-env.glb') {
  const { rootUrl, fileName } = splitAssetPath(envPath)
  const loadPromise = SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene)
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Environment GLB load timeout')), 30000)
  )
  
  const result = await Promise.race([loadPromise, timeoutPromise])
  const envMountains = []
  const decorMeshes = []

  const DISPOSE_KEYWORDS = [
    'barrier', 'culvert', 'guardrail', 'fence',
    'building', 'house', 'structure', 'bridge', 'overpass',
    'railing', 'wall', 'curb',
    'column', 'pillar', 'monolith', 'obelisk', 'tower',
    'chimney', 'mast', 'antenna', 'silo', 'tank',
    'billboard_post', 'signpost'
  ]

  const ALWAYS_KEEP_KEYWORDS = [
    'mountain', 'Mountain', 'hill', 'terrain',
    'line', 'Line',
    'tree', 'Tree', 'bush', 'Bush', 'rock', 'Rock',
    'road', 'Road', 'ground', 'Ground', 'grass', 'Grass'
  ]

  for (const mesh of result.meshes) {
    const name = mesh.name || ''

    // Skip root node
    if (name === '__root__') continue

    const lower = name.toLowerCase()
    const shouldKeep = ALWAYS_KEEP_KEYWORDS.some((k) => name.includes(k))
    if (shouldKeep) {
      mesh.isVisible = true
    } else {
      const shouldDispose = DISPOSE_KEYWORDS.some((k) => lower.includes(k))
      if (shouldDispose) {
        mesh.dispose()
        continue
      }
      mesh.isVisible = true
    }

    // Mountains — keep for parallax wiring
    if (name.startsWith('Env_Mtn_') || name.toLowerCase().includes('mountain') || name.toLowerCase().includes('hill')) {
      envMountains.push(mesh)
      mesh.isPickable = false
      mesh.receiveShadows = false
      mesh.isVisible = true
      mesh.position.y *= 0.8
      if (mesh.material instanceof PBRMaterial) {
        mesh.material.albedoColor = new Color3(0.28, 0.32, 0.38)
        mesh.material.emissiveColor = Color3.Black()
        mesh.material.metallic = 0
        mesh.material.roughness = Math.max(mesh.material.roughness || 0.85, 0.85)
      } else if (mesh.material) {
        mesh.material.diffuseColor = new Color3(0.28, 0.32, 0.38)
        mesh.material.specularColor = Color3.Black()
        mesh.material.emissiveColor = Color3.Black()
      }
      continue
    }

    // Decoration meshes (guardrails, poles, trees, rocks, culverts, etc.)
    mesh.isPickable = false
    mesh.receiveShadows = true
    mesh.isVisible = true

    const lowerName = name.toLowerCase()

    if (lowerName.includes('tree')) {
      const shades = [
        new Color3(0.22, 0.35, 0.18),
        new Color3(0.18, 0.30, 0.14),
        new Color3(0.25, 0.38, 0.20),
      ]
      mesh.scaling.scaleInPlace(0.7)

      if (!(mesh.material instanceof StandardMaterial) && !(mesh.material instanceof PBRMaterial)) {
        mesh.material = new StandardMaterial(`${name}_treeMat`, scene)
      }

      if (lowerName.includes('trunk') || lowerName.includes('stem')) {
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.albedoColor = new Color3(0.28, 0.18, 0.08)
          mesh.material.emissiveColor = Color3.Black()
          mesh.material.metallic = 0
          mesh.material.roughness = 0.95
        } else {
          mesh.material.diffuseColor = new Color3(0.28, 0.18, 0.08)
          mesh.material.specularColor = Color3.Black()
          mesh.material.emissiveColor = Color3.Black()
        }
      } else {
        const shade = shades[decorMeshes.length % 3]
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.albedoColor = shade
          mesh.material.emissiveColor = Color3.Black()
          mesh.material.metallic = 0
          mesh.material.roughness = 0.95
        } else {
          mesh.material.diffuseColor = shade
          mesh.material.specularColor = Color3.Black()
          mesh.material.emissiveColor = Color3.Black()
        }
      }
    }

    decorMeshes.push(mesh)
  }

  // Safety net: dispose giant pillar-shaped artifacts that slip keyword filtering.
  for (const mesh of result.meshes) {
    if (!mesh || mesh.isDisposed()) continue

    try {
      const bounds = mesh.getBoundingInfo()
      if (!bounds) continue

      const size = bounds.boundingBox.maximumWorld.subtract(bounds.boundingBox.minimumWorld)
      const lowerName = (mesh.name || '').toLowerCase()

      // If mesh is tall with narrow footprint, treat as pillar artifact.
      // Keep only genuinely thin roadside poles; remove large monolith-like columns.
      const maxFootprint = Math.max(size.x, size.z)
      const minFootprint = Math.min(size.x, size.z)
      const aspectRatio = size.y / Math.max(maxFootprint, 0.001)
      const isGiantPillar = size.y > 8 && maxFootprint < 12 && minFootprint < 6 && aspectRatio > 2.5
      const isMountain = size.x > 30 || size.z > 30
      const isLikelyUtilityPole = size.y < 12 && maxFootprint < 1.0

      if (isGiantPillar && !isMountain && !isLikelyUtilityPole) {
        console.log('[ENV] Disposing giant pillar mesh:', mesh.name,
          'size:', size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1))
        mesh.dispose()
      }
    } catch (e) {
      // getBoundingInfo may fail on some nodes; ignore safely.
    }
  }

  return { envMountains, decorMeshes }
}

function mergeStaticMeshesByMaterial(scene, meshes) {
  const groups = new Map()
  meshes.forEach((mesh) => {
    if (!mesh || mesh.isDisposed?.() || !mesh.material) return
    if (mesh.name?.toLowerCase().includes('mountain') || mesh.name?.startsWith('Env_Mtn_')) return
    const key = mesh.material.name || `mat_${mesh.material.uniqueId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(mesh)
  })

  const merged = []
  groups.forEach((group, key) => {
    if (group.length <= 10) return
    const mergeable = group.filter((m) => m && !m.isDisposed?.())
    if (mergeable.length <= 1) return
    const mergedMesh = Mesh.MergeMeshes(mergeable, true, true, undefined, false, true)
    if (mergedMesh) {
      mergedMesh.name = `MergedStatic_${key}`
      mergedMesh.isPickable = false
      mergedMesh.receiveShadows = true
      merged.push(mergedMesh)
    }
  })

  return merged
}

/**
 * createScene
 * @param {Engine} engine
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{ engine, scene, updateFrame, dispose }>}
 */
// [PERF-FIX] Tier-aware quality, static mesh merging/freezing, and adaptive optimizer.
export async function createScene(engine, canvas, deviceTier = 'balanced') {
  window.__kavyaTruckReady = false

  const requestedAssets = getAssetPaths(deviceTier)
  const availability = await checkAssetAvailability(requestedAssets)
  const resolvedAssetPaths = {
    truck: availability.truck ? requestedAssets.truck : requestedAssets.fallbackTruck,
    env: availability.env ? requestedAssets.env : requestedAssets.fallbackEnv,
    truckLod1: availability.truckLod1 ? requestedAssets.truckLod1 : '/assets/tr-final-lod1.glb',
    truckLod2: availability.truckLod2 ? requestedAssets.truckLod2 : '/assets/tr-final-lod2.glb',
  }
  console.log('[Kavya Assets] Tier:', deviceTier, 'Resolved:', resolvedAssetPaths)

  engine.enableOfflineSupport = false
  engine.doNotHandleContextLost = false
  Effect.ShadersStore = Effect.ShadersStore || {}
  engine.setHardwareScalingLevel(IS_MOBILE ? 1.5 : 1.0)

  /* ── Scene ── */
  const scene = new Scene(engine)
  scene.clearColor = new Color4(
    FOG.COLOR[0], FOG.COLOR[1], FOG.COLOR[2], 1,
  )
  scene.ambientColor = new Color3(0.15, 0.18, 0.22)

  /* ── Environment texture for PBR reflections ── */
  // Disabled remote .env loading to avoid WebGL texParameter warnings/timeouts on some setups.
  // Keep a balanced intensity so materials stay readable without the remote reflection map.
  let envTexPromise = Promise.resolve()
  scene.environmentTexture = null
  scene.environmentIntensity = 0.75

  /* ── Fog (EXP2) ── */
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = FOG.DENSITY
  scene.fogColor = new Color3(FOG.COLOR[0], FOG.COLOR[1], FOG.COLOR[2])

  /* ── Lighting + Shadows ── */
  const { sun, fill, shadowGen, groundBounce } = setupLighting(scene, deviceTier)

  /* ── Sky dome ── */
  const { skyDome, skyMat } = setupSky(scene)

  /* ── Terrain ── */
  const { ground } = setupTerrain(scene)

  /* ── Road ── */
  const { road, solidLines, dashedLines, leftShoulder, rightShoulder, updateDashes } = setupRoad(scene, shadowGen)

  /* ── Load Environment GLB + Truck in parallel ── */
  /* Old sequential worst-case: 3s + 8s + 10s = 21s                        */
  /* New parallel worst-case: max(8s, 10s) = 10s (env texture runs in bg)  */
  let mountains = []
  const [envGlbResult, truckResult] = await Promise.allSettled([
    loadEnvironment(scene, resolvedAssetPaths.env),
    setupTruck(scene, shadowGen, resolvedAssetPaths),
  ])

  // Await env texture hook (no-op when remote env is disabled)
  await envTexPromise

  // Process env GLB result
  if (envGlbResult.status === 'fulfilled') {
    const { envMountains, decorMeshes } = envGlbResult.value
    mergeStaticMeshesByMaterial(scene, decorMeshes)
    if (envMountains.length > 0) {
      // Use GLB mountains — dispose JS fallback mountains
      mountains = envMountains
    } else {
      // GLB had no mountains — use JS procedural mountains
      const jsMtns = setupMountains(scene)
      mountains = jsMtns.mountains
    }
    mountains.forEach((m) => {
      m.isVisible = true
      m.position.y *= 0.8
      if (m.material instanceof PBRMaterial) {
        m.material.albedoColor = new Color3(0.28, 0.32, 0.38)
        m.material.emissiveColor = Color3.Black()
        m.material.metallic = 0
      } else if (m.material) {
        m.material.diffuseColor = new Color3(0.28, 0.32, 0.38)
        m.material.specularColor = Color3.Black()
        m.material.emissiveColor = Color3.Black()
      }
    })
    console.log('[Kavya Engine] Environment GLB loaded:', decorMeshes.length, 'decoration meshes,', envMountains.length, 'mountain meshes')
  } else {
    // kavya-env.glb not found — fall back to JS procedural mountains
    console.warn('[Kavya Engine] kavya-env.glb not found, using JS fallback mountains:', envGlbResult.reason?.message)
    const jsMtns = setupMountains(scene)
    mountains = jsMtns.mountains
    mountains.forEach((m) => {
      m.isVisible = true
      m.position.y *= 0.8
      if (m.material) {
        m.material.diffuseColor = new Color3(0.28, 0.32, 0.38)
        m.material.specularColor = Color3.Black()
        m.material.emissiveColor = Color3.Black()
      }
    })
  }

  // Process truck result (setupTruck has its own fallback, so this rarely rejects)
  let truck, updateTruck
  if (truckResult.status === 'fulfilled') {
    ;({ truck, updateTruck } = truckResult.value)
    configureTruckShadowCasters(shadowGen, truck)
  } else {
    console.error('[Kavya Engine] Truck GLB failed unexpectedly:', truckResult.reason?.message)
    truck = null
    updateTruck = () => {}
  }

  // Force all materials to compile their shaders before first render.
  await new Promise((resolve) => {
    scene.executeWhenReady(async () => {
      const compileJobs = []
      scene.meshes.forEach((mesh) => {
        if (mesh.material?.forceCompilationAsync) {
          compileJobs.push(mesh.material.forceCompilationAsync(mesh).catch(() => {}))
        }
      })
      await Promise.allSettled(compileJobs)
      resolve()
    })
  })

  window.__kavyaTruckReady = true
  window.dispatchEvent(new CustomEvent('kavya:truck-ready'))

  /* ── Highway Billboards (returns meshes for worldMotion scrolling) ── */
  const billboardMeshes = createBillboards(scene)

  /* ── World Motion Engine ── */
  const { updateWorld, getWorldSpeed, getSpeedNorm, getWorldDistance } = setupWorldMotion({
    dashedLines,
    ground,
    mountains,
    billboards: billboardMeshes,
    updateDashes,
  })

  /* ── Camera Follow Rig (multi-rig system) ── */
  const { camera, updateCamera, getFocusDistance } = setupScrollCamera(scene, canvas, truck)

  /* ── Post-Processing (advanced pipeline: DOF, chromatic, bloom, grain) ── */
  const { glow, pipeline, updatePostProcessing } = setupPostProcessing(scene, camera, deviceTier, true)

  /* ── Atmosphere (fog layers, dust motes, sun rays, speed lines) ── */
  const { updateAtmosphere, disposeAtmosphere } = setupAtmosphere(scene, camera, sun, truck)

  /* ── Cinematic Director (master orchestrator) ── */
  const asphaltMat = road?.material || null
  const { updateCinematic } = setupCinematicDirector({
    scene,
    asphaltMat,
    sun,
    fill,
    shadowGen,
    skyMat,
    skyDome,
    getSpeedNorm,
    updatePostProcessing,
    getFocusDistance,
    updateAtmosphere,
  })

  /* ── Ambient audio (procedural) ── */
  const audio = new AudioEngine()
  const initAudio = () => { audio.init(); document.removeEventListener('click', initAudio) }
  document.addEventListener('click', initAudio)

  scene.meshes.forEach((mesh) => {
    const name = (mesh.name || '').toLowerCase()
    const isTruck = name.includes('truck') || name.includes('material') || name.includes('kavya')
    const isDynamic =
      isTruck ||
      name.includes('road') ||
      name.includes('dash') ||
      name.includes('terrain') ||
      name.includes('mountain') ||
      name.includes('speedline') ||
      name.includes('fogplane')
    if (!isDynamic && mesh.freezeWorldMatrix) {
      mesh.freezeWorldMatrix()
    }
  })

  scene.freezeMaterials()
  if (truck?.getChildMeshes) {
    const truckMaterials = new Set()
    truck.getChildMeshes().forEach((mesh) => {
      if (mesh?.material) {
        truckMaterials.add(mesh.material)
      }
    })
    truckMaterials.forEach((material) => {
      if (material.unfreeze) material.unfreeze()
      material.alpha = 1
      if (material.getClassName?.() === 'PBRMaterial') {
        material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE
      }
    })
  }
  if (road?.material?.unfreeze) road.material.unfreeze()

  // Keep active mesh evaluation dynamic.
  // Freezing active meshes can hide the truck in the color pass while its shadow still updates.
  // This scene has continuous camera and object motion, so the optimization is unsafe here.

  if (deviceTier !== 'high') {
    const options = SceneOptimizerOptions.ModerateDegradationAllowed()
    options.targetFrameRate = 55
    SceneOptimizer.OptimizeAsync(scene, options).catch(() => {})
  }

  const tierController = startTierController({
    initialTier: deviceTier,
    engine,
    pipeline,
    glow,
    shadowGenerator: shadowGen,
    applyPostTier,
    applyShadowTier,
  })

  startMonitoring(scene, engine, (metrics) => {
    window.dispatchEvent(new CustomEvent('kavya:perf-metrics', { detail: metrics }))
    tierController.handleMetrics(metrics)
  })

  /* ── Sky time tracking ── */
  let skyTime = 0

  /* ── Master frame update — single entry point ── */
  function updateFrame(progress, dt) {
    // 1. World motion (moves road, terrain, mountains backward)
    updateWorld(progress, dt)

    // 2. Get current world speed for all other systems
    const speedNorm = getSpeedNorm()
    const worldSpeed = getWorldSpeed()

    // 3. Truck animations (body sway, bounce, exhaust — all from worldSpeed)
    updateTruck(speedNorm, dt, worldSpeed, progress)

    // 4. Camera follow rig (spring-follow the truck, multi-rig transitions)
    updateCamera(progress, dt, speedNorm)

    // 5. Cinematic effects (exposure, shadows, temperature, atmosphere, post-processing)
    updateCinematic(progress, dt)

    // 6. Sky time uniform for stars twinkling
    skyTime += dt
    if (skyMat) {
      skyMat.setFloat('uTime', skyTime)
    }

    // 7. Push speedNorm to CSS for UI motion system (Layer 5)
    document.documentElement.style.setProperty('--speed-norm', speedNorm.toFixed(3))
    document.documentElement.style.setProperty('--progress', progress.toFixed(4))

    // 8. Ambient audio
    audio.update(speedNorm, progress)
  }

  /* ── Dispose helper ── */
  function dispose() {
    document.removeEventListener('click', initAudio)
    stopMonitoring()
    tierController.stop()
    audio.dispose()
    disposeAtmosphere()
    if (pipeline) pipeline.dispose()
    glow.dispose()
    scene.dispose()
  }

  return {
    engine,
    scene,
    camera,
    updateFrame,
    dispose,
  }
}
