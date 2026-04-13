/**
 * CINEMATIC WORLD V3 — Master Scene Assembly
 * ════════════════════════════════════════════
 * Imports all modular components.
 * Single Suspense boundary for the truck GLB.
 * Deterministic render order. Zero transparency artifacts.
 *
 * Render Order Strategy:
 *   -1000  Sky dome (BackSide, depthWrite: false)
 *      0   Opaque: terrain, road, mountains, warehouses, containers, tunnel
 *      1   RouteGlow (depthWrite: false, transparent)
 *      2   Truck (opaque, on road)
 *      3   Headlight beams (additive, transparent)
 *    100+  Particles (depthWrite: false, transparent)
 *    101   Exhaust smoke
 *    102   Tyre spray
 *    103   Headlight dust motes
 *    104   Rain streaks
 *    105   Tyre water spray
 *   9993   Road wetness overlay
 *   9994   Speed lines
 *   9995   Heat distortion
 *   9996   Atmospheric haze
 *   9997   Film grain
 *   9998   Color grade overlay
 *   9999   Vignette overlay
 */
import { Suspense } from 'react'

// Layers
import Sky from './environment/Sky'
import Terrain from './terrain/Terrain'
import Mountains from './terrain/Mountains'
import Road from './road/Road'
import RouteGlow from './road/RouteGlow'
import Truck from './truck/Truck'
import Lighting, { VolumetricLightRays } from './lighting/Lighting'
import Tunnel from './environment/Tunnel'
import NetworkMap from './network/NetworkMap'
import { AtmosphericDust, DustTrail } from './environment/Particles'
import { ScreenVignette, ColorGrade, FilmGrain, AtmosphericHaze } from './postprocessing/Effects'
import AudioEngine from './audio/AudioEngine'
import CameraRig from './camera/CameraRig'

// V2: Advanced animation systems
import ExhaustSmoke from './truck/ExhaustSmoke'
import { TyreSpray, SkidMarks, BrakeGlow } from './truck/TyreEffects'
import HeadlightBeams from './truck/HeadlightBeams'
import HeatDistortion from './postprocessing/HeatDistortion'
import SpeedLines from './postprocessing/SpeedLines'
import { RainStreaks, TyreWaterSpray, RoadWetness } from './environment/WeatherEffects'

// Debug (tree-shaken in production)
import { PerfMonitor, SplineHelper } from './debug/PerfMonitor'
import { IS_DEV } from './config'

export default function CinematicWorldV3({ progressRef }) {
  return (
    <>
      {/* ── Lighting (static, set once) ── */}
      <Lighting />

      {/* ── Sky dome (renderOrder -1000) ── */}
      <Sky progressRef={progressRef} />

      {/* ── Volumetric god rays ── */}
      <VolumetricLightRays progressRef={progressRef} />

      {/* ── Terrain (opaque, renderOrder 0) ── */}
      <Terrain progressRef={progressRef} />

      {/* ── Mountains (opaque, 3 layers) ── */}
      <Mountains progressRef={progressRef} />

      {/* ── Road surface (opaque, renderOrder 0) ── */}
      <Road progressRef={progressRef} />

      {/* ── Skid marks on road (renderOrder 1) ── */}
      <SkidMarks />

      {/* ── Route glow trail (transparent, renderOrder 1) ── */}
      <RouteGlow progressRef={progressRef} />

      {/* ── Tunnel ── */}
      <Tunnel />

      {/* ── Truck (Draco GLB, Suspense boundary) ── */}
      <Suspense fallback={null}>
        <Truck progressRef={progressRef} />
      </Suspense>

      {/* ── V2: Volumetric headlight beams (renderOrder 3) ── */}
      <HeadlightBeams progressRef={progressRef} />

      {/* ── V2: Exhaust / silencer smoke (renderOrder 101) ── */}
      <ExhaustSmoke />

      {/* ── V2: Tyre spray + brake glow ── */}
      <TyreSpray />
      <BrakeGlow />

      {/* ── Network map ── */}
      <NetworkMap />

      {/* ── Particles (transparent, high renderOrder) ── */}
      <AtmosphericDust />
      <DustTrail />

      {/* ── V2: Weather system (rain + splash) ── */}
      <RainStreaks />
      <TyreWaterSpray />

      {/* ── Camera ── */}
      <CameraRig progressRef={progressRef} />

      {/* ── Post-processing overlays ── */}
      <RoadWetness />
      <SpeedLines />
      <HeatDistortion />
      <AtmosphericHaze hazeColor="#b0c8d8" intensity={0.04} />
      <FilmGrain intensity={0.025} />
      <ColorGrade warmth={0.015} />
      <ScreenVignette intensity={0.25} softness={0.6} />

      {/* ── Audio ── */}
      <AudioEngine />

      {/* ── Debug (DEV only) ── */}
      {IS_DEV && <PerfMonitor />}
      {IS_DEV && <SplineHelper />}
    </>
  )
}

