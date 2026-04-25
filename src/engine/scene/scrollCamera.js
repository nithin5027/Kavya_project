/**
 * CINEMATIC CAMERA — ArcRotate-style keyframe interpolation
 * ═══════════════════════════════════════════════════════════
 * 18 cinematic keyframes define the camera orbit path.
 * Each keyframe: { t, alpha, beta, radius, targetY, fov }
 *
 * Features:
 *   - Cubic ease-in-out interpolation between keyframes
 *   - Shortest-path alpha interpolation (wraps around π)
 *   - Spring-damped position smoothing
 *   - FOV compression at speed
 *   - Micro camera shake in speed zones + turbo shake amplification
 *   - Breathing oscillation during scroll pauses
 *   - DOF focus distance tracking
 *   - INTRO SEQUENCE: dramatic swoop camera during truck materialisation
 *   - TURBO BURST: amplified shake + FOV punch during turbo window
 */
import {
  UniversalCamera,
  Vector3,
} from '@babylonjs/core'
import { CAMERA, CAMERA_KEYFRAMES, TRUCK, isInPauseRange } from '../config'

/* ── Cubic ease-in-out ── */
function cubicEase(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/* ── Shortest-path alpha interpolation ── */
function lerpAlpha(a, b, t) {
  let diff = b - a
  // Wrap to [-π, π]
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return a + diff * t
}

/* ── Interpolate keyframes with cubic easing ── */
function interpolateKeyframes(progress) {
  const keys = CAMERA_KEYFRAMES
  if (progress <= keys[0].t) return { ...keys[0] }
  if (progress >= keys[keys.length - 1].t) return { ...keys[keys.length - 1] }

  let i = 0
  while (i < keys.length - 1 && keys[i + 1].t < progress) i++

  const k0 = keys[i]
  const k1 = keys[i + 1]
  const seg = (progress - k0.t) / (k1.t - k0.t)
  const s = cubicEase(seg)

  return {
    alpha: lerpAlpha(k0.alpha, k1.alpha, s),
    beta: k0.beta + (k1.beta - k0.beta) * s,
    radius: k0.radius + (k1.radius - k0.radius) * s,
    targetY: k0.targetY + (k1.targetY - k0.targetY) * s,
    fov: k0.fov + (k1.fov - k0.fov) * s,
  }
}

/* ── Seeded noise for organic shake ── */
function noise(seed) {
  const n = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

/**
 * setupScrollCamera
 * @param {object} scene
 * @param {HTMLCanvasElement} canvas
 * @param {object} truckMesh — the truck root mesh to orbit around
 * @returns {{ camera, updateCamera, getFocusDistance }}
 */
export function setupScrollCamera(scene, canvas, truckMesh) {
  const init = interpolateKeyframes(0)
  const initX = Math.sin(init.alpha) * Math.sin(init.beta) * init.radius
  const initY = Math.cos(init.beta) * init.radius
  const initZ = Math.cos(init.alpha) * Math.sin(init.beta) * init.radius

  const camera = new UniversalCamera(
    'orbitCam',
    new Vector3(initX, initY, initZ),
    scene,
  )
  camera.fov = init.fov
  camera.minZ = CAMERA.NEAR
  camera.maxZ = CAMERA.FAR
  camera.inputs.clear()

  // ── Smooth state ──
  let smoothCamX = initX
  let smoothCamY = initY
  let smoothCamZ = initZ
  let smoothLookX = 0
  let smoothLookY = init.targetY
  let smoothLookZ = 0
  let smoothFov = init.fov
  let breathPhase = 0
  let elapsed = 0
  let currentFocusDistance = init.radius

  // ── Spring velocity state ──
  const SPRING_STIFFNESS = 8.0
  const SPRING_DAMPING = 0.72
  const SPRING_MASS = 1.0
  const vel = { cx: 0, cy: 0, cz: 0, lx: 0, ly: 0, lz: 0, fov: 0 }

  function springStep(current, target, velocity, dt) {
    const F = SPRING_STIFFNESS * (target - current)
              - SPRING_DAMPING * Math.sqrt(SPRING_STIFFNESS) * SPRING_MASS * velocity
    const newVel = velocity + F * dt
    const newPos = current + newVel * dt
    return { pos: newPos, vel: newVel }
  }

  /**
   * updateCamera — cinematic orbit driven by scroll progress
   * Now with INTRO SWOOP + TURBO BURST camera effects
   */
  function updateCamera(progress, dt, speedNorm) {
    elapsed += dt

    // Read turbo state from truck.js (exposed on window)
    const turboIntensity = window._turboIntensity || 0
    const introComplete = window._introComplete !== undefined ? window._introComplete : true

    // Truck anchor point
    const truckPos = truckMesh
      ? { x: truckMesh.position.x, y: truckMesh.position.y, z: truckMesh.position.z }
      : { x: 0, y: 0.1, z: 0 }

    /* ── INTRO CAMERA SWOOP ── */
    if (TRUCK.INTRO_ENABLED && !introComplete && elapsed < TRUCK.INTRO_DURATION + 0.5) {
      const introT = Math.min(elapsed / TRUCK.INTRO_DURATION, 1)
      // Camera sweeps from high distant aerial to hero position
      const introEase = 1 - Math.pow(1 - introT, 3) // ease-out cubic

      // Start: far away, high up, looking down the road
      const startRadius = 180
      const startBeta = 0.35  // nearly overhead
      const startAlpha = Math.PI * 0.1  // slight offset
      const startTargetY = 30

      // End: near first keyframe position
      const endKf = interpolateKeyframes(0)
      const endRadius = endKf.radius
      const endBeta = endKf.beta
      const endAlpha = endKf.alpha
      const endTargetY = endKf.targetY

      const r = startRadius + (endRadius - startRadius) * introEase
      const beta = startBeta + (endBeta - startBeta) * introEase
      const alpha = lerpAlpha(startAlpha, endAlpha, introEase)
      const tgtY = startTargetY + (endTargetY - startTargetY) * introEase

      const sinB = Math.sin(beta)
      const cx = truckPos.x + Math.sin(alpha) * sinB * r
      const cy = truckPos.y + Math.cos(beta) * r
      const cz = truckPos.z + Math.cos(alpha) * sinB * r

      // Dramatic intro shake (rumble)
      const introShake = (1 - introT) * 0.8  // fades as truck arrives
      const sx = noise(elapsed * 3.2) * introShake
      const sy = noise(elapsed * 2.1 + 50) * introShake * 0.5
      const sz = noise(elapsed * 4.5 + 100) * introShake * 0.3

      // Quick lerp for smooth intro
      const introLerp = 1 - Math.exp(-6 * dt)
      smoothCamX += (cx + sx - smoothCamX) * introLerp
      smoothCamY += (cy + sy - smoothCamY) * introLerp
      smoothCamZ += (cz + sz - smoothCamZ) * introLerp
      smoothLookX += (truckPos.x - smoothLookX) * introLerp
      smoothLookY += (truckPos.y + tgtY - smoothLookY) * introLerp
      smoothLookZ += (truckPos.z - smoothLookZ) * introLerp

      // Intro FOV: wide cinematic → normal
      const introFov = 1.2 + (interpolateKeyframes(0).fov - 1.2) * introEase
      smoothFov += (introFov - smoothFov) * introLerp
      camera.fov = smoothFov

      camera.position.set(smoothCamX, smoothCamY, smoothCamZ)
      camera.setTarget(new Vector3(smoothLookX, smoothLookY, smoothLookZ))

      const dx = smoothCamX - truckPos.x
      const dy = smoothCamY - truckPos.y
      const dz = smoothCamZ - truckPos.z
      currentFocusDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      return
    }

    // Interpolate keyframes
    const kf = interpolateKeyframes(progress)

    /* ── Spherical → Cartesian (ArcRotateCamera convention) ── */
    const sinBeta = Math.sin(kf.beta)
    const desiredX = truckPos.x + Math.sin(kf.alpha) * sinBeta * kf.radius
    const desiredY = truckPos.y + Math.cos(kf.beta) * kf.radius
    const desiredZ = truckPos.z + Math.cos(kf.alpha) * sinBeta * kf.radius

    /* ── Look-at point ── */
    const lookX = truckPos.x
    const lookY = truckPos.y + kf.targetY
    const lookZ = truckPos.z

    /* ── Breathing oscillation (during scroll pauses) ── */
    let breathX = 0, breathY = 0, breathZ = 0
    if (isInPauseRange(progress)) {
      breathPhase += dt * 1.5
      breathX = Math.sin(breathPhase) * 0.12
      breathY = Math.sin(breathPhase * 0.7) * 0.06
      breathZ = Math.cos(breathPhase * 0.5) * 0.08
    } else {
      breathPhase *= 0.95
    }

    /* ── Spring-damped follow (true spring physics) ── */
    const springDt = Math.min(dt, 0.05)

    const cxS = springStep(smoothCamX, desiredX + breathX, vel.cx, springDt)
    const cyS = springStep(smoothCamY, desiredY + breathY, vel.cy, springDt)
    const czS = springStep(smoothCamZ, desiredZ + breathZ, vel.cz, springDt)
    smoothCamX = cxS.pos; vel.cx = cxS.vel
    smoothCamY = cyS.pos; vel.cy = cyS.vel
    smoothCamZ = czS.pos; vel.cz = czS.vel

    // Enforce minimum camera height above road surface (road is at Y ≈ 0, truck at ~0.2)
    // Prevents camera going underground during fast scroll spring overshoot
    const CAMERA_FLOOR_Y = 0.5
    if (smoothCamY < CAMERA_FLOOR_Y) {
      smoothCamY = CAMERA_FLOOR_Y
      if (vel.cy < 0) vel.cy = 0  // cancel downward momentum at the floor
    }

    const lxS = springStep(smoothLookX, lookX, vel.lx, springDt)
    const lyS = springStep(smoothLookY, lookY, vel.ly, springDt)
    const lzS = springStep(smoothLookZ, lookZ, vel.lz, springDt)
    smoothLookX = lxS.pos; vel.lx = lxS.vel
    smoothLookY = lyS.pos; vel.ly = lyS.vel
    smoothLookZ = lzS.pos; vel.lz = lzS.vel

    // Enforce minimum targetY so truck never goes below camera horizon
    smoothLookY = Math.max(smoothLookY, 0.8)

    /* ── Micro camera shake + TURBO SHAKE AMPLIFICATION ── */
    const sn = speedNorm || 0
    const turboShakeMult = 1 + turboIntensity * 8  // massive shake during turbo
    const shakeAmp = CAMERA.SHAKE_AMPLITUDE * sn * turboShakeMult
    const shakeFreqBoost = 1 + turboIntensity * 3  // faster shake during turbo
    const shakeX = noise(elapsed * 7.3 * shakeFreqBoost) * shakeAmp
    const shakeY = noise(elapsed * 5.1 * shakeFreqBoost + 100) * shakeAmp * 0.7
    const shakeZ = noise(elapsed * 6.7 * shakeFreqBoost + 200) * shakeAmp * 0.4

    /* ── FOV compression at speed + TURBO FOV PUNCH (spring) ── */
    const turboFovPunch = turboIntensity * 0.15  // FOV widens during turbo for speed feel
    const fovCompressed = kf.fov - (kf.fov - CAMERA.FOV_MIN) * sn * 0.25 + turboFovPunch
    const fovS = springStep(smoothFov, fovCompressed, vel.fov, springDt)
    smoothFov = fovS.pos; vel.fov = fovS.vel
    camera.fov = smoothFov

    /* ── Apply final position ── */
    camera.position.set(
      smoothCamX + shakeX,
      smoothCamY + shakeY,
      smoothCamZ + shakeZ,
    )
    camera.setTarget(new Vector3(smoothLookX, smoothLookY, smoothLookZ))

    /* ── Focus distance for DOF ── */
    const dx = smoothCamX - truckPos.x
    const dy = smoothCamY - truckPos.y
    const dz = smoothCamZ - truckPos.z
    currentFocusDistance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  function getFocusDistance() {
    return currentFocusDistance
  }

  return { camera, updateCamera, getFocusDistance }
}

