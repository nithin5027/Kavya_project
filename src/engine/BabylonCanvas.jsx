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
import React, { useRef, useEffect, useState } from 'react'
import * as BABYLON from '@babylonjs/core'
import { createScene } from './scene/createScene'
import { getDeviceTier } from './config'

// [PERF-FIX] Memory-safe engine flags and tier-aware scene initialization.

const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  (/iPhone|iPad|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768)

export default function BabylonCanvas({ progressRef, onReady }) {
  // [PERF-FIX] Apply memory-safe engine flags and pass device tier to scene boot.
  const canvasRef = useRef(null)
  const engineRef = useRef(null)
  const disposeRef = useRef(null)
  const [webGLFailed, setWebGLFailed] = useState(false)

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
    let fallbackTimer = null

    // [FIX #2] Check WebGL support before attempting to create engine
    if (!BABYLON.Engine.isSupported()) {
      console.warn('[BabylonCanvas] WebGL not supported — showing static fallback')
      setWebGLFailed(true)
      window.__kavyaInitializing = false
      return
    }

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

      // [FIX #4, #2] Wrap engine creation in try/catch — mobile can fail silently
      try {
        engine = new BABYLON.Engine(canvas, true, {
          preserveDrawingBuffer: true,
          stencil: true,
          antialias: !isMobileDevice(),
          doNotHandleContextLost: false,
          limitDeviceRatio: 2,          // [FIX #4] cap pixel ratio — prevents GPU overflow on Retina/AMOLED
          disableWebGL2Support: false,
        })
      } catch (engineErr) {
        console.error('[BabylonCanvas] Engine creation failed:', engineErr)
        setWebGLFailed(true)
        window.__kavyaInitializing = false
        return
      }

      engine.enableOfflineSupport = false
      engine.doNotHandleContextLost = false
      // Disable Babylon's built-in loading UI to prevent conflicts
      BABYLON.SceneLoader.ShowLoadingUI = false
      // Force shader compilation to complete before first render
      BABYLON.Effect.ShadersStore = BABYLON.Effect.ShadersStore || {}
      window.__kavyaEngine = engine

      // [FIX #11] 8-second fallback timer — if canvas stays white, show static image
      fallbackTimer = setTimeout(() => {
        if (!window.__kavyaTruckReady) {
          console.warn('[BabylonCanvas] Scene failed to load in 8s — showing static fallback')
          setWebGLFailed(true)
        }
      }, 8000)

      // If this effect was cleaned up while creating the engine, stop immediately.
      if (disposed) {
        clearTimeout(fallbackTimer)
        try { engine.dispose() } catch (e) {}
        window.__kavyaEngine = null
        window.__kavyaInitializing = false
        return
      }

      let deviceTier
      try {
        deviceTier = getDeviceTier(engine)
      } catch (e) {
        deviceTier = 'low'
      }
      window.__kavyaDeviceTier = deviceTier
      window.dispatchEvent(new CustomEvent('kavya:tier-detected', { detail: { tier: deviceTier } }))

      let created
      try {
        created = await createScene(engine, canvas, deviceTier)
      } catch (sceneErr) {
        console.error('[BabylonCanvas] createScene failed:', sceneErr)
        clearTimeout(fallbackTimer)
        setWebGLFailed(true)
        window.__kavyaInitializing = false
        return
      }

      if (disposed) {
        clearTimeout(fallbackTimer)
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

      // [FIX #11] Cancel fallback timer once scene is confirmed ready
      scene.executeWhenReady(() => {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      })

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

    init().catch(err => {
      console.error('[BabylonCanvas] init error:', err)
      clearTimeout(fallbackTimer)
      setWebGLFailed(true)
      window.__kavyaInitializing = false
    })

    return () => {
      disposed = true
      window.__kavyaInitializing = false
      if (fallbackTimer) clearTimeout(fallbackTimer)
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

  // [FIX #2, #11] Static image fallback when WebGL fails or times out
  if (webGLFailed) {
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        background: '#060810',
        zIndex: 0,
        overflow: 'hidden',
      }}>
        <img
          src="/assets/truck-fallback.jpg"
          alt="Kavya Transports Truck"
          onError={(e) => { e.target.style.display = 'none' }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        outline: 'none',
        touchAction: 'none',
        zIndex: 0,
      }}
    />
  )
}
