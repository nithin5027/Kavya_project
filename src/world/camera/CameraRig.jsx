/**
 * CAMERA RIG — Fixed spline rail (drone on a track)
 * ══════════════════════════════════════════════════
 * Scroll-only. No mouse. No noise. No shake.
 * Smooth position/rotation interpolation via lerp/slerp.
 * Breathing micro-motion at pause zones only.
 */
import { useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cameraRail, isInPauseRange, truckWorldPos, _v3A, _v3B, clamp } from '../core'

const _qTarget = new THREE.Quaternion()
const _qCurrent = new THREE.Quaternion()
const _lookPos = new THREE.Vector3()
const _camPos = new THREE.Vector3()

export default function CameraRig({ progressRef }) {
  const { camera } = useThree()
  const initialized = useRef(false)
  const smoothPos = useRef(new THREE.Vector3())
  const smoothLook = useRef(new THREE.Vector3())

  useFrame(({ clock }) => {
    const t = progressRef.current
    const elapsed = clock.elapsedTime

    // Get position from spline rail
    const railT = clamp(t, 0, 1)
    cameraRail.getPointAt(railT, _camPos)

    // Look target: follow truck position
    if (truckWorldPos.lengthSq() > 0) {
      _lookPos.copy(truckWorldPos)
      _lookPos.y += 3.0
    } else {
      const lookAheadT = Math.min(1, railT + 0.1)
      cameraRail.getPointAt(lookAheadT, _lookPos)
      _lookPos.y = 2
    }

    // Breathing at pause zones
    const isPause = isInPauseRange(t)
    if (isPause) {
      _camPos.y += Math.sin(elapsed * 0.3) * 0.03
      _camPos.x += Math.sin(elapsed * 0.18) * 0.015
    }

    // Initialize
    if (!initialized.current) {
      smoothPos.current.copy(_camPos)
      smoothLook.current.copy(_lookPos)
      camera.position.copy(_camPos)
      initialized.current = true
    }

    // Double-damped smooth interpolation
    const posLerp = isPause ? 0.01 : 0.035
    const lookLerp = isPause ? 0.015 : 0.04
    smoothPos.current.lerp(_camPos, posLerp)
    smoothLook.current.lerp(_lookPos, lookLerp)

    camera.position.copy(smoothPos.current)

    // Smooth rotation via quaternion slerp
    camera.lookAt(smoothLook.current)
    _qTarget.copy(camera.quaternion)
    camera.quaternion.copy(_qCurrent)
    camera.quaternion.slerp(_qTarget, isPause ? 0.02 : 0.05)
    _qCurrent.copy(camera.quaternion)
  })

  return null
}

/* ── Re-export for OverlayUI ── */
export { isInPauseRange as getCameraPaused } from '../core'
