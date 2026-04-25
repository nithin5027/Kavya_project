/**
 * AUDIO ENGINE — WebAudio ambient sound system
 * ═════════════════════════════════════════════
 * Lazy-init on first user interaction.
 * Procedural engine hum, wind, tunnel reverb.
 * Zero external audio files needed.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { AUDIO, TUNNEL } from '../config'
import { useProgress, routeCurve } from '../core'

class ProceduralAudio {
  constructor() {
    this.ctx = null
    this.master = null
    this.engineGain = null
    this.windGain = null
    this.engineOsc = null
    this.windNoise = null
    this.initialized = false
  }

  async init() {
    if (this.initialized) return
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.master = this.ctx.createGain()
      this.master.gain.value = AUDIO.MASTER_VOLUME
      this.master.connect(this.ctx.destination)

      // Engine hum — low oscillator
      this.engineOsc = this.ctx.createOscillator()
      this.engineOsc.type = 'sawtooth'
      this.engineOsc.frequency.value = AUDIO.ENGINE_BASE_FREQ
      this.engineGain = this.ctx.createGain()
      this.engineGain.gain.value = 0
      const engineFilter = this.ctx.createBiquadFilter()
      engineFilter.type = 'lowpass'
      engineFilter.frequency.value = 200
      this.engineOsc.connect(engineFilter)
      engineFilter.connect(this.engineGain)
      this.engineGain.connect(this.master)
      this.engineOsc.start()

      // Wind noise — white noise through bandpass
      const bufferSize = this.ctx.sampleRate * 2
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
      this.windNoise = this.ctx.createBufferSource()
      this.windNoise.buffer = buffer
      this.windNoise.loop = true
      this.windGain = this.ctx.createGain()
      this.windGain.gain.value = 0
      const windFilter = this.ctx.createBiquadFilter()
      windFilter.type = 'bandpass'
      windFilter.frequency.value = 800
      windFilter.Q.value = 0.5
      this.windNoise.connect(windFilter)
      windFilter.connect(this.windGain)
      this.windGain.connect(this.master)
      this.windNoise.start()

      this.initialized = true
    } catch (e) {
      console.warn('Audio init failed:', e)
    }
  }

  update(progress, speed) {
    if (!this.initialized || !this.ctx) return
    const now = this.ctx.currentTime

    // Engine hum scales with speed
    const engineVol = Math.min(speed * 8, 0.15) * AUDIO.ENGINE_VOLUME
    this.engineGain.gain.linearRampToValueAtTime(engineVol, now + 0.05)
    this.engineOsc.frequency.linearRampToValueAtTime(
      AUDIO.ENGINE_BASE_FREQ + speed * 400, now + 0.05
    )

    // Wind increases with speed
    const windVol = Math.min(speed * 4, 0.1) * AUDIO.WIND_VOLUME
    this.windGain.gain.linearRampToValueAtTime(windVol, now + 0.1)
  }

  dispose() {
    if (this.ctx) {
      try {
        this.engineOsc?.stop()
        this.windNoise?.stop()
        this.ctx.close()
      } catch (e) { /* noop */ }
    }
    this.initialized = false
  }
}

export default function AudioEngine() {
  const progressRef = useProgress()
  const audioRef = useRef(new ProceduralAudio())
  const prevProgress = useRef(0)
  const enabled = useRef(false)

  // Lazy init on user interaction
  const handleInteraction = useCallback(() => {
    if (!enabled.current) {
      audioRef.current.init()
      enabled.current = true
    }
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleInteraction, { once: true })
    document.addEventListener('touchstart', handleInteraction, { once: true })
    document.addEventListener('scroll', handleInteraction, { once: true })

    return () => {
      document.removeEventListener('click', handleInteraction)
      document.removeEventListener('touchstart', handleInteraction)
      document.removeEventListener('scroll', handleInteraction)
      audioRef.current.dispose()
    }
  }, [handleInteraction])

  useFrame(() => {
    const progress = progressRef.current
    const speed = Math.abs(progress - prevProgress.current)
    prevProgress.current = progress
    audioRef.current.update(progress, speed)
  })

  return null
}
