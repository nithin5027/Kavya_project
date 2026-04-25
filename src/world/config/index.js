/**
 * KAVYA TRANSPORTS — MASTER CONFIGURATION
 * ════════════════════════════════════════
 * Single source of truth for all 3D scene parameters.
 * No magic numbers in components.
 */
import * as THREE from 'three'

/* ── Build mode ── */
export const IS_DEV = import.meta.env.DEV

/* ── Device detection (computed once at startup) ── */
export const IS_MOBILE = typeof window !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768)

export const PREFERS_REDUCED_MOTION = typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ═══════════════════════════════════════
   SCENE BOUNDS
   ═══════════════════════════════════════ */
export const SCENE = {
  SCROLL_PAGES: 12,
  BOUNDS: { minX: -120, maxX: 120, minZ: -120, maxZ: 120 },
  GROUND_Y: 0,
  ROAD_Y: 0.12,
  TRUCK_Y: 0.12,
}

/* ═══════════════════════════════════════
   SCROLL SECTIONS (0-1 normalized)
   ═══════════════════════════════════════ */
export const SECTIONS = [
  { id: 0, name: 'hero',       start: 0.00, end: 0.08 },
  { id: 1, name: 'about',      start: 0.08, end: 0.18 },
  { id: 2, name: 'services',   start: 0.18, end: 0.29 },
  { id: 3, name: 'fleet',      start: 0.29, end: 0.39 },
  { id: 4, name: 'industries', start: 0.39, end: 0.48 },
  { id: 5, name: 'clients',    start: 0.48, end: 0.57 },
  { id: 6, name: 'network',    start: 0.57, end: 0.67 },
  { id: 7, name: 'why',        start: 0.67, end: 0.77 },
  { id: 8, name: 'locations',  start: 0.77, end: 0.87 },
  { id: 9, name: 'cta',        start: 0.87, end: 1.00 },
]

export const SECTION_NAMES = SECTIONS.map(s => s.name)

/* ═══════════════════════════════════════
   ROUTE SPLINE — Truck path
   ═══════════════════════════════════════
   Physically independent from terrain.
   Road Y is constant at SCENE.ROAD_Y.
   Clamped within SCENE.BOUNDS.
*/
export const ROUTE_POINTS = [
  new THREE.Vector3(-40, SCENE.ROAD_Y, 45),
  new THREE.Vector3(-25, SCENE.ROAD_Y, 30),
  new THREE.Vector3(-10, SCENE.ROAD_Y, 18),
  new THREE.Vector3(  0, SCENE.ROAD_Y, 8),
  new THREE.Vector3(  8, SCENE.ROAD_Y, 0),
  new THREE.Vector3( 15, SCENE.ROAD_Y, -10),
  new THREE.Vector3( 20, SCENE.ROAD_Y, -25),
  new THREE.Vector3( 25, SCENE.ROAD_Y, -40),
  new THREE.Vector3( 28, SCENE.ROAD_Y, -55),
  new THREE.Vector3( 30, SCENE.ROAD_Y, -65),
  new THREE.Vector3( 32, SCENE.ROAD_Y, -78),
]

/* ── Road corridor width (terrain carves this flat) ── */
export const ROAD_CORRIDOR_WIDTH = 14.0
export const ROAD_HALF_WIDTH = 4.5

/* ═══════════════════════════════════════
   CAMERA RAIL — Independent from truck
   ═══════════════════════════════════════
   15+ unit clearance from all buildings.
*/
export const CAMERA_RAIL_POINTS = [
  new THREE.Vector3(  0, 55, 78),   // HERO: Very high aerial establishing
  new THREE.Vector3( -5, 42, 55),   // Descend gently
  new THREE.Vector3( -8, 32, 40),   // About section
  new THREE.Vector3(  2, 25, 25),   // Services
  new THREE.Vector3( 10, 20, 10),   // Fleet
  new THREE.Vector3( 12, 18, -5),   // Industries
  new THREE.Vector3( 10, 20, -18),  // Clients
  new THREE.Vector3(  5, 22, -35),  // Network
  new THREE.Vector3(  0, 18, -50),  // Why section
  new THREE.Vector3( -5, 15, -60),  // Locations
  new THREE.Vector3( -8, 12, -68),  // CTA
]

