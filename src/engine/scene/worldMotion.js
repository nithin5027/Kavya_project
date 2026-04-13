/**
 * WORLD MOTION ENGINE — Scroll → Bidirectional World Speed
 * ═════════════════════════════════════════════════════════
 * "Static Surface + Scrolling Marks" architecture:
 *
 *   - Truck is the ANCHOR (stays at origin)
 *   - Road surface/shoulders/solid-lines DON'T MOVE (uniform, camera can't tell)
 *   - DASHED lane lines scroll via modular wrapping (forward-motion illusion)
 *   - Terrain slides slowly (parallax depth)
 *   - Mountains slide very slowly (deep parallax)
 *
 * Bidirectional:
 *   - Scroll DOWN → world scrolls forward (dashes flow toward +Z, past the truck)
 *   - Scroll UP   → world scrolls backward (dashes flow toward -Z, reverse)
 *   - Signed worldSpeed: positive = forward, negative = reverse
 *
 * Dashed-line recycling:
 *   - Track a `dashOffset` (0 → dashPitch, then wraps)
 *   - Each dash's Z = originalZ + dashOffset
 *   - Since the pattern repeats every dashPitch (8 m), wrapping is seamless
 *
 * All other systems (truck animations, camera, cinematic director)
 * read from getWorldSpeed() and getSpeedNorm().
 */
import { WORLD, ROAD } from '../config'

/**
 * Sample the cinematic speed curve at a given scroll progress.
 * Linear interpolation between defined keypoints.
 */
function sampleSpeedCurve(progress) {
  const curve = WORLD.SPEED_CURVE
  if (progress <= curve[0].t) return curve[0].speed
  if (progress >= curve[curve.length - 1].t) return curve[curve.length - 1].speed

  let i = 0
  while (i < curve.length - 1 && curve[i + 1].t < progress) i++

  const k0 = curve[i]
  const k1 = curve[i + 1]
  const t = (progress - k0.t) / (k1.t - k0.t)
  const s = t * t * (3 - 2 * t)
  return k0.speed + (k1.speed - k0.speed) * s
}

/**
 * setupWorldMotion
 * @param {object} refs
 * @param {Array}  refs.dashedLines   — dashed lane meshes (scroll for motion illusion)
 * @param {object} refs.ground        — terrain ground plane (parallax)
 * @param {Array}  refs.mountains     — mountain meshes array (deep parallax)
 * @returns {{ updateWorld, getWorldSpeed, getSpeedNorm, getWorldDistance }}
 */
