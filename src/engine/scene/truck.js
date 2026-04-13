/**
 * TRUCK — GLB Loader with Cinematic Animations (Anchored)
 * ═══════════════════════════════════════════════════════════
 * The truck is the HERO ANCHOR — stays at world origin.
 * World moves around it (road, terrain, mountains scroll backward).
 *
 * Animations driven by worldSpeed (not scroll position):
 * - Body sway & roll
 * - Steering micro-correction
 * - Chassis flex
 * - Suspension bounce
 * - Tire rotation
 * - Exhaust particle system
 * - Tire dust at speed
 * - Dynamic headlights + volumetric cones
 *
 * Graceful fallback to box truck if GLB fails.
 */
// [PERF-FIX] Add LOD support and restore frustum culling by removing forced-active flags.
import {
  SceneLoader,
  PBRMaterial,
  Color3,
  Color4,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  SpotLight,
  DirectionalLight,
  ParticleSystem,
  Texture,
  GlowLayer,
  TransformNode,
  DynamicTexture,
} from '@babylonjs/core'
import '@babylonjs/loaders/glTF'
import { TRUCK } from '../config'

/**
 * createWorldSpaceBranding — Creates branding planes PARENTED to the truck.
 * Uses EXACT local-space coordinates from GLB inspection:
 *   Local X: -0.1793 to 0.1794 (width 0.3588)
 *   Local Y: -0.5542 to 0.5212 (height 1.0754)
 *   Local Z: -0.4404 to 0.0 (length 0.4404, front=0, back=-0.44)
 * Container box is the back ~60% of Z, middle ~40% of Y.
 */
function createWorldSpaceBranding(truckRoot, scene) {
  // ── EXACT container wall coordinates in LOCAL space ──
  // (measured from GLB accessor bounds)
  // Container side wall sits at the truck's X extents
  const wallX = 0.1800       // just outside the mesh wall (0.1794 + tiny offset)

  // Container occupies Z from about -0.40 (back) to about -0.10 (cab junction)
  const containerBackZ  = -0.38
  const containerFrontZ = -0.12
  const containerCenterZ = (containerBackZ + containerFrontZ) / 2  // -0.25

  // Container wall Y range: bottom of container ~-0.15, top ~0.30
  // (below -0.15 is chassis/wheels, above 0.30 is container roof)
  const containerBottomY = -0.12
  const containerTopY    =  0.28
  const containerCenterY = (containerBottomY + containerTopY) / 2  // 0.08

  // Sticker dimensions with small inset margin
  const stickerW = (containerFrontZ - containerBackZ) * 0.88  // ~0.229
  const stickerH = (containerTopY - containerBottomY) * 0.75  // ~0.30

  console.log('[Branding] Hardcoded local coords:', {
    wallX: wallX.toFixed(4),
    z: [containerBackZ, containerFrontZ],
    y: [containerBottomY, containerTopY],
    stickerSize: [stickerW.toFixed(4), stickerH.toFixed(4)],
    center: [containerCenterZ.toFixed(4), containerCenterY.toFixed(4)],
  })

  // ── TEXTURE — Higher resolution DynamicTexture ──
  const TW = 2048, TH = 640
  const tex = new DynamicTexture('kavyaBrandTex', { width: TW, height: TH }, scene, true)
  const c = tex.getContext()

  function drawBranding(ctx) {
    ctx.fillStyle = '#F8F7F5'
    ctx.fillRect(0, 0, TW, TH)

    // Subtle corrugation
    ctx.strokeStyle = 'rgba(180,178,175,0.15)'
    ctx.lineWidth = 1
    for (let x = 20; x < TW; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TH); ctx.stroke()
    }

    // Orange stripes top and bottom
    const stripeH = Math.round(TH * 0.10)
    ctx.fillStyle = '#F47B20'
    ctx.fillRect(0, 0, TW, stripeH)
    ctx.fillRect(0, TH - stripeH, TW, stripeH)
    ctx.fillStyle = '#D4600E'
    ctx.fillRect(0, stripeH - 2, TW, 2)
    ctx.fillRect(0, TH - stripeH, TW, 2)

    // Main text — centered, no logo overlap
    ctx.shadowColor = 'rgba(0,0,0,0.12)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    ctx.fillStyle = '#0D1117'
    ctx.font = 'bold 130px "Arial Black", Impact, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('KAVYA TRANSPORTS', TW / 2, TH * 0.42)

    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    ctx.fillStyle = '#F47B20'
    ctx.font = 'bold italic 45px Georgia, "Times New Roman", serif'
    ctx.fillText('Life on Wheels  \u00B7  Since 2004', TW / 2, TH * 0.65)

    // Contact info in stripes
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 28px Arial, Helvetica, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('+91 90472 44000', TW - 30, stripeH * 0.55)
    ctx.textAlign = 'left'
    ctx.fillText('kavyatransports.com', 30, stripeH * 0.55)
    ctx.fillText('EST. 2004', 30, TH - stripeH * 0.40)
    ctx.textAlign = 'right'
    ctx.fillText('Pan-India Logistics', TW - 30, TH - stripeH * 0.40)
  }

  drawBranding(c)
  tex.update()

  // Try to overlay logo.png — placed left of tagline, NOT overlapping main text
  const logoImg = new Image()
  logoImg.crossOrigin = 'anonymous'
  logoImg.onload = () => {
    const stripeH = Math.round(TH * 0.10)
    const logoH = TH * 0.18
    const logoW = logoH * (logoImg.width / logoImg.height)
    // Position: left side, between tagline and bottom stripe
    const logoX = 30
    const logoY = TH * 0.56
    c.drawImage(logoImg, logoX, logoY, logoW, logoH)
    tex.update()
  }
  logoImg.src = '/assets/logo.png'

  // ── Shared material — same texture on both sides ──
  const brandMat = new StandardMaterial('kavyaBrandMat', scene)
  brandMat.diffuseTexture  = tex
  brandMat.emissiveTexture = tex
  brandMat.emissiveColor   = new Color3(0.8, 0.8, 0.8)
  brandMat.specularColor   = new Color3(0.08, 0.08, 0.08)
  brandMat.backFaceCulling = true

  // ── LEFT STICKER — front face points outward left ──
  const stickerL = MeshBuilder.CreatePlane(
    'brandL',
    { width: stickerW, height: stickerH, sideOrientation: Mesh.FRONTSIDE },
    scene
  )
  stickerL.material = brandMat
  stickerL.isPickable = false
  stickerL.renderingGroupId = 2
  stickerL.parent = truckRoot
  stickerL.position.x = -wallX
  stickerL.position.y = containerCenterY
  stickerL.position.z = containerCenterZ
  stickerL.rotation.y = Math.PI / 2

  // ── RIGHT STICKER — front face points outward right ──
  const stickerR = MeshBuilder.CreatePlane(
    'brandR',
    { width: stickerW, height: stickerH, sideOrientation: Mesh.FRONTSIDE },
    scene
  )
  stickerR.material = brandMat
  stickerR.isPickable = false
  stickerR.renderingGroupId = 2
  stickerR.parent = truckRoot
  stickerR.position.x = wallX
  stickerR.position.y = containerCenterY
  stickerR.position.z = containerCenterZ
  stickerR.rotation.y = -Math.PI / 2

  console.log('[Branding] Created. L.x:', (-wallX).toFixed(4),
    'R.x:', wallX.toFixed(4), 'y:', containerCenterY.toFixed(4),
    'z:', containerCenterZ.toFixed(4), 'size:', stickerW.toFixed(4), '×', stickerH.toFixed(4))

  return { stickerL, stickerR }
}

