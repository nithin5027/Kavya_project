/**
 * BABYLON CANVAS — React Wrapper Component
 * ══════════════════════════════════════════
 * Renders a <canvas>, initializes the Babylon.js engine,
 * runs the render loop driven by progressRef, and cleans
 * up on unmount.
 *
 * Props:
 *  - progressRef: React.MutableRefObject<number> (0→1 from GSAP ScrollTrigger)
 *  - onReady: () => void — called once scene is loaded
 *
 * Architecture note:
 *  This replaces the old React Three Fiber <Canvas>.
 *  The Babylon engine is fully imperative — no R3F hooks.
 *  progressRef.current is read every frame in the render loop.
 */
import React, { useRef, useEffect } from 'react'
import * as BABYLON from '@babylonjs/core'
import { createScene } from './scene/createScene'
import { getDeviceTier } from './config'

// [PERF-FIX] Memory-safe engine flags and tier-aware scene initialization.

export default function BabylonCanvas({ progressRef, onReady }) {
  // [PERF-FIX] Apply memory-safe engine flags and pass device tier to scene boot.
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const disposeRef = useRef(null)

  useEffect(() => {
    let disposed = false
    let engine = null

    // Prevent double-init from React StrictMode
    if (window.__kavyaInitializing) return
    window.__kavyaInitializing = true

    // Dispose any stale global engine before creating a fresh scene.
    if (window.__kavyaEngine && !window.__kavyaEngine.isDisposed) {
      try {
        window.__kavyaEngine.stopRenderLoop()
        window.__kavyaEngine.dispose()
      } catch (e) {}
      window.__kavyaEngine = null
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let scene = null
    let updateFrame = null
    let prevTime = performance.now()

    const handleResize = () => {
      if (engine && !engine.isDisposed) {
        engine.resize()
      }
    }

    const onTierChanged = (event) => {
      const nextTier = event?.detail?.to
      if (nextTier) {
        window.__kavyaDeviceTier = nextTier
      }
    }

    const init = async () => {
      // Dispose any stale engine from previous mount
      if (window.__kavyaEngine) {
        try { window.__kavyaEngine.dispose() } catch (e) {}
        window.__kavyaEngine = null
      }

      engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: true,
        doNotHandleContextLost: false,
      })
      engine.enableOfflineSupport = false
      engine.doNotHandleContextLost = false
      // Force shader compilation to complete before first render
      BABYLON.Effect.ShadersStore = BABYLON.Effect.ShadersStore || {}
      window.__kavyaEngine = engine

      // If this effect was cleaned up while creating the engine, stop immediately.
      if (disposed) {
        try { engine.dispose() } catch (e) {}
        window.__kavyaEngine = null
        window.__kavyaInitializing = false
        return
      }

      const deviceTier = getDeviceTier(engine)
      window.__kavyaDeviceTier = deviceTier
      window.dispatchEvent(new CustomEvent('kavya:tier-detected', { detail: { tier: deviceTier } }))
      const created = await createScene(engine, canvas, deviceTier)
      if (disposed) {
        try { created.dispose?.() } catch (e) {}
        try { engine.dispose() } catch (e) {}
        window.__kavyaEngine = null
        window.__kavyaInitializing = false
        return
      }

      scene = created.scene
      updateFrame = created.updateFrame
      disposeRef.current = created.dispose
      engineRef.current = engine

      engine.runRenderLoop(() => {
        if (scene && scene.isReady() && !engine.isDisposed) {
          const now = performance.now()
          const dt = Math.min((now - prevTime) / 1000, 0.1)
          prevTime = now

          if (updateFrame) {
            const progress = progressRef?.current ?? 0
            updateFrame(progress, dt)
          }
          scene.render()
        }
      })

      window.addEventListener('resize', handleResize)
      window.addEventListener('kavya:tier-changed', onTierChanged)
      if (onReady) onReady()
      window.__kavyaInitializing = false
    }

    init().catch(err => console.error('[BabylonCanvas] init error:', err))

    return () => {
      disposed = true
      window.__kavyaInitializing = false
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('kavya:tier-changed', onTierChanged)
      if (disposeRef.current) {
        try { disposeRef.current() } catch (e) {}
      }
      if (engine && !engine.isDisposed) {
        engine.stopRenderLoop()
        engine.dispose()
      }
      window.__kavyaEngine = null
      engineRef.current = null
      disposeRef.current = null
    }
  }, []) // Mount once

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        outline: 'none',
        zIndex: 0,
      }}
      touch-action="none"
    />
  )
}