export function setupWorldMotion(refs) {
  const { dashedLines, ground, mountains, billboards, updateDashes } = refs

  // ── State ──
  let worldSpeed = 0          // signed: positive = forward, negative = reverse
  let worldDistance = 0        // total absolute distance traveled
  let prevProgress = -1        // -1 = uninitialized
  let scrollVelocity = 0      // smoothed absolute scroll rate
  let scrollDirection = 1      // +1 forward, -1 reverse

  // Dash modular offset — wraps within [0, dashPitch)
  const DASH_PITCH = ROAD.DASH_PITCH       // 8 (3m dash + 5m gap)
  const HALF_ROAD = ROAD.LENGTH / 2        // 200 (road extends ±200 from center)
  let dashOffset = 0

  /**
   * updateWorld — called every frame
   * @param {number} progress — scroll 0→1
   * @param {number} dt — delta time in seconds
   */
  function updateWorld(progress, dt) {
    // First frame: just store progress, don't move anything
    if (prevProgress < 0) {
      prevProgress = progress
      return
    }

    /* ── 1. Signed scroll delta → direction + velocity ── */
    const scrollDelta = progress - prevProgress       // SIGNED — positive = scroll down
    prevProgress = progress

    const absDelta = Math.abs(scrollDelta)
    const scrollRate = absDelta / Math.max(dt, 0.001)  // progress units/sec

    // Smooth the scroll velocity (absolute magnitude)
    scrollVelocity += (scrollRate - scrollVelocity) * Math.min(dt * 5, 1)

    // Track direction (only update when there's meaningful scroll input)
    if (absDelta > 0.0001) {
      scrollDirection = scrollDelta > 0 ? 1 : -1
    }

    /* ── 2. Target speed from curve × scroll activity ── */
    const curveSpeed = sampleSpeedCurve(progress)
    const isScrolling = scrollVelocity > 0.01

    // MINIMUM IDLE SPEED — truck always appears to be cruising
    // Even without scrolling, maintain a gentle cruising speed for visual life
    const IDLE_SPEED_FRACTION = 0.15  // 15% of curve speed as idle baseline
    const idleSpeed = curveSpeed * WORLD.MAX_SPEED * IDLE_SPEED_FRACTION

    // Target speed MAGNITUDE from the cinematic curve
    const targetMagnitude = isScrolling
      ? curveSpeed * WORLD.MAX_SPEED * Math.min(scrollVelocity * 4, 1)
      : idleSpeed  // coasting speed when not scrolling

    // Signed target speed
    const targetSpeed = targetMagnitude * scrollDirection

    /* ── 3. Spring acceleration / deceleration ── */
    if (Math.abs(targetSpeed) > Math.abs(worldSpeed) || Math.sign(targetSpeed) !== Math.sign(worldSpeed)) {
      // Accelerating or changing direction
      worldSpeed += (targetSpeed - worldSpeed) * (1 - Math.exp(-WORLD.ACCELERATION * dt))
    } else {
      // Decelerating (slower for smooth coast)
      worldSpeed += (targetSpeed - worldSpeed) * (1 - Math.exp(-WORLD.DECELERATION * dt))
    }

    // Clamp micro-drifting
    if (Math.abs(worldSpeed) < 0.01) worldSpeed = 0

    /* ── 4. Frame distance (signed) ── */
    const frameDist = worldSpeed * dt       // positive = forward, negative = reverse
    worldDistance += Math.abs(frameDist)     // always accumulates positive

    /* ── 5. Scroll dashed lane lines (modular wrapping) ──
       dashOffset accumulates, wraps within [0, dashPitch).
       Each dash's position = originalZ + dashOffset.
       Because the dash pattern repeats every DASH_PITCH (8m),
       wrapping is visually seamless.  */
    // Scroll dash lane lines via texture offset (or legacy mesh positions)
    if (updateDashes) {
      updateDashes(frameDist)
    } else if (dashedLines && dashedLines.length > 0) {
      dashOffset += frameDist
      dashOffset = ((dashOffset % DASH_PITCH) + DASH_PITCH) % DASH_PITCH
      for (let i = 0; i < dashedLines.length; i++) {
        const dash = dashedLines[i]
        const newZ = dash._originalZ + dashOffset
        if (newZ > HALF_ROAD) {
          dash.position.z = newZ - ROAD.LENGTH
        } else if (newZ < -HALF_ROAD) {
          dash.position.z = newZ + ROAD.LENGTH
        } else {
          dash.position.z = newZ
        }
      }
    }

    /* ── 6. Move terrain (slow parallax — bidirectional) ── */
    if (ground) {
      ground.position.z += frameDist * 0.3    // 30% of road speed for depth
      // Gentle wrap to avoid FP drift — terrain is 600×600, very forgiving
      if (ground.position.z > 150) ground.position.z -= 150
      if (ground.position.z < -150) ground.position.z += 150
    }

    /* ── 7. Move mountains (very slow — deep parallax — bidirectional) ── */
    if (mountains && mountains.length > 0) {
      mountains.forEach(m => {
        m.position.z += frameDist * 0.05      // 5% — distant objects barely move
      })
      // Wrap mountains
      if (mountains[0].position.z > 80) {
        mountains.forEach(m => { m.position.z -= 80 })
      }
      if (mountains[0].position.z < -80) {
        mountains.forEach(m => { m.position.z += 80 })
      }
    }

    /* ── 8. Move billboards (same speed as terrain — roadside depth) ── */
    if (billboards && billboards.length > 0) {
      billboards.forEach(m => {
        m.position.z += frameDist * 0.3   // Same as terrain parallax
      })
      // Wrap billboards — cycle through a 300m range
      const bbWrap = 300
      const bbHalf = bbWrap / 2
      billboards.forEach(m => {
        if (m.position.z > bbHalf) m.position.z -= bbWrap
        if (m.position.z < -bbHalf - 100) m.position.z += bbWrap
      })
    }
  }

  /** Get current world speed magnitude (always positive, for truck animations) */
  function getWorldSpeed() {
    return Math.abs(worldSpeed)
  }

  /** Get normalized speed 0→1 (always positive) */
  function getSpeedNorm() {
    return Math.min(Math.abs(worldSpeed) / WORLD.MAX_SPEED, 1)
  }

  /** Get total distance traveled (always increases) */
  function getWorldDistance() {
    return worldDistance
  }

  return { updateWorld, getWorldSpeed, getSpeedNorm, getWorldDistance }
}