/**
 * Create a simple box truck placeholder (used when GLB fails to load).
 */
function createFallbackTruck(scene) {
  const parent = new TransformNode('truckFallback', scene)

  // Body — KAVYA ORANGE
  const body = MeshBuilder.CreateBox('truckBody', {
    width: 2.8, height: 2.2, depth: 7.5,
  }, scene)
  body.position.y = 1.3
  body.parent = parent

  const bodyMat = new StandardMaterial('truckBodyMat', scene)
  bodyMat.diffuseColor = new Color3(0.9, 0.4, 0.05)
  bodyMat.specularColor = new Color3(0.3, 0.15, 0.02)
  bodyMat.specularPower = 32
  body.material = bodyMat

  // Cabin
  const cab = MeshBuilder.CreateBox('truckCab', {
    width: 2.8, height: 2.4, depth: 2.5,
  }, scene)
  cab.position.z = 5.0
  cab.position.y = 1.4
  cab.parent = parent

  const cabMat = new StandardMaterial('truckCabMat', scene)
  cabMat.diffuseColor = new Color3(0.85, 0.35, 0.03)
  cabMat.specularColor = new Color3(0.2, 0.1, 0.02)
  cab.material = cabMat

  // White text panel on rear
  const panel = MeshBuilder.CreateBox('textPanel', {
    width: 2.6, height: 1.0, depth: 0.05,
  }, scene)
  const panelMat = new StandardMaterial('panelMat', scene)
  panelMat.diffuseColor = new Color3(0.98, 0.98, 0.98)
  panel.material = panelMat
  panel.position.z = -3.7
  panel.position.y = 1.5
  panel.parent = parent

  // Wheels
  const wheelPositions = [
    [-1.3, 0.3, 2.0], [1.3, 0.3, 2.0],
    [-1.3, 0.3, -1.5], [1.3, 0.3, -1.5],
  ]
  wheelPositions.forEach(([x, y, z], i) => {
    const wheel = MeshBuilder.CreateCylinder(`wheel_${i}`, {
      diameter: 0.6, height: 0.3,
    }, scene)
    wheel.rotation.z = Math.PI / 2
    wheel.position = new Vector3(x, y, z)
    wheel.parent = parent

    const wMat = new PBRMaterial(`wheelMat_${i}`, scene)
    wMat.albedoColor = new Color3(0.05, 0.05, 0.05)
    wMat.roughness = 0.9
    wMat.metallic = 0
    wheel.material = wMat
  })

  parent.position.y = 0.2
  return parent
}

/**
 * setupTruck — Load GLB, position, scale, cast shadows.
 * Returns a Promise resolving to { truck: Mesh }.
 */
