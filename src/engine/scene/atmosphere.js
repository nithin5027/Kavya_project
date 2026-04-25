/**
 * ATMOSPHERE — Volumetric Fog, Dust Motes, Sun Rays, Speed Lines
 * ═══════════════════════════════════════════════════════════════════
 * Creates cinematic environmental depth through multiple layered effects:
 *
 *   1. Floating dust particles — ambient motes catching sun light
 *   2. Volumetric fog planes — layered depth haze at varying distances
 *   3. Volumetric sun rays — god rays from sun position
 *   4. Speed lines — motion streaks at high velocity
 *   5. Ground dust trail — kicked up by truck at speed
 *
 * All effects respond to speedNormalized for coherent motion feel.
 */
import {
  ParticleSystem,
  Color3,
  Color4,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  DynamicTexture,
} from '@babylonjs/core'
import { ATMOSPHERE, WORLD, FOG } from '../config'

/**
 * setupAtmosphere
 * @param {object} scene   — BABYLON.Scene
 * @param {object} camera  — BABYLON.Camera
 * @param {object} sun     — DirectionalLight
 * @param {object} truck   — truck root mesh
 * @returns {{ updateAtmosphere: Function, disposeAtmosphere: Function }}
 */
export function setupAtmosphere(scene, camera, sun, truck) {
  const disposables = []

  // Soft circular particle texture shared by all particle systems
  const ptex = new DynamicTexture('atmosphereParticleTex', { width: 64, height: 64 }, scene)
  const pctx = ptex.getContext()
  const grad = pctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0,   'rgba(255,255,255,0.9)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1,   'rgba(255,255,255,0.0)')
  pctx.fillStyle = grad
  pctx.fillRect(0, 0, 64, 64)
  ptex.update()
  ptex.hasAlpha = true

  /* ═══════════════════════════════════════
     1. FLOATING DUST MOTES
     Ambient particles catching sunlight — environmental depth
     ═══════════════════════════════════════ */
  const dustMotes = new ParticleSystem('dustMotes', ATMOSPHERE.DUST_COUNT, scene)
  dustMotes.particleTexture = ptex
  dustMotes.createBoxEmitter(
    new Vector3(-1, -1, -1),
    new Vector3(1, 1, 1),
    new Vector3(-ATMOSPHERE.DUST_SPREAD, 0, -ATMOSPHERE.DUST_SPREAD),
    new Vector3(ATMOSPHERE.DUST_SPREAD, ATMOSPHERE.DUST_SPREAD * 0.6, ATMOSPHERE.DUST_SPREAD),
  )
  dustMotes.emitter = truck || Vector3.Zero()
  dustMotes.color1 = new Color4(1.0, 0.95, 0.85, ATMOSPHERE.DUST_OPACITY)
  dustMotes.color2 = new Color4(0.9, 0.88, 0.78, ATMOSPHERE.DUST_OPACITY * 0.6)
  dustMotes.colorDead = new Color4(0.8, 0.8, 0.8, 0)
  dustMotes.minSize = ATMOSPHERE.DUST_SIZE[0]
  dustMotes.maxSize = ATMOSPHERE.DUST_SIZE[1]
  dustMotes.minLifeTime = 3.0
  dustMotes.maxLifeTime = 8.0
  dustMotes.emitRate = ATMOSPHERE.DUST_COUNT / 4
  dustMotes.minEmitPower = 0.05
  dustMotes.maxEmitPower = ATMOSPHERE.DUST_SPEED
  dustMotes.gravity = new Vector3(0, -0.02, 0)
  dustMotes.blendMode = ParticleSystem.BLENDMODE_ADD
  dustMotes.updateSpeed = 0.008
  dustMotes.start()
  disposables.push(dustMotes)

  /* ═══════════════════════════════════════
     2. VOLUMETRIC FOG PLANES
     Subtle depth haze planes at far distances
     ═══════════════════════════════════════ */
  const fogPlanes = []
  for (let i = 0; i < ATMOSPHERE.FOG_LAYERS; i++) {
    const distance = 60 + (i + 1) * ATMOSPHERE.FOG_LAYER_SPACING
    const opacity = (ATMOSPHERE.FOG_NEAR_OPACITY +
      (ATMOSPHERE.FOG_FAR_OPACITY - ATMOSPHERE.FOG_NEAR_OPACITY) * (i / Math.max(ATMOSPHERE.FOG_LAYERS - 1, 1))) * 0.4

    const plane = MeshBuilder.CreatePlane(`fogPlane_${i}`, {
      width: 120,
      height: 25,
    }, scene)
    plane.position.z = distance
    plane.position.y = 10
    plane.billboardMode = Mesh.BILLBOARDMODE_Y
    plane.isPickable = false

    const mat = new StandardMaterial(`fogPlaneMat_${i}`, scene)
    mat.diffuseColor = new Color3(FOG.COLOR[0], FOG.COLOR[1], FOG.COLOR[2])
    mat.emissiveColor = new Color3(FOG.COLOR[0] * 0.85, FOG.COLOR[1] * 0.85, FOG.COLOR[2] * 0.85)
    mat.alpha = opacity
    mat.backFaceCulling = false
    mat.disableLighting = true
    mat.hasAlpha = true
    plane.material = mat
    plane.renderingGroupId = 0

    fogPlanes.push({ mesh: plane, material: mat, baseDistance: distance, baseOpacity: opacity })
    disposables.push(plane)
  }

  /* ═══════════════════════════════════════
     3. SUN GLOW MESH (visual marker for god ray direction)
     Note: VolumetricLightScattering disabled — conflicts with DefaultRenderingPipeline.
     Sun glow mesh provides visual sun presence via bloom instead.
     ═══════════════════════════════════════ */
  let sunMesh = null
  if (ATMOSPHERE.SUN_RAY_ENABLED && sun) {
    sunMesh = MeshBuilder.CreateSphere('sunGlowSource', { diameter: 4, segments: 8 }, scene)
    const sunDir = sun.direction
    sunMesh.position = sunDir.negate().normalize().scale(250)
    sunMesh.isPickable = false
    sunMesh.renderingGroupId = 0

    const sunMatGlow = new StandardMaterial('sunGlowMat', scene)
    sunMatGlow.diffuseColor = new Color3(1, 0.97, 0.9)
    sunMatGlow.emissiveColor = new Color3(0.5, 0.48, 0.4)
    sunMatGlow.disableLighting = true
    sunMatGlow.alpha = 0.4
    sunMesh.material = sunMatGlow
    disposables.push(sunMesh)
  }

  /* ═══════════════════════════════════════
     4. SPEED LINES — Motion streaks at high velocity
     Elongated transparent cylinders that streak past camera
     ═══════════════════════════════════════ */
  const speedLines = []
  for (let i = 0; i < ATMOSPHERE.STREAK_COUNT; i++) {
    const line = MeshBuilder.CreateCylinder(`speedLine_${i}`, {
      diameter: 0.015,
      height: ATMOSPHERE.STREAK_LENGTH,
      tessellation: 4,
    }, scene)

    // Random position in a ring around the truck
    const angle = Math.random() * Math.PI * 2
    const radius = 4 + Math.random() * 12
    const height = 0.5 + Math.random() * 5

    line.position.set(
      Math.sin(angle) * radius,
      height,
      Math.cos(angle) * radius,
    )
    line.rotation.x = Math.PI / 2 // align with Z axis
    line.parent = truck

    const lineMat = new StandardMaterial(`speedLineMat_${i}`, scene)
    lineMat.diffuseColor = new Color3(1, 1, 1)
    lineMat.emissiveColor = new Color3(0.8, 0.85, 0.9)
    lineMat.alpha = 0
    lineMat.disableLighting = true
    lineMat.backFaceCulling = false
    line.material = lineMat
    line.isPickable = false
    line.renderingGroupId = 2

    speedLines.push({
      mesh: line,
      material: lineMat,
      baseAngle: angle,
      baseRadius: radius,
      baseHeight: height,
      phase: Math.random() * Math.PI * 2,
    })
    disposables.push(line)
  }

  /* ═══════════════════════════════════════
     5. GROUND DUST TRAIL
     Heavy dust cloud kicked up behind truck at high speed
     ═══════════════════════════════════════ */
  const groundDust = new ParticleSystem('groundDust', 300, scene)
  groundDust.particleTexture = ptex
  groundDust.createConeEmitter(2.5, Math.PI / 4)
  groundDust.emitter = truck || Vector3.Zero()
  groundDust.color1 = new Color4(0.65, 0.58, 0.45, 0.4)
  groundDust.color2 = new Color4(0.70, 0.62, 0.50, 0.25)
  groundDust.colorDead = new Color4(0.6, 0.55, 0.48, 0)
  groundDust.minSize = WORLD.GROUND_DUST_SIZE[0]
  groundDust.maxSize = WORLD.GROUND_DUST_SIZE[1]
  groundDust.minLifeTime = 0.8
  groundDust.maxLifeTime = 2.5
  groundDust.emitRate = 0
  groundDust.minEmitPower = 1.0
  groundDust.maxEmitPower = 3.0
  groundDust.gravity = new Vector3(0, -0.5, -2.0)
  groundDust.blendMode = ParticleSystem.BLENDMODE_STANDARD
  groundDust.updateSpeed = 0.01
  groundDust.start()
  disposables.push(groundDust)

  /* ═══════════════════════════════════════
     ANIMATION STATE
     ═══════════════════════════════════════ */
  let elapsed = 0

  /**
   * updateAtmosphere — Called every frame
   * @param {number} speedNorm — 0→1
   * @param {number} dt — delta seconds
   * @param {number} progress — scroll 0→1
   */
  function updateAtmosphere(speedNorm, dt, progress) {
    elapsed += dt
    const sn = Math.min(speedNorm, 1)

    /* ── Dust motes respond to speed ── */
    dustMotes.minEmitPower = 0.05 + sn * 0.3
    dustMotes.maxEmitPower = ATMOSPHERE.DUST_SPEED + sn * 0.8
    // Dust scatters more at speed
    dustMotes.emitRate = (ATMOSPHERE.DUST_COUNT / 4) * (0.7 + sn * 0.5)

    /* ── Fog planes sway & opacity ── */
    fogPlanes.forEach((fp, i) => {
      fp.mesh.position.x = Math.sin(elapsed * 0.3 + i * 1.5) * 5
      // Fog thickens slightly at speed (road spray effect)
      fp.material.alpha = fp.baseOpacity * (1 + sn * 0.15)
    })

    /* ── Update sun glow mesh position to track sun direction ── */
    if (sunMesh && sun) {
      sunMesh.position = sun.direction.negate().normalize().scale(250)
    }

    /* ── Speed lines appear at high speed ── */
    speedLines.forEach((sl) => {
      const threshold = ATMOSPHERE.STREAK_SPEED_THRESHOLD
      if (sn > threshold) {
        const intensity = (sn - threshold) / (1 - threshold)
        sl.material.alpha = ATMOSPHERE.STREAK_OPACITY * intensity
        // Animate Z cycling to simulate forward motion
        const speed = 2 + intensity * 6
        sl.mesh.position.z += speed * dt
        if (sl.mesh.position.z > 15) sl.mesh.position.z -= 30
        // Scale length with speed
        sl.mesh.scaling.y = 1 + intensity * 2
      } else {
        sl.material.alpha = 0
      }
    })

    /* ── Ground dust trail at high speed ── */
    const dustThreshold = WORLD.GROUND_DUST_THRESHOLD
    if (sn > dustThreshold) {
      const dustIntensity = (sn - dustThreshold) / (1 - dustThreshold)
      groundDust.emitRate = WORLD.GROUND_DUST_RATE * dustIntensity
      groundDust.minSize = WORLD.GROUND_DUST_SIZE[0] + dustIntensity * 0.3
      groundDust.maxSize = WORLD.GROUND_DUST_SIZE[1] + dustIntensity * 0.5
      groundDust.minEmitPower = 1.0 + dustIntensity * 2.0
      groundDust.maxEmitPower = 3.0 + dustIntensity * 4.0
    } else {
      groundDust.emitRate = 0
    }

  }

  function disposeAtmosphere() {
    disposables.forEach(d => {
      try { d.dispose() } catch (_) { /* already disposed */ }
    })
  }

  return { updateAtmosphere, disposeAtmosphere }
}

/**
 * createBillboards — disabled (returns empty array safely).
 */
export function createBillboards(scene) {
  console.log('[Billboards] Disabled')
  return []
}
