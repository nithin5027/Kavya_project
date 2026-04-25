/**
 * DEBUG — Performance monitor + spline helper (DEV only)
 * ═══════════════════════════════════════════════════════
 * Only renders when IS_DEV is true.
 * Provides: FPS counter, draw call count, triangle count,
 * spline visualization, camera frustum.
 */
import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { IS_DEV } from '../config'
import { routeCurve, cameraRail } from '../core'

/**
 * PerfMonitor — renders as HTML overlay
 */
export function PerfMonitor() {
  if (!IS_DEV) return null

  const frameRef = useRef(0)
  const fpsRef = useRef(60)
  const prevTime = useRef(performance.now())
  const domRef = useRef()
  const { gl } = useThree()

  useFrame(() => {
    frameRef.current++
    const now = performance.now()
    if (now - prevTime.current >= 1000) {
      fpsRef.current = frameRef.current
      frameRef.current = 0
      prevTime.current = now
    }
  })

  // Update DOM directly (no React renders)
  useFrame(() => {
    if (!domRef.current) return
    const info = gl.info
    domRef.current.textContent = [
      `FPS: ${fpsRef.current}`,
      `Draw: ${info.render.calls}`,
      `Tris: ${(info.render.triangles / 1000).toFixed(1)}k`,
      `Geo: ${info.memory.geometries}`,
      `Tex: ${info.memory.textures}`,
    ].join(' | ')
  })

  return null // We use CSS overlay from OverlayUI
}

/**
 * SplineHelper — visualize route + camera rail in DEV
 */
export function SplineHelper() {
  if (!IS_DEV) return null

  const routeLineRef = useRef()
  const cameraLineRef = useRef()

  useEffect(() => {
    // Route spline
    if (routeLineRef.current) {
      const points = routeCurve.getPoints(200)
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      routeLineRef.current.geometry = geo
    }

    // Camera rail
    if (cameraLineRef.current) {
      const points = cameraRail.getPoints(200)
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      cameraLineRef.current.geometry = geo
    }
  }, [])

  return (
    <group>
      <line ref={routeLineRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#ff0000" depthWrite={false} transparent opacity={0.6} />
      </line>
      <line ref={cameraLineRef}>
        <bufferGeometry />
        <lineBasicMaterial color="#00ff00" depthWrite={false} transparent opacity={0.6} />
      </line>
    </group>
  )
}
