/**
 * CORE — Pre-allocated objects & shared utilities
 * ════════════════════════════════════════════════
 * Zero GC pressure: all vectors, colors, quaternions
 * allocated once, reused everywhere.
 */
import { createContext, useContext } from 'react'
import * as THREE from 'three'
import { ROUTE_POINTS, CAMERA_RAIL_POINTS, CAMERA_PAUSE_RANGES } from '../config'

/* ═══════════════════════════════════════
   PROGRESS CONTEXT
   ═══════════════════════════════════════ */
const ProgressCtx = createContext({ current: 0 })
export const ProgressProvider = ProgressCtx.Provider
export const useProgress = () => useContext(ProgressCtx)

/* ═══════════════════════════════════════
   PRE-ALLOCATED OBJECTS — reuse, never new
   ═══════════════════════════════════════ */
export const _v3A = new THREE.Vector3()
export const _v3B = new THREE.Vector3()
export const _v3C = new THREE.Vector3()
export const _euler = new THREE.Euler()
export const _qTarget = new THREE.Quaternion()
export const _qCurrent = new THREE.Quaternion()
export const _color = new THREE.Color()
export const _colorB = new THREE.Color()
export const _mat4 = new THREE.Matrix4()
export const _box3 = new THREE.Box3()
export const _dummy = new THREE.Object3D()

/* ── Truck world position (shared mutable) ── */
export const truckWorldPos = new THREE.Vector3()

/* ═══════════════════════════════════════
   SHARED CURVES (computed once)
   ═══════════════════════════════════════ */
export const routeCurve = new THREE.CatmullRomCurve3(ROUTE_POINTS, false, 'centripetal', 0.5)
export const cameraRail = new THREE.CatmullRomCurve3(CAMERA_RAIL_POINTS, false, 'centripetal', 0.5)

/* ═══════════════════════════════════════
   INTERPOLATION UTILITIES
   ═══════════════════════════════════════ */

/** Lerp across 3 keyframes: [0–0.3] a→b, [0.3–0.7] b→c, [0.7–1] = c */
export function lerpColor3(a, b, c, t) {
  if (t <= 0.3) return _color.copy(a).lerp(b, t / 0.3)
  if (t <= 0.7) return _color.copy(b).lerp(c, (t - 0.3) / 0.4)
  return _color.copy(c)
}

export function lerpValue3(a, b, c, t) {
  if (t <= 0.3) return a + (b - a) * (t / 0.3)
  if (t <= 0.7) return b + (c - b) * ((t - 0.3) / 0.4)
  return c
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/* ═══════════════════════════════════════
   CAMERA PAUSE DETECTION
   ═══════════════════════════════════════ */
export function isInPauseRange(t) {
  for (const [start, end] of CAMERA_PAUSE_RANGES) {
    if (t >= start && t <= end) return true
  }
  return false
}

/* ── Export for OverlayUI ── */
export function getCameraPaused(t) {
  return isInPauseRange(t)
}

/* ═══════════════════════════════════════
   NOISE FUNCTIONS (JS — for terrain gen)
   ═══════════════════════════════════════ */
export function hash2D(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}

export function smoothNoise(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
  const a = hash2D(ix, iz)
  const b = hash2D(ix + 1, iz)
  const c = hash2D(ix, iz + 1)
  const d = hash2D(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

export function fbm(x, z, octaves = 5) {
  let value = 0, amplitude = 0.5, frequency = 1, maxValue = 0
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= 0.5
    frequency *= 2.1
  }
  return value / maxValue
}
