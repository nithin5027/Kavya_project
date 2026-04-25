// [PERF-FIX] Automatic runtime quality tier controller driven by rolling FPS telemetry.

const TIER_ORDER = ['low', 'balanced', 'high']
const history = []

function clampTier(tier) {
  return TIER_ORDER.includes(tier) ? tier : 'balanced'
}

function nextLower(tier) {
  const idx = TIER_ORDER.indexOf(clampTier(tier))
  return idx > 0 ? TIER_ORDER[idx - 1] : TIER_ORDER[0]
}

function nextHigher(tier) {
  const idx = TIER_ORDER.indexOf(clampTier(tier))
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : TIER_ORDER[TIER_ORDER.length - 1]
}

function hardwareScaleForTier(tier) {
  if (tier === 'high') return 1.0
  if (tier === 'balanced') return 1.25
  return 1.5
}

export function getTierHistory() {
  return history.slice()
}

export function startTierController(options) {
  const {
    initialTier,
    engine,
    pipeline,
    glow,
    shadowGenerator,
    applyPostTier,
    applyShadowTier,
  } = options

  const baseTier = clampTier(initialTier)
  let currentTier = baseTier
  let downgradeCount = 0
  let upgradeCount = 0
  let lowFpsWindows = 0
  let highFpsWindows = 0
  let lastChangeAt = 0
  const cooldownMs = 8000

  const applyTier = (nextTier, reason, avgFPS = 0) => {
    const from = currentTier
    const to = clampTier(nextTier)
    if (from === to) return

    const now = Date.now()
    if (now - lastChangeAt < cooldownMs) return

    applyPostTier?.(to, pipeline, glow, true)
    applyShadowTier?.(to, shadowGenerator)
    engine.setHardwareScalingLevel(hardwareScaleForTier(to))

    currentTier = to
    lastChangeAt = now

    history.push({ from, to, reason, avgFPS, at: now })
    while (history.length > 10) history.shift()

    console.log(`[TierController] ${from} → ${to} (${reason}, FPS avg: ${avgFPS.toFixed(1)})`)
    window.dispatchEvent(new CustomEvent('kavya:tier-changed', {
      detail: { from, to, reason, avgFPS },
    }))
  }

  const tryDowngrade = (reason, avgFPS = 0) => {
    if (downgradeCount >= 2) return
    const candidate = nextLower(currentTier)
    if (candidate === currentTier) return
    downgradeCount += 1
    applyTier(candidate, reason, avgFPS)
  }

  const tryUpgrade = (reason, avgFPS = 0) => {
    if (upgradeCount >= 1) return
    const candidate = nextHigher(currentTier)
    const baseIdx = TIER_ORDER.indexOf(baseTier)
    const candIdx = TIER_ORDER.indexOf(candidate)
    if (candIdx > baseIdx + 1) return
    if (candidate === currentTier) return
    upgradeCount += 1
    applyTier(candidate, reason, avgFPS)
  }

  const handleMetrics = (metrics) => {
    const avgFPS = metrics?.avgFPS || 0

    if (avgFPS < 35) {
      lowFpsWindows += 1
      highFpsWindows = 0
    } else if (avgFPS > 55) {
      highFpsWindows += 1
      lowFpsWindows = 0
    } else {
      lowFpsWindows = 0
      highFpsWindows = 0
    }

    if (lowFpsWindows >= 3) {
      lowFpsWindows = 0
      tryDowngrade('auto-low-fps', avgFPS)
    }

    if (highFpsWindows >= 5) {
      highFpsWindows = 0
      tryUpgrade('auto-high-fps', avgFPS)
    }
  }

  const onCommand = (event) => {
    const action = event?.detail?.action
    if (action === 'downgrade') {
      tryDowngrade('manual-downgrade', event?.detail?.avgFPS || 0)
    }
    if (action === 'upgrade') {
      tryUpgrade('manual-upgrade', event?.detail?.avgFPS || 0)
    }
  }

  window.addEventListener('kavya:tier-command', onCommand)

  return {
    getCurrentTier: () => currentTier,
    handleMetrics,
    forceDowngrade: () => tryDowngrade('manual-downgrade', 0),
    forceUpgrade: () => tryUpgrade('manual-upgrade', 0),
    stop: () => window.removeEventListener('kavya:tier-command', onCommand),
  }
}