/* ── Camera pause ranges (breathing animation) ── */
export const CAMERA_PAUSE_RANGES = [
  [0.00, 0.08],
  [0.16, 0.24],
  [0.38, 0.42],
  [0.54, 0.58],
  [0.74, 0.78],
  [0.92, 1.00],
]

/* ═══════════════════════════════════════
   PARALLAX DEPTH MULTIPLIERS
   ═══════════════════════════════════════ */
export const PARALLAX = {
  SKY:       0.1,
  MOUNTAINS: 0.3,
  MID_ASSETS: 0.6,
  TRUCK:     1.0,
  DUST:      1.2,
}

/* ═══════════════════════════════════════
   COLOR GRADING — Day → Golden Hour → Night
   ═══════════════════════════════════════ */
export const COLORS = {
  // Background — cool blue-green
  BG_DAY:     '#d4e8f0',
  BG_SUNSET:  '#FF7E47',
  BG_NIGHT:   '#1a1a2e',

  // Fog — cool aerial haze
  FOG_DAY:    '#c8dce8',
  FOG_SUNSET: '#FFB088',
  FOG_NIGHT:  '#2d2d44',

  // Ambient — cooler midday
  AMB_DAY:    '#f0f4f8',
  AMB_SUNSET: '#FFE4CC',
  AMB_NIGHT:  '#4a4a6a',

  // Key light — white midday sun
  KEY_DAY:    '#fff5e0',
  KEY_SUNSET: '#FF8C42',
  KEY_NIGHT:  '#6B5B95',

  // Rim light
  RIM_DAY:    '#9fb8ff',
  RIM_SUNSET: '#FF6B35',
  RIM_NIGHT:  '#3d3d5c',

  // Sky — clear blue
  SKY_TOP_DAY:    '#1a3a6a',
  SKY_MID_DAY:    '#a8d8ea',
  SKY_BOT_DAY:    '#d8e8f2',
  SKY_TOP_SUNSET: '#0f1a2e',
  SKY_MID_SUNSET: '#FF9966',
  SKY_BOT_SUNSET: '#FFD4B8',
  SKY_TOP_NIGHT:  '#050510',
  SKY_MID_NIGHT:  '#1a1a3e',
  SKY_BOT_NIGHT:  '#2d2d5c',

  // Sun
  SUN_DAY:    '#FFFAF0',
  SUN_SUNSET: '#FF6B35',
  SUN_NIGHT:  '#4a3060',

  // Ground — lush Indian farmland
  GROUND1_DAY: '#2d8a4e',
  GROUND2_DAY: '#4CAF50',
  DIRT_DAY:    '#C8B050',

  // Warehouse (kept for reference, not rendered)
  WAREHOUSE_WALL: '#E8DDD6',
  WAREHOUSE_ROOF: '#8B8B8B',
  WAREHOUSE_DOOR: '#4A6B8A',
}

/* ═══════════════════════════════════════
   LIGHTING CONFIG
   ═══════════════════════════════════════ */
export const LIGHTING = {
  AMBIENT_INTENSITY: 0.70,
  AMBIENT_COLOR: '#f0f4f8',
  HEMI_INTENSITY: 0.50,
  HEMI_SKY: '#a0d0e8',
  HEMI_GROUND: '#3a8a4a',
  KEY_INTENSITY: 1.5,
  KEY_POSITION: [8, 20, -6],
  KEY_COLOR: '#fff5e0',
  RIM_INTENSITY: 0.35,
  RIM_POSITION: [-6, 6, 6],
  RIM_COLOR: '#9fb8ff',
  SHADOW_MAP_SIZE: IS_MOBILE ? 256 : 512,
  SHADOWS_ENABLED: !IS_MOBILE,
}