function forceOpaqueTruckMaterial(material) {
  if (!material) return

  material.alpha = 1
  material.backFaceCulling = false
  if (material.unfreeze) material.unfreeze()

  // Remove alpha-driven transparency paths that can make the truck vanish in color pass.
  if ('opacityTexture' in material) material.opacityTexture = null
  if ('useAlphaFromDiffuseTexture' in material) material.useAlphaFromDiffuseTexture = false
  if ('useAlphaFromAlbedoTexture' in material) material.useAlphaFromAlbedoTexture = false
  if ('hasAlpha' in material) material.hasAlpha = false

  if (material.albedoTexture) material.albedoTexture.hasAlpha = false
  if (material.diffuseTexture) material.diffuseTexture.hasAlpha = false

  if (material instanceof PBRMaterial) {
    material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE
  }
}

function fixBannerTextureOrientation(material, correctedTextures) {
  if (!material) return

  const matName = (material.name || '').toLowerCase()
  const tex = material.albedoTexture || material.diffuseTexture
  if (!tex) return

  const texName = (tex.name || tex.url || '').toLowerCase()
  const isBannerTexture =
    matName.includes('sidemat') ||
    matName.includes('backmat') ||
    matName.includes('banner') ||
    texName.includes('sidebanner') ||
    texName.includes('backside') ||
    texName.includes('banner')

  if (!isBannerTexture) return

  if (correctedTextures.has(tex.uniqueId)) return
  correctedTextures.add(tex.uniqueId)

  // Babylon can mirror truck-side text after handedness conversion; force readable orientation.
  tex.uScale = -Math.abs(tex.uScale || 1)
  tex.uOffset = 1
}

