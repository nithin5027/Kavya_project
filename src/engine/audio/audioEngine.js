/**
 * AMBIENT SOUND ENGINE — Procedural truck & wind audio
 * ═══════════════════════════════════════════════════════
 * No audio files needed — all sounds are generated via Web Audio API.
 * Initialized on first user click (browser autoplay policy).
 */
export class AudioEngine {
  constructor() {
    this.ctx = null
    this.initialized = false
  }

  init() {
    if (this.initialized) return
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.initialized = true
      this._createEngineHum()
      this._createWindRush()
    } catch (e) {
      console.warn('[AudioEngine] Failed to initialize:', e.message)
    }
  }

  _createEngineHum() {
    const osc1 = this.ctx.createOscillator()
    const osc2 = this.ctx.createOscillator()
    const gainNode = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()

    osc1.type = 'sawtooth'
    osc1.frequency.value = 48
    osc2.type = 'sine'
    osc2.frequency.value = 62

    filter.type = 'lowpass'
    filter.frequency.value = 180
    filter.Q.value = 2

    gainNode.gain.value = 0.04

    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.ctx.destination)

    osc1.start()
    osc2.start()

    this.engineGain = gainNode
    this.engineOsc = osc1
  }

  _createWindRush() {
    const bufferSize = this.ctx.sampleRate * 2
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 800
    filter.Q.value = 0.5

    const gainNode = this.ctx.createGain()
    gainNode.gain.value = 0.0

    source.connect(filter)
    filter.connect(gainNode)
    gainNode.connect(this.ctx.destination)
    source.start()

    this.windGain = gainNode
  }

  update(speedNorm, progress) {
    if (!this.initialized) return
    const t = this.ctx.currentTime

    this.engineGain.gain.setTargetAtTime(0.035 + speedNorm * 0.025, t, 0.3)
    this.engineOsc.frequency.setTargetAtTime(48 + speedNorm * 22, t, 0.5)
    this.windGain.gain.setTargetAtTime(speedNorm * 0.06, t, 0.2)

    // Night: reduce volume
    const nightFactor = Math.max(0, (progress - 0.82) / 0.18)
    this.engineGain.gain.setTargetAtTime(
      (0.035 + speedNorm * 0.025) * (1 - nightFactor * 0.4), t, 0.3
    )
  }

  dispose() {
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
      this.initialized = false
    }
  }
}
