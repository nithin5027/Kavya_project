// [PERF-FIX] Runtime frame-window telemetry for adaptive quality and HUD diagnostics.

let state = null

export function startMonitoring(scene, engine, onMetricsUpdate) {
  stopMonitoring()

  const samples = []
  let last = performance.now()
  let frameCount = 0

  const observer = scene.onAfterRenderObservable.add(() => {
    const now = performance.now()
    const dt = now - last
    last = now

    samples.push(dt)
    if (samples.length > 60) samples.shift()

    frameCount += 1
    if (frameCount < 60) return
    frameCount = 0

    if (samples.length === 0) return

    const total = samples.reduce((sum, v) => sum + v, 0)
    const avgFrameMs = total / samples.length
    const minFrameMs = Math.min(...samples)

    const avgFPS = avgFrameMs > 0 ? 1000 / avgFrameMs : 0
    const minFPS = minFrameMs > 0 ? 1000 / Math.max(...samples) : 0

    const activeMeshes = scene.getActiveMeshes()?.length || 0
    const drawCalls = scene.getActiveDrawCalls ? scene.getActiveDrawCalls() : 0
    const trianglesDrawn = Math.floor((scene.getActiveIndices?.() || 0) / 3)
    const gpuFrameTime = engine.getFps ? (1000 / Math.max(engine.getFps(), 1)) : avgFrameMs

    const metrics = {
      avgFPS,
      minFPS,
      avgFrameMs,
      drawCalls,
      activeMeshes,
      gpuFrameTime,
      trianglesDrawn,
      timestamp: Date.now(),
    }

    onMetricsUpdate?.(metrics)
  })

  state = { scene, observer }
}

export function stopMonitoring() {
  if (!state) return
  try {
    state.scene.onAfterRenderObservable.remove(state.observer)
  } catch (_) {
    // no-op
  }
  state = null
}