/* ═══════════════════════════════════════
   FOG CONFIG
   ═══════════════════════════════════════ */
export const FOG = {
  COLOR: COLORS.FOG_DAY,
  DENSITY: 0.008,
}

/* ═══════════════════════════════════════
   PERFORMANCE BUDGET
   ═══════════════════════════════════════ */
export const PERF = {
  DPR: IS_MOBILE ? [1] : [1, 1.25],
  ANTIALIAS: false,
  FOV: 50,
  NEAR: 0.5,
  FAR: 500,
  SHADOW_MAP_SIZE: IS_MOBILE ? 256 : 512,
  MAX_DRAW_CALLS: 200,
  PARTICLE_COUNT_DUST: IS_MOBILE ? 40 : 80,
  PARTICLE_COUNT_TRAIL: IS_MOBILE ? 50 : 100,
  MOUNTAIN_SEGMENTS_NEAR: IS_MOBILE ? 32 : 64,
  MOUNTAIN_SEGMENTS_MID:  IS_MOBILE ? 28 : 56,
  MOUNTAIN_SEGMENTS_FAR:  IS_MOBILE ? 24 : 48,
}

/* ═══════════════════════════════════════
   WAREHOUSE POSITIONS
   ═══════════════════════════════════════
   Camera rail stays 15+ units clear.
*/
export const WAREHOUSES = []

/* ═══════════════════════════════════════
   CONTAINER YARD LAYOUTS
   ═══════════════════════════════════════ */
export const CONTAINER_YARDS = []

export const CONTAINER_BRAND_COLORS = [
  { main: '#2563eb', accent: '#1d4ed8', text: '#ffffff' },
  { main: '#f97316', accent: '#ea580c', text: '#ffffff' },
  { main: '#1e293b', accent: '#0f172a', text: '#f1f5f9' },
  { main: '#dc2626', accent: '#b91c1c', text: '#ffffff' },
  { main: '#f5f5f5', accent: '#e5e5e5', text: '#1f2937' },
  { main: '#16a34a', accent: '#15803d', text: '#ffffff' },
]

/* ═══════════════════════════════════════
   NETWORK MAP HUBS
   ═══════════════════════════════════════ */
export const NETWORK_HUBS = [
  { name: 'Tirunelveli', x: -35, y: 0.3, z: 40, color: '#ff8800', activate: 0.0 },
  { name: 'Coimbatore',  x: -18, y: 0.3, z: 25, color: '#ff8800', activate: 0.20 },
  { name: 'Bangalore',   x: -8,  y: 0.3, z: 8,  color: '#ff6600', activate: 0.30 },
  { name: 'Chennai',     x: 5,   y: 0.3, z: 18, color: '#ff6600', activate: 0.35 },
  { name: 'Hyderabad',   x: 8,   y: 0.3, z: -2, color: '#ff4400', activate: 0.50 },
  { name: 'Pune',        x: 14,  y: 0.3, z: -12, color: '#ff4400', activate: 0.55 },
  { name: 'Mumbai',      x: 22,  y: 0.3, z: -22, color: '#ff2200', activate: 0.65 },
  { name: 'Kolkata',     x: 35,  y: 0.3, z: -8,  color: '#ff2200', activate: 0.70 },
  { name: 'Delhi',       x: 25,  y: 0.3, z: -45, color: '#ff0000', activate: 0.85 },
]

export const NETWORK_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6], [4, 8], [3, 7], [6, 8],
]

/* ═══════════════════════════════════════
   AUDIO CONFIG
   ═══════════════════════════════════════ */
export const AUDIO = {
  MASTER_VOLUME: 0.15,
  ENGINE_VOLUME: 0.08,
  ENGINE_BASE_FREQ: 55,
  WIND_VOLUME: 0.05,
  RUMBLE_VOLUME: 0.03,
  FADE_DURATION: 2.0,
}