export async function setupTruck(scene, shadowGen, assetPaths = {}) {
  let truck
  const truckPath = assetPaths.truck || '/assets/tr-final.glb'
  const correctedTextures = new Set()

  // Reset readiness before each load attempt for this scene instance
  window.__kavyaTruckReady = false

  try {
    // Load with 10s timeout to prevent hanging
    const split = truckPath.lastIndexOf('/')
    const rootUrl = truckPath.slice(0, split + 1)
    const sceneFile = truckPath.slice(split + 1)
    const loadPromise = SceneLoader.ImportMeshAsync(
      '',
      rootUrl,
      sceneFile,
      scene,
    ).catch((err) => {
      console.error('[Kavya Truck] Load failed:', err)
      throw err
    })
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Truck GLB load timeout')), 30000)
    )
    
    const result = await Promise.race([loadPromise, timeoutPromise])

    truck = result.meshes[0]

    // Force visibility and disable pickability across all imported meshes
    result.meshes.forEach((mesh) => {
      mesh.isVisible = true
      mesh.visibility = 1
      mesh.isPickable = false
      mesh.alwaysSelectAsActiveMesh = true
      if (mesh.material) {
        forceOpaqueTruckMaterial(mesh.material)
      }
      mesh.doNotSyncBoundingInfo = false
      if (mesh.refreshBoundingInfo) mesh.refreshBoundingInfo()
    })

    // Enhance all child meshes — GUARANTEED VISIBILITY
    result.meshes.forEach((mesh) => {
      if (mesh.material) {
        forceOpaqueTruckMaterial(mesh.material)
        fixBannerTextureOrientation(mesh.material, correctedTextures)
        if (mesh.material instanceof PBRMaterial) {
          mesh.material.environmentIntensity = 0.8
          mesh.material.directIntensity = 1.8
          mesh.material.specularIntensity = 0.6
          mesh.material.roughness = Math.min(mesh.material.roughness, 0.6)
          mesh.material.metallic = Math.max(mesh.material.metallic, 0.3)
          if (!mesh.material.emissiveColor || mesh.material.emissiveColor.equals(Color3.Black())) {
            mesh.material.emissiveColor = new Color3(0.12, 0.12, 0.14)
          }
        }
      }

      mesh.receiveShadows = true
      mesh.renderingGroupId = 2
    })

    // Store loaded meshes for lighting assignment after lights are created
    truck._loadedMeshes = result.meshes.filter(m => m.getTotalVertices && m.getTotalVertices() > 0)

    // Diagnostic: log all mesh info
    result.meshes.forEach((mesh, i) => {
      mesh.computeWorldMatrix(true)
      const b = mesh.getBoundingInfo().boundingBox
      const vol = b.extendSizeWorld.x * b.extendSizeWorld.y * b.extendSizeWorld.z
      console.log(
        `[MESH ${i}]`,
        `name="${mesh.name}"`,
        `verts=${mesh.getTotalVertices()}`,
        `vol=${vol.toFixed(3)}`,
        `mat="${mesh.material?.name || 'none'}"`,
        `pos=(${mesh.absolutePosition.x.toFixed(1)},${mesh.absolutePosition.y.toFixed(1)},${mesh.absolutePosition.z.toFixed(1)})`
      )
    })

  } catch (err) {
    console.error('[Kavya Truck] CRITICAL: Using fallback box - GLB failed')
    console.warn('[Kavya Engine] Truck GLB failed to load, using fallback:', err.message)
    truck = createFallbackTruck(scene)

    // Add fallback meshes to rendering group
    truck.getChildMeshes().forEach((child) => {
      child.renderingGroupId = 2
      child.doNotSyncBoundingInfo = false
    })
  }

  // Keep the full truck mesh active at all distances.
  // Previous LOD assets were over-simplified and caused geometry popping/invisibility.
  if (truck.getChildMeshes) {
    truck.getChildMeshes().forEach((mesh) => {
      mesh.alwaysSelectAsActiveMesh = true
      mesh.isVisible = true
      mesh.visibility = 1
      if (mesh.setEnabled) mesh.setEnabled(true)
    })
  }

  // Apply transform
  truck.position = new Vector3(TRUCK.POSITION[0], TRUCK.POSITION[1], TRUCK.POSITION[2])
  truck.scaling = new Vector3(TRUCK.SCALE, TRUCK.SCALE, TRUCK.SCALE)
  truck.renderingGroupId = 2  // Render above road (1) and terrain (0)
  if (TRUCK.ROTATION_Y !== 0) {
    truck.rotation.y = TRUCK.ROTATION_Y
  }

  // Compute world matrix after scaling for correct bounds
  truck.computeWorldMatrix(true)
  truck.getChildMeshes().forEach(m => m.computeWorldMatrix(true))
  const bounds = truck.getHierarchyBoundingVectors(true)

  console.log('[Kavya Truck] Bounding min:', bounds.min.toString(), 'max:', bounds.max.toString())
  console.log('[Kavya Truck] Size:', {
    x: (bounds.max.x - bounds.min.x).toFixed(2),
    y: (bounds.max.y - bounds.min.y).toFixed(2),
    z: (bounds.max.z - bounds.min.z).toFixed(2),
  })

  // World-space branding stickers — DISABLED
  // window._brandingStickers = createWorldSpaceBranding(truck, scene)

  /* ═══════════════════════════════════════
     DEDICATED TRUCK SPOTLIGHT — Always illuminates the truck
     ═══════════════════════════════════════ */
  const truckSpot = new SpotLight(
    'truckSpot',
    new Vector3(0, 15, 5),
    new Vector3(0, -1, -0.2),
    Math.PI / 4,
    2.5,
    scene,
  )
  truckSpot.diffuse = new Color3(1.0, 0.95, 0.85)
  truckSpot.intensity = 2.0
  truckSpot.range = 25
  truckSpot.angle = Math.PI / 8
  truckSpot.exponent = 24
  truckSpot.shadowEnabled = false

  const truckOnlyMeshes = scene.meshes.filter((m) => {
    const n = (m.name || '').toLowerCase()
    return n.includes('truck') || n.includes('material') || n.includes('kavya') || m.name === '__root__'
  })
  if (truckOnlyMeshes.length > 0) {
    truckSpot.includedOnlyMeshes = truckOnlyMeshes
  }

  /* ═══════════════════════════════════════
     RIM LIGHT — Cool blue edge light makes truck pop
     ═══════════════════════════════════════ */
  const rimLight = new DirectionalLight(
    'rimLight',
    new Vector3(-1, -0.3, -1),
    scene,
  )
  rimLight.diffuse = new Color3(0.4, 0.6, 1.0)
  rimLight.intensity = 1.6
  rimLight.shadowEnabled = false

  // Restrict lights to truck meshes — use _loadedMeshes populated in GLB success path
  if (truck._loadedMeshes && truck._loadedMeshes.length > 0) {
    rimLight.includedOnlyMeshes = truck._loadedMeshes
    truckSpot.includedOnlyMeshes = truck._loadedMeshes
  } else {
    // Fallback: try getChildMeshes, or leave unrestricted so truck is still lit
    const fallbackMeshes = truck.getChildMeshes ? truck.getChildMeshes().filter(m => m.getTotalVertices && m.getTotalVertices() > 0) : []
    if (fallbackMeshes.length > 0) {
      rimLight.includedOnlyMeshes = fallbackMeshes
      truckSpot.includedOnlyMeshes = fallbackMeshes
    }
    // If no meshes found, leave includedOnlyMeshes unset — lights illuminate everything
  }

  /* ═══════════════════════════════════════
     HEADLIGHTS — Two SpotLights parented to truck
     ═══════════════════════════════════════ */
  const headlightColor = new Color3(1.0, 0.95, 0.85)
  const hlPositions = [
    new Vector3(-0.08, 0.12, 0.35),
    new Vector3(0.08, 0.12, 0.35),
  ]
  const headlights = hlPositions.map((pos, i) => {
    const hl = new SpotLight(
      `headlight_${i}`,
      pos,
      new Vector3(0, -0.15, 1),
      TRUCK.HEADLIGHT_ANGLE,
      2,
      scene,
    )
    hl.diffuse = headlightColor
    hl.intensity = TRUCK.HEADLIGHT_INTENSITY
    hl.range = 30
    hl.parent = truck
    // Restrict headlights to truck meshes only — prevents yellow patches on road
    if (truck._loadedMeshes && truck._loadedMeshes.length > 0) {
      hl.includedOnlyMeshes = truck._loadedMeshes
    }
    return hl
  })

  /* ═══════════════════════════════════════
     VOLUMETRIC HEADLIGHT CONES (K)
     Faint transparent cone meshes for atmospheric glow
     ═══════════════════════════════════════ */
  const hlCones = hlPositions.map((pos, i) => {
    const cone = MeshBuilder.CreateCylinder(`hlCone_${i}`, {
      diameterTop: 0.02,
      diameterBottom: 0.6,
      height: TRUCK.HL_CONE_LENGTH,
      tessellation: 12,
    }, scene)
    cone.rotation.x = -Math.PI / 2
    cone.position = pos.clone()
    cone.position.z += TRUCK.HL_CONE_LENGTH / 2 + 0.1
    cone.parent = truck

    const coneMat = new StandardMaterial(`hlConeMat_${i}`, scene)
    coneMat.diffuseColor = new Color3(1.0, 0.97, 0.9)
    coneMat.emissiveColor = new Color3(0.4, 0.38, 0.32)
    coneMat.alpha = TRUCK.HL_CONE_OPACITY
    coneMat.backFaceCulling = false
    coneMat.disableLighting = true
    cone.material = coneMat
    cone.isPickable = false
    cone.renderingGroupId = 2

    // Exclude headlight cones from GlowLayer to prevent double bloom
    const glowLayer = scene.effectLayers?.find(l => l.name === 'glowLayer')
    if (glowLayer && glowLayer.addExcludedMesh) {
      glowLayer.addExcludedMesh(cone)
    }
    return cone
  })

  /* ═══════════════════════════════════════
     EXHAUST PARTICLE SYSTEM — Enhanced cinematic smoke
     ═══════════════════════════════════════ */
  // Dedicated emitter node parented to truck for correct positioning
  const exhaustEmitter = new TransformNode('exhaustEmitter', scene)
  exhaustEmitter.parent = truck
  exhaustEmitter.position = new Vector3(-0.04, 0.32, -0.42) // local space (pre-scale)

  const exhaust = new ParticleSystem('exhaust', 300, scene)

  // Create soft circular particle texture via DynamicTexture
  const particleTex = new DynamicTexture('exhaustTex', { width: 64, height: 64 }, scene)
  const pCtx = particleTex.getContext()
  const gradient = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0,   'rgba(200,190,180,0.9)')
  gradient.addColorStop(0.4, 'rgba(180,170,160,0.5)')
  gradient.addColorStop(1,   'rgba(160,150,140,0.0)')
  pCtx.fillStyle = gradient
  pCtx.beginPath()
  pCtx.arc(32, 32, 32, 0, Math.PI * 2)
  pCtx.fill()
  particleTex.update()
  particleTex.hasAlpha = true

  exhaust.particleTexture = particleTex
  exhaust.createConeEmitter(0.03, Math.PI / 8)
  exhaust.emitter = exhaustEmitter

  // Color gradients: white-grey smoke
  exhaust.addColorGradient(0.0, new Color4(0.85, 0.85, 0.90, 0.6))
  exhaust.addColorGradient(0.3, new Color4(0.55, 0.55, 0.60, 0.4))
  exhaust.addColorGradient(0.7, new Color4(0.40, 0.40, 0.45, 0.15))
  exhaust.addColorGradient(1.0, new Color4(0.30, 0.30, 0.35, 0.0))

  // Size gradients: small puff expanding into cloud
  exhaust.addSizeGradient(0.0, 0.03, 0.06)
  exhaust.addSizeGradient(0.3, 0.08, 0.14)
  exhaust.addSizeGradient(0.7, 0.15, 0.25)
  exhaust.addSizeGradient(1.0, 0.20, 0.35)

  exhaust.minLifeTime = 0.8
  exhaust.maxLifeTime = 2.0
  exhaust.emitRate = 15
  exhaust.minEmitPower = 0.2
  exhaust.maxEmitPower = 0.6
  exhaust.gravity = new Vector3(0, 0.12, -0.4)
  exhaust.blendMode = ParticleSystem.BLENDMODE_STANDARD
  exhaust.updateSpeed = 0.01
  exhaust.minAngularSpeed = -0.5
  exhaust.maxAngularSpeed = 0.5
  exhaust.start()

  /* ═══════════════════════════════════════
     TIRE DUST PARTICLES (I)
     Low-opacity dust near tires at high speed
     ═══════════════════════════════════════ */
  const tireDust = new ParticleSystem('tireDust', 150, scene)
  tireDust.particleTexture = particleTex // reuse the same soft circle texture
  tireDust.createConeEmitter(0.8, Math.PI / 6)
  tireDust.emitter = truck
  tireDust.color1 = new Color4(0.55, 0.50, 0.42, 0.25)
  tireDust.color2 = new Color4(0.60, 0.56, 0.48, 0.15)
  tireDust.colorDead = new Color4(0.5, 0.48, 0.44, 0)
  tireDust.minSize = TRUCK.DUST_RATE > 0 ? 0.15 : 0
  tireDust.maxSize = 0.5
  tireDust.minLifeTime = 0.4
  tireDust.maxLifeTime = 1.2
  tireDust.emitRate = 0 // starts off, activated by speed
  tireDust.minEmitPower = 0.5
  tireDust.maxEmitPower = 1.5
  tireDust.gravity = new Vector3(0, -0.3, -0.8)
  tireDust.blendMode = ParticleSystem.BLENDMODE_STANDARD
  tireDust.updateSpeed = 0.01
  tireDust.start()

  /* ═══════════════════════════════════════
     FIND WHEEL MESHES for rotation (D)
     ═══════════════════════════════════════ */
  const wheelMeshes = []
  const cabinMeshes = []
  const trailerMeshes = []
  const allChildren = truck.getChildMeshes ? truck.getChildMeshes() : []
  allChildren.forEach(mesh => {
    const name = (mesh.name || '').toLowerCase()
    if (name.includes('wheel') || name.includes('tire') || name.includes('tyre')) {
      wheelMeshes.push(mesh)
    } else if (name.includes('cabin') || name.includes('cab') || name.includes('driver') || name.includes('front')) {
      cabinMeshes.push(mesh)
    } else if (name.includes('trailer') || name.includes('container') || name.includes('cargo') || name.includes('body') || name.includes('back')) {
      trailerMeshes.push(mesh)
    }
  })

  /* ═══════════════════════════════════════
     HEADLIGHT BEAM DUST PARTICLES
     Tiny floating particles inside volumetric cone
     ═══════════════════════════════════════ */
  const hlDustSystems = hlPositions.map((pos, i) => {
    const hlDust = new ParticleSystem(`hlDust_${i}`, 60, scene)
    hlDust.createBoxEmitter(
      new Vector3(-0.3, -0.1, 0),
      new Vector3(0.3, 0.1, TRUCK.HL_CONE_LENGTH),
      new Vector3(-0.2, -0.05, 0),
      new Vector3(0.2, 0.05, TRUCK.HL_CONE_LENGTH * 0.8),
    )
    hlDust.emitter = truck
    hlDust.particleTexture = particleTex
    hlDust.color1 = new Color4(1.0, 0.97, 0.92, 0.06)
    hlDust.color2 = new Color4(0.95, 0.95, 0.92, 0.03)
    hlDust.colorDead = new Color4(1, 1, 1, 0)
    hlDust.minSize = TRUCK.HL_DUST_SIZE[0]
    hlDust.maxSize = TRUCK.HL_DUST_SIZE[1]
    hlDust.minLifeTime = 1.0
    hlDust.maxLifeTime = 3.0
    hlDust.emitRate = TRUCK.HL_DUST_RATE
    hlDust.minEmitPower = 0.01
    hlDust.maxEmitPower = 0.05
    hlDust.gravity = new Vector3(0, -0.01, 0)
    hlDust.blendMode = ParticleSystem.BLENDMODE_ADD
    hlDust.updateSpeed = 0.005
    hlDust.start()
    return hlDust
  })

  /* ═══════════════════════════════════════
     HEAT DISTORTION PLANE (behind exhaust)
     Subtle shimmer mesh positioned behind truck exhaust
     ═══════════════════════════════════════ */
  // Heat distortion removed — was causing visible box artifact behind truck

  /* ═══════════════════════════════════════
     ANIMATION STATE — CINEMATIC EDITION
     ═══════════════════════════════════════ */
  let elapsed = 0
  let wheelRotation = 0
  let steeringPhase = 0
  // Load shift state (acceleration sensing)
  let prevSpeedNorm = 0
  let smoothAcceleration = 0
  // Cabin/trailer flex state
  let cabinFlexAngle = 0
  let trailerFlexAngle = 0
  // ══ INTRO SEQUENCE STATE ══
  let introElapsed = 0
  let introComplete = false
  // ══ TURBO BURST STATE ══
  let turboIntensity = 0

  /**
   * updateTruck — Animate truck based on world speed (not scroll Z)
   * Truck stays at origin. All animations read from speedNorm.
   * NOW WITH: Cinematic intro zoom + turbo burst + enhanced drama
   * @param {number} speedNorm — normalized world speed (0→1)
   * @param {number} dt — frame delta seconds
   * @param {number} worldSpeed — raw world speed (units/sec)
   * @param {number} progress — scroll progress (0→1) for night mode
   */
  function updateTruck(speedNorm, dt, worldSpeed, progress = 0) {
    elapsed += dt
    const sn = Math.min(speedNorm, 1)

    /* ══════════════════════════════════════
       CINEMATIC INTRO SEQUENCE
       Truck materializes from distance with dramatic zoom
       ══════════════════════════════════════ */
    if (TRUCK.INTRO_ENABLED && !introComplete) {
      introElapsed += dt
      const introDur = TRUCK.INTRO_DURATION
      const introT = Math.min(introElapsed / introDur, 1)

      // Dramatic ease: power curve (slow start → explosive arrival)
      const easeT = introT < 0.3
        ? Math.pow(introT / 0.3, 3) * 0.15               // slow power-up (0→15%)
        : 0.15 + 0.85 * (1 - Math.pow(1 - (introT - 0.3) / 0.7, 4))  // explosive arrive

      // Scale from tiny to full
      const introScale = TRUCK.INTRO_START_SCALE + (TRUCK.SCALE - TRUCK.INTRO_START_SCALE) * easeT
      truck.scaling.set(introScale, introScale, introScale)

      // Position from far behind to origin
      const introZ = TRUCK.INTRO_START_Z * (1 - easeT)
      truck.position.z = TRUCK.POSITION[2] + introZ

      // Dramatic upward lift during arrival
      const liftPhase = Math.sin(easeT * Math.PI * 0.5)
      truck.position.y = TRUCK.POSITION[1] + (1 - easeT) * 3.0 * liftPhase

      // Landing impact bounce at completion
      if (introT >= 0.92 && introT < 1.0) {
        const impactT = (introT - 0.92) / 0.08
        const bounce = Math.sin(impactT * Math.PI * 3) * 0.15 * (1 - impactT)
        truck.position.y += bounce
      }

      // Rotation wobble during approach
      truck.rotation.z = Math.sin(introElapsed * 8) * 0.02 * (1 - easeT)
      truck.rotation.x = Math.sin(introElapsed * 5) * 0.01 * (1 - easeT)

      // Exhaust trail during intro
      exhaust.emitRate = 30 + easeT * 120
      exhaust.minEmitPower = 0.5 + easeT * 1.5
      exhaust.maxEmitPower = 1.0 + easeT * 3.0

      if (introT >= 1.0) {
        introComplete = true
        // Snap to final position
        truck.scaling.set(TRUCK.SCALE, TRUCK.SCALE, TRUCK.SCALE)
        truck.position.set(TRUCK.POSITION[0], TRUCK.POSITION[1], TRUCK.POSITION[2])
        truck.rotation.set(0, TRUCK.ROTATION_Y, 0)
      }
      return // Skip normal animation during intro
    }

    /* ══════════════════════════════════════
       TURBO BURST DETECTION
       Between TURBO_PROGRESS_START and TURBO_PROGRESS_END
       ══════════════════════════════════════ */
    const inTurbo = progress >= TRUCK.TURBO_PROGRESS_START && progress <= TRUCK.TURBO_PROGRESS_END
    const turboTarget = inTurbo
      ? Math.pow(Math.sin((progress - TRUCK.TURBO_PROGRESS_START) /
          (TRUCK.TURBO_PROGRESS_END - TRUCK.TURBO_PROGRESS_START) * Math.PI), 0.7)
      : 0
    turboIntensity += (turboTarget - turboIntensity) * Math.min(dt * 4, 1)

    // Turbo-boosted speed for animations
    const turboSn = Math.min(sn * (1 + turboIntensity * (TRUCK.TURBO_SPEED_MULT - 1)), 1)

    // IDLE BASELINE — truck always has subtle engine vibration
    // Even when sn=0, there's a minimum animation level for visual life
    const IDLE_LEVEL = 0.12  // 12% base animation even at rest
    const animSn = Math.max(turboSn, IDLE_LEVEL)  // never fully still

    /* ── Acceleration sensing for load shift ── */
    const rawAccel = (sn - prevSpeedNorm) / Math.max(dt, 0.001)
    prevSpeedNorm = sn
    smoothAcceleration += (rawAccel - smoothAcceleration) * Math.min(dt * TRUCK.LOAD_SHIFT_SMOOTH, 1)

    /* ── Truck stays at anchor position ── */
    truck.position.x = TRUCK.POSITION[0]
    truck.position.z = TRUCK.POSITION[2]

    /* ── Body sway & roll — TURBO ENHANCED ── */
    const swayMult = 1 + turboIntensity * 1.5 // more sway during turbo
    const swayAngle = TRUCK.SWAY_AMPLITUDE * swayMult * (
      Math.sin(elapsed * 2.3) * 0.6 +
      Math.sin(elapsed * 3.7) * 0.3 +
      Math.sin(elapsed * 5.1) * 0.1 +
      (turboIntensity > 0.1 ? Math.sin(elapsed * 11.3) * 0.15 * turboIntensity : 0) // high-freq turbo vibration
    ) * (0.3 + animSn * 0.7)
    truck.rotation.z = swayAngle

    /* ── Steering micro-correction — MORE aggressive at turbo ── */
    steeringPhase += dt * (1.8 + animSn * 3.0)
    const steeringAngle = (
      Math.sin(steeringPhase * 0.5) * 0.00524 +   // 0.3° in radians
      Math.sin(steeringPhase * 2.7) * 0.002 +
      Math.sin(steeringPhase * 4.3) * 0.001 +
      (turboIntensity > 0.1 ? Math.sin(steeringPhase * 8.7) * 0.003 * turboIntensity : 0) // turbo jitter
    ) * animSn
    truck.rotation.y = TRUCK.ROTATION_Y + steeringAngle

    /* ── Suspension load shift ──
       Truck tilts backward during acceleration, forward when slowing */
    const loadShiftPitch = smoothAcceleration > 0
      ? -TRUCK.LOAD_SHIFT_PITCH * Math.min(smoothAcceleration * 0.5, 1)
      : TRUCK.LOAD_SHIFT_BRAKE_PITCH * Math.min(-smoothAcceleration * 0.5, 1)

    /* ── Chassis flex + load shift combined — TURBO ENHANCED ── */
    const pitchFlex = Math.sin(elapsed * 3.1) * 0.002 * animSn + loadShiftPitch +
      (turboIntensity > 0.1 ? Math.sin(elapsed * 9.5) * 0.004 * turboIntensity : 0) // turbo vibration
    truck.rotation.x = pitchFlex

    /* ── Suspension bounce — TURBO has extra high-frequency rumble ── */
    const bounceMult = 1 + turboIntensity * 2.0
    const bounce = TRUCK.BOUNCE_AMPLITUDE * bounceMult * (
      Math.sin(elapsed * 4.5) * 0.5 +           // low rumble
      Math.sin(elapsed * 7.2) * 0.3 +           // mid suspension bounce
      Math.sin(elapsed * 14.0) * 0.2 +          // high-frequency road texture
      (turboIntensity > 0.1 ? Math.sin(elapsed * 22.0) * 0.15 * turboIntensity : 0) // turbo hammering
    ) * (0.2 + animSn * 0.8)
    truck.position.y = TRUCK.POSITION[1] + bounce

    /* ── Cabin vs Trailer flex ──
       Cabin reacts faster to motion; trailer follows with delayed inertia */
    const targetCabinFlex = Math.sin(elapsed * TRUCK.CABIN_FLEX_SPEED) * TRUCK.CABIN_FLEX_AMP * animSn
    const targetTrailerFlex = Math.sin(elapsed * TRUCK.TRAILER_FLEX_SPEED) * TRUCK.TRAILER_FLEX_AMP * animSn
    cabinFlexAngle += (targetCabinFlex - cabinFlexAngle) * Math.min(dt * 8, 1)  // fast response
    trailerFlexAngle += (targetTrailerFlex - trailerFlexAngle) * Math.min(dt * 2, 1)  // slow inertia

    cabinMeshes.forEach(m => {
      m.rotation.x = cabinFlexAngle
    })
    trailerMeshes.forEach(m => {
      m.rotation.x = trailerFlexAngle
    })

    /* ── Tire rotation — TURBO makes wheels spin faster ── */
    if (wheelMeshes.length > 0) {
      const turboWorldSpeed = worldSpeed * (1 + turboIntensity * (TRUCK.TURBO_SPEED_MULT - 1))
      wheelRotation += (turboWorldSpeed * dt) / TRUCK.WHEEL_RADIUS
      wheelMeshes.forEach(w => {
        w.rotation.x = wheelRotation
        /* ── Adaptive tyre deformation — MORE visible at turbo ── */
        const squash = 1 - TRUCK.TYRE_SQUASH * animSn
        const stretch = 1 + TRUCK.TYRE_STRETCH * animSn
        w.scaling.y = squash
        w.scaling.x = stretch
        w.scaling.z = stretch
      })
    }

    /* ── Exhaust intensity — MASSIVE during turbo ── */
    const exhaustMult = 1 + turboIntensity * (TRUCK.TURBO_EXHAUST_MULT - 1)
    exhaust.emitRate = (15 + animSn * 45) * exhaustMult
    exhaust.minEmitPower = (0.2 + animSn * 0.4) * exhaustMult
    exhaust.maxEmitPower = (0.6 + animSn * 0.8) * exhaustMult
    exhaust.minLifeTime = 0.8 + animSn * 0.6
    exhaust.maxLifeTime = 2.0 + animSn * 1.0 + turboIntensity * 1.5

    /* ── Heat distortion removed — was causing visible box artifact ── */

    /* ── Tire dust — MORE at turbo, lower threshold ── */
    if (animSn > TRUCK.DUST_THRESHOLD) {
      const dustIntensity = (animSn - TRUCK.DUST_THRESHOLD) / (1 - TRUCK.DUST_THRESHOLD)
      const turboBoost = 1 + turboIntensity * 3
      tireDust.emitRate = TRUCK.DUST_RATE * dustIntensity * turboBoost
      tireDust.minSize = 0.15 + dustIntensity * 0.2
      tireDust.maxSize = 0.5 + dustIntensity * 0.4 + turboIntensity * 0.5
    } else {
      tireDust.emitRate = 0
    }

    /* ── Headlights — enhanced at night + TURBO PULSE ── */
    const nightBlend = progress > 0.82
      ? Math.min((progress - 0.82) / (0.92 - 0.82), 1)
      : 0
    const nightBoost = Math.min(1 + nightBlend * 1.8, 1.8)  // cap at safe levels
    const turboFlicker = turboIntensity > 0.1
      ? 1 + Math.sin(elapsed * 25) * 0.06 + Math.sin(elapsed * 37) * 0.04  // aggressive turbo flicker
      : 1 + Math.sin(elapsed * 12) * 0.03 + Math.sin(elapsed * 17.3) * 0.02
    headlights.forEach(hl => {
      hl.intensity = Math.min(TRUCK.HEADLIGHT_INTENSITY * turboFlicker * nightBoost * (1 + turboIntensity * 0.5), 5.0)
      hl.range = 30 + nightBlend * 10 + turboIntensity * 5
    })

    /* ── Headlight beam dust particles — more visible at night + turbo ── */
    hlDustSystems.forEach(sys => {
      sys.emitRate = TRUCK.HL_DUST_RATE * (0.3 + animSn * 0.3) * (1 + nightBlend * 0.5) * (1 + turboIntensity * 0.5)
    })

    /* ── Volumetric cone glow — brighter at night + turbo ── */
    const coneNightBoost = 1 + nightBlend * 3
    const turboConeBoost = 1 + turboIntensity * 2
    const conePulse = TRUCK.HL_CONE_OPACITY * (0.85 + Math.sin(elapsed * 8) * 0.15) * coneNightBoost * turboConeBoost
    hlCones.forEach(c => {
      c.material.alpha = Math.min(conePulse, 0.15)
    })

    /* ── Expose turbo state for camera and post-processing ── */
    window._turboIntensity = turboIntensity
    window._introComplete = introComplete
  }

  return { truck, updateTruck }
}