/* ═══════════════════════════════════════
   TUNNEL
   ═══════════════════════════════════════ */
export const TUNNEL = {
  POSITION: [30, 3, -62],
  RADIUS: 6,
  LENGTH: 20,
  START_T: 0.85,
  END_T: 0.95,
  WALL_COLOR: '#4a4a4a',
  LIGHT_INTENSITY: 1.5,
  LIGHT_COLOR: '#ffc967',
}

/* ═══════════════════════════════════════
   EXHAUST / SILENCER SMOKE
   ═══════════════════════════════════════ */
export const EXHAUST = {
  PARTICLE_COUNT: IS_MOBILE ? 80 : 200,
  // Positions relative to truck group origin
  PIPE_LEFT:  [-0.6, 0.3, -4.0],
  PIPE_RIGHT: [ 0.6, 0.3, -4.0],
  BUOYANCY: 1.8,
  WIND_X: 0.4,
  WIND_Z: -0.6,
  TURBULENCE: 1.2,
  IDLE_OPACITY: 0.12,
  ACCEL_OPACITY: 0.45,
  IDLE_COLOR: '#aaaaaa',
  ACCEL_COLOR: '#555555',
  PUFF_EXPAND_RATE: 1.5,
  LIFETIME: 2.5,
}

/* ═══════════════════════════════════════
   TYRE EFFECTS
   ═══════════════════════════════════════ */
export const TYRE_FX = {
  SPRAY_COUNT: IS_MOBILE ? 40 : 100,
  SKID_DECAY_RATE: 0.015,
  SKID_MAX_MARKS: IS_MOBILE ? 30 : 60,
  BRAKE_GLOW_COLOR: '#ff6a00',
  BRAKE_GLOW_INTENSITY: 0.6,
  SPRAY_COLOR: '#C4A77D',
  REAR_WHEEL_OFFSETS: [
    [-1.0, 0.1, -3.0],
    [ 1.0, 0.1, -3.0],
  ],
}

/* ═══════════════════════════════════════
   WEATHER — Rain + Splash
   ═══════════════════════════════════════ */
export const WEATHER = {
  RAIN_COUNT: IS_MOBILE ? 200 : 500,
  RAIN_SPEED: 25,
  RAIN_AREA: 60,
  RAIN_HEIGHT: 35,
  RAIN_COLOR: '#b0c8e8',
  WIND_DIRECTION: [0.3, 0, -0.15],
  // Rain active during sunset phase
  START_T: 0.35,
  PEAK_T: 0.55,
  END_T: 0.70,
  SPLASH_COUNT: IS_MOBILE ? 20 : 50,
  SPLASH_COLOR: '#d0e0f0',
}

/* ═══════════════════════════════════════
   SPEED LINES / MOTION STREAKS
   ═══════════════════════════════════════ */
export const SPEED_LINES = {
  MAX_INTENSITY: 0.35,
  STREAK_LENGTH: 0.4,
  FADE_SPEED: 3.0,
  VELOCITY_THRESHOLD: 0.0005,
  COLOR_BLEND: 0.6, // blend with fog color
}

/* ═══════════════════════════════════════
   VOLUMETRIC HEADLIGHT BEAMS
   ═══════════════════════════════════════ */
export const HEADLIGHT_BEAMS = {
  CONE_ANGLE: 0.35,
  CONE_LENGTH: 15,
  CONE_RADIUS: 4,
  DUST_DENSITY: 0.3,
  DAY_INTENSITY: 0.02,
  NIGHT_INTENSITY: 0.35,
  BEAM_COLOR_DAY: '#fff8e0',
  BEAM_COLOR_NIGHT: '#ffe8b0',
  DUST_PARTICLE_COUNT: IS_MOBILE ? 30 : 80,
}
