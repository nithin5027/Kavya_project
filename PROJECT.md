# Kavya Transports — Cinematic 3D Website

## What It Is

A cinematic, scroll-driven 3D marketing website for **Kavya Transports**, a logistics company based in Tirunelveli, Tamil Nadu (est. 2004). The homepage is a fully interactive Babylon.js 3D scene where a truck drives through a golden-hour highway environment as the user scrolls. Business information (fleet, services, clients, contact) is delivered through a separate multi-page React app that you navigate to from the 3D home page.

Live URL: `kavyatransports.com`

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Engine | Babylon.js 8.x (`@babylonjs/core`, `@babylonjs/loaders`) |
| UI Framework | React 18 + React Router v6 |
| Scroll Animation | GSAP ScrollTrigger |
| Bundler | Vite 5 + `@vitejs/plugin-react` |
| Asset Pipeline | `@gltf-transform/cli` (GLB compression / LOD) |
| Styling | Plain CSS (`styles.css`, `pages.css`) |

**Dead dependencies** (in `package.json` but NOT bundled — safe to remove):
- `three`, `three-stdlib`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`

---

## Repository Structure

```
kavya-3d/
├── index.html                  — Vite entry, single <div id="root">
├── vite.config.js              — Manual chunk splitting (babylon/react/gsap)
├── package.json
├── fix-banners.mjs             — One-off script, safe to ignore
├── scripts/
│   ├── optimizeAssets.mjs      — Runs before every build (gltf-transform compress)
│   └── assetCache.mjs          — Cache helper for optimize script
├── public/
│   └── assets/
│       ├── kavya-env.glb           — Environment: poles, rocks, road markings, mountains
│       ├── kavya-env.meshopt.glb   — Meshopt-compressed version (low-tier devices)
│       ├── truckfglb.glb           — Truck (original)
│       ├── kavyatruck.opt.glb      — Truck (compressed, used for all tiers)
│       ├── kavyatruck-lod1.glb     — Truck LOD1
│       ├── kavyatruck-lod2.glb     — Truck LOD2
│       ├── cities/                 — City images for network map page
│       ├── clients/                — Client logo PNGs (27 logos)
│       └── manifest.json           — Asset manifest
└── src/
    ├── main.jsx                — ReactDOM.createRoot, Router
    ├── App.jsx                 — Home page (3D scene host + scroll logic)
    ├── OverlayUI.jsx           — Scroll-driven HTML overlay (10 sections)
    ├── CameraRig.jsx           — (legacy, unused)
    ├── CinematicWorld.jsx      — (legacy, unused)
    ├── NetworkMap.jsx          — (legacy, unused)
    ├── World.jsx               — (legacy, unused)
    ├── Truck.jsx               — (legacy, unused)
    ├── styles.css              — Home page + overlay styles
    ├── pages.css               — About/Services/Fleet/etc. page styles
    ├── components/
    │   ├── Header.jsx          — Navigation bar (used in about pages)
    │   ├── Footer.jsx          — Footer (used in about pages)
    │   ├── PageLayout.jsx      — Layout wrapper for about pages
    │   ├── PerfHUD.jsx         — Dev performance overlay (FPS, draw calls)
    │   └── AnimatedComponents.jsx — Reusable animated UI primitives
    ├── pages/
    │   ├── SinglePage.jsx      — MASTER about page (fleet/clients/services/contact all here)
    │   ├── About.jsx           — Standalone about route
    │   ├── Services.jsx        — Standalone services route
    │   ├── Fleet.jsx           — Standalone fleet route
    │   ├── GetQuote.jsx        — Quote form
    │   ├── Testimonials.jsx    — Testimonials
    │   ├── Contact.jsx         — Contact page
    │   ├── Privacy.jsx         — Privacy policy
    │   ├── Refund.jsx          — Refund policy
    │   └── Terms.jsx           — Terms of service
    ├── hooks/
    │   └── useAnimations.js    — (legacy, unused)
    ├── engine/                 — ALL Babylon.js engine code
    │   ├── BabylonCanvas.jsx   — React wrapper that boots the engine
    │   ├── config.js           — MASTER CONFIG (all tunable values)
    │   ├── audio/
    │   │   └── audioEngine.js  — Procedural ambient audio (Web Audio API)
    │   ├── config/
    │   │   └── assetManifest.js — Tier-to-GLB-path mapping
    │   ├── scene/
    │   │   ├── createScene.js      — MASTER ASSEMBLER
    │   │   ├── road.js             — Procedural road + lane markings
    │   │   ├── terrain.js          — Ground plane with height noise
    │   │   ├── mountains.js        — JS procedural mountain fallback
    │   │   ├── sky.js              — Custom GLSL sky shader
    │   │   ├── truck.js            — GLB loader + truck animations
    │   │   ├── lighting.js         — Sun + hemisphere + shadow generator
    │   │   ├── postprocessing.js   — ACES tone map + DOF + bloom + grain
    │   │   ├── atmosphere.js       — Speed lines + ground dust + sun glow
    │   │   ├── scrollCamera.js     — 18-keyframe cinematic camera
    │   │   ├── worldMotion.js      — Scroll → world speed → motion illusion
    │   │   └── cinematicDirector.js — Per-frame orchestrator (all cinematic fx)
    │   └── utils/
    │       ├── checkAssets.js      — Asset availability probe
    │       ├── loadManifest.js     — Public manifest.json loader
    │       ├── performanceMonitor.js — Rolling FPS telemetry
    │       └── tierController.js   — Runtime adaptive quality downgrade
    └── world/                  — (alternative implementation, unused in production)
        └── ...
```

---

## How the 3D Scene Works — Full Data Flow

### 1. Boot Sequence

```
main.jsx
  └── <Router> → <App>
        └── lazy(() => import('./engine/BabylonCanvas'))  ← deferred, not in initial JS
              └── createScene(engine, canvas, deviceTier)
                    ├── setupLighting()
                    ├── setupSky()
                    ├── setupRoad()
                    ├── setupTerrain()
                    ├── loadEnvironment()     ─┐ parallel
                    ├── setupTruck()          ─┘
                    ├── setupScrollCamera()
                    ├── setupPostProcessing()
                    ├── setupAtmosphere()
                    ├── setupCinematicDirector()
                    ├── setupWorldMotion()
                    └── engine.runRenderLoop(updateFrame)
```

`BabylonCanvas` is React `lazy()`-loaded, so the initial page paint is only ~125 KB gzip (shell + React). The 1.4 MB Babylon chunk downloads in the background.

### 2. Every Frame (60fps)

```
updateFrame(progress, dt)
  ├── updateWorld(progress, dt)       — moves dashes/terrain/mountains
  ├── speedNorm = getSpeedNorm()      — 0→1 normalized world speed
  ├── worldSpeed = getWorldSpeed()    — raw units/sec
  ├── updateTruck(speedNorm, dt, worldSpeed, progress)  — body sway/bounce/wheels/exhaust
  ├── truck.position.z = progress * 60   — drives truck forward through scene
  ├── updateCamera(progress, dt, speedNorm)   — interpolates 18 keyframes
  ├── updateCinematic(progress, dt)   — sun angle, exposure, color temp, DOF
  ├── skyMat.setFloat('uTime', skyTime)  — star twinkle animation
  ├── CSS: --speed-norm, --progress
  └── audio.update(speedNorm, progress)
```

### 3. Scroll → Progress

In `App.jsx`:
- `rawProgress = scrollY / maxScroll` (instant, per `scroll` event)
- `smoothProgress` spring-lerps toward raw (stiffness=8, damping=4 desktop; 12/5 mobile)
- `progressRef.current = smoothProgress` → read by BabylonCanvas render loop every frame
- GSAP `ScrollTrigger` fires `setSection()` only on section boundary crossings (~10 total re-renders)

The page has `SCROLL_PAGES = 12` virtual pages of height (12 × viewport height = very long scroll).

### 4. World Motion Illusion

The **truck stays put** at `(0, 0.1, 0)` + forward offset `progress × 60`.  
The **world scrolls backward** around it:

| Object | Moves | Speed |
|---|---|---|
| Road asphalt surface | No (static, uniform) | – |
| Solid lane lines | No | – |
| Dashed lane lines | Yes — modular Z wrap | 100% world speed |
| Terrain ground | Yes | 30% world speed |
| Mountains | Yes | 5% world speed (deep parallax) |
| Billboards | Yes | 30% world speed |
| Environment GLB decor | No (frozen) | – |

World speed is computed from scroll velocity × cinematic speed curve (14 keypoints defining fast/slow zones).

---

## Device Tiers

Three quality presets auto-detected at startup:

| Tier | Condition | Rendering |
|---|---|---|
| `low` | Mobile UA, maxTexture ≤ 4096, or saveData | Hardware scale 1.5×, no DOF/chromatic/sharpen, low shadows, 1024px shadow map |
| `balanced` | Desktop without high-end GPU flag | Hardware scale 1.25×, bloom at 0.15, medium shadows, 1536px shadow map |
| `high` | Desktop, maxTexture > 8192 | Hardware scale 1.0×, full DOF + chromatic + FXAA + sharpen, 2048px shadow map |

**Runtime adaptive downgrade**: `tierController.js` monitors a rolling 60-frame FPS window. If average FPS drops below threshold for multiple windows, it steps down one tier (with 8s cooldown between changes).

---

## Camera System — 18 Cinematic Keyframes

`scrollCamera.js` uses `UniversalCamera` positioned manually in spherical coordinates.

Each keyframe: `{ t, alpha, beta, radius, targetY, fov }`
- `alpha` = horizontal angle (radians, ArcRotate convention)
- `beta` = vertical angle (0 = overhead, π/2 = horizon)
- `radius` = distance from truck
- Camera position = truck.position + spherical(alpha, beta, radius)
- Spring physics with stiffness=8.0, damping=0.72, mass=1.0 for smooth follow

| scroll t | Section | Camera Position |
|---|---|---|
| 0.00 | Intro | Far behind, wide (radius 42) |
| 0.04 | Approach | Zoom in from rear-left (radius 24) |
| 0.08 | Hero reveal | Low ground-level behind (radius 11) |
| 0.14 | 3/4 Beauty | Front-right showcase (radius 12) |
| 0.22 | Branding | Right 3/4 close (radius 8) |
| 0.35 | Front Hero | Low front dramatic (radius 9) |
| 0.42 | Aerial | High gods-eye (radius 24) |
| 0.53 | Turbo | Tight rear chase (radius 8) |
| 0.58 | Speed rush | FOV 0.58 — compressed |
| 0.65 | Left tracking | Rear-left 3/4 (radius 14) |
| 0.72 | Left branding | Left 3/4 close (radius 9) |
| 0.80 | Wide cinematic | Golden hour (radius 22) |
| 0.88 | Sunset low | Dramatic silhouette (radius 11) |
| 0.95 | Pull-away | Wide pull back (radius 18) |
| 1.00 | End hold | Establishing wide (radius 32) |

**Turbo sequence** (`t=0.50–0.62`): camera shake amplified 8×, FOV compressed, exhaust particle rate 4× higher.

---

## 3D Assets

### Truck (`kavyatruck.opt.glb`)
- Loaded by `setupTruck()` in `truck.js`
- Positioned at `[0, 0.1, 0]`, scale `8.0`
- Materials forced to `PBRMATERIAL_OPAQUE` (no alpha blending)
- Wheels detected by name (`wheel`, `tire`, `tyre`) → dark matte rubber PBR
- Rims detected by name (`rim`, `hub`, `spoke`) → chrome metallic PBR
- Truck body → moderate PBR (roughness min 0.30, metallic max 0.60)
- Two SpotLight headlights parented to truck
- Dedicated `truckSpot` overhead spotlight (always on, `includedOnlyMeshes=truck`)
- Cool blue rim light from `-X` direction (makes truck pop from background)
- Exhaust particle system: 100 particles, soft radial gradient texture
- Tire dust particles: 60 particles, activated above `speedNorm > 0.3`
- Intro animation: truck rushes from Z=−120 to origin over 2.8 seconds

### Environment (`kavya-env.meshopt.glb`)
- Loaded by `loadEnvironment()` in `createScene.js`
- Mountains → extracted for parallax scrolling (5% of world speed)
- Decorations (poles, rocks, grass, road signs) → kept for visual richness
- Poles near origin (≤30 world units) → **disposed** to prevent camera clipping
- All decoration materials forced to `PBRMATERIAL_OPAQUE` — prevents transparent render queue issues
- Meshes with >10 instances of same material → `Mesh.MergeMeshes()` for fewer draw calls
- All frozen with `freezeWorldMatrix()` after load (static world objects)
- Giant pillar artifacts (y>8, footprint<6, aspect>2.5) disposed automatically

### Road (procedural, `road.js`)
- PBR asphalt at Y=0.08 (above terrain at Y=0)
- 400 units long, 12 units wide
- Solid center lines (static, always visible)
- Yellow edge lines (static)
- Dashed lane lines (scroll via modular Z wrap — the motion illusion)
- Road shoulders (brown edge strips)
- All renderingGroupId=0

### Terrain (procedural, `terrain.js`)
- 600×600 ground plane, 128 subdivisions (64 on mobile)
- fBm noise (4 octaves) for subtle height variation
- Road corridor (|x| < 8) clamped flat so road doesn't poke through
- Warm earth brown PBR material

### Sky (GLSL shader, `sky.js`)
- Custom `Effect` / `ShaderMaterial` dome mesh
- Vertex shader: `uv` based on worldPosition
- Fragment: top color → mid color → horizon color gradient + sun glow disk + star field
- `uTime` uniform updated each frame for star twinkle
- `uSunDirection` updated by cinematic director as day progresses

---

## Post-Processing Stack

`DefaultRenderingPipeline` + standalone `GlowLayer`:

| Effect | Tier |
|---|---|
| ACES filmic tone mapping | All |
| Exposure (0.75–0.95, scroll-animated) | All |
| Contrast 1.18 | All |
| Vignette | All |
| Film grain (static, intensity 0.035) | All |
| FXAA | Balanced + High |
| Bloom | Balanced + High |
| Depth of Field | High only |
| Chromatic aberration | High only |
| Sharpen | High only |
| Heat shimmer (PostProcess, 0.5 res) | High only |

`GlowLayer`: 256px (balanced), 512px (high) — emissive surfaces (sun mesh, speed lines).

`cinematicDirector.js` updates these every frame:
- Exposure: rises at sunset toward progress=0.85, dims at night
- DOF focus distance: tracks distance from camera to truck
- Chromatic aberration: strength tied to `speedNorm`
- Sun direction: arcs from morning angle to sunset over scroll progress
- Sky colors: interpolate day→sunset→night based on progress
- Fog color: matches sky horizon color for natural depth fade

All Color3/Vector3 objects used in `cinematicDirector` are **pre-allocated at module level** and mutated in place (`.set()`, `.copyFrom()`, `Color3.LerpToRef()`) — zero per-frame garbage collection.

---

## OverlayUI — 10 Scroll Sections

The HTML UI on top of the canvas (in `OverlayUI.jsx`). Re-renders only on section boundary crossing. Individual fine-grained animations run via `requestAnimationFrame` + direct DOM mutation.

| Section id | Name | Progress Range | Content |
|---|---|---|---|
| 0 | hero | 0.00–0.08 | Logo, tagline, scroll hint, animated counters |
| 1 | about | 0.08–0.18 | Company story, GSTIN, est. 2004 |
| 2 | services | 0.18–0.29 | Service cards (FTL, LTL, ODC, etc.) |
| 3 | fleet | 0.29–0.39 | Fleet types list |
| 4 | industries | 0.39–0.48 | Industries served |
| 5 | clients | 0.48–0.57 | Client logos |
| 6 | network | 0.57–0.67 | Route map |
| 7 | why | 0.67–0.77 | Why choose Kavya |
| 8 | locations | 0.77–0.87 | Office locations |
| 9 | cta | 0.87–1.00 | CTA + final logo reveal |

Opacity fades: each section uses a 4-point `[fadeIn_start, fadeIn_end, fadeOut_start, fadeOut_end]` range. Sections never overlap — one is fully invisible before the next appears.

---

## Page Navigation (Home ↔ About Pages)

Two-route setup:
- `/` → `App.jsx` (3D scrolling homepage)
- `/about`, `/services`, `/fleet`, etc. → `SinglePage.jsx` (static about pages)

### Home → About transition
1. `setExitingToPages(true)` — dark `#060810` overlay fades in (0.5s)
2. After 520ms: `navigate('/about')`  
3. No React `position:fixed` layout jump because overlay is applied before navigation

### About → Home transition
1. `setExitingToHome(true)` in `SinglePage.jsx` — dark overlay appears (0.4s)
2. After 420ms: `navigate('/', { state: { fromAboutScrollUp: true } })`
3. `window.__kavyaSkipLoaderOnce = true` — skips the loading animation
4. App detects `fromAboutScrollUp`, sets `enterFromAboutOverlay=true`
5. Suspense fallback = dark `#060810` div (prevents white flash while Babylon chunk loads)
6. Once `handleReady()` fires: `setEnterFromAboutOverlay(false)` after 80ms → dark overlay fades out

---

## Performance Optimizations

### Bundle Size
| Chunk | Raw | Gzip |
|---|---|---|
| babylon | 6,356 KB | 1,383 KB |
| react-vendor | 163 KB | 53 KB |
| gsap | 114 KB | 45 KB |
| app shell | 101 KB | 27 KB |

**First paint** only blocks on app shell (27 KB gzip). BabylonCanvas is `lazy()`-loaded.

### Runtime GPU
- Hardware scaling: 1.0× high / 1.25× balanced / 1.5× low
- Static meshes: `freezeWorldMatrix()` after load (skips transform recalc)
- `scene.freezeMaterials()` after setup
- Only dashed lines + terrain + mountains update position each frame
- Speed lines: capped at 8 (was 30)
- Ground dust: 80 particles (was 300)
- Exhaust: 100 particles (was 300)
- Tire dust: 60 particles (was 150)
- Headlight beam dust: removed entirely
- Dust motes (200): removed
- Fog billboard planes: removed (scene fog handles depth for free)
- Shadow blur kernel: updated every 6 frames only (not every frame)
- `scene.alwaysSelectAsActiveMesh` removed from all meshes
- `GlowLayer` texture: 256px balanced, 512px high (was always 512px)
- Heat shimmer: 0.5 render resolution, high tier only, gated on intensity > 0.01

### Rendering Correctness (Pole z-fighting)
All meshes are in `renderingGroupId = 0`. The GPU's standard depth buffer (`LEQUAL`) handles all front/back ordering. Previously used groups 1/2/3 which caused undefined draw order within a group.

GLB materials from `kavya-env.glb` are forced to `PBRMATERIAL_OPAQUE` (including `MultiMaterial.subMaterials`) so no decoration mesh enters the transparent render queue (which renders after opaques, depth-write OFF).

---

## Audio System (`audioEngine.js`)

Procedural Web Audio API sound engine, no audio files loaded.

- `OscillatorNode`-based engine rumble (low frequency drone)
- Frequency and gain tied to `speedNorm`
- Wind noise via `BiquadFilterNode` (pink noise approximation)
- Initializes on first user click (browser autoplay policy)

---

## Asset Pipeline (`scripts/optimizeAssets.mjs`)

Runs as `prebuild` step (before `vite build`):
- Uses `@gltf-transform/cli` to apply meshopt compression
- Flags: `--truck-only`, `--env-only`, `--force`, `--skip-existing`
- Output: `*.opt.glb`, `*.meshopt.glb` variants
- Skips recompressing if output is already newer than source

---

## Key Config Values (tunable in `src/engine/config.js`)

```js
CAMERA.ORBIT_RADIUS = 14        // base camera distance from truck
TRUCK.SCALE = 8.0               // truck size multiplier
TRUCK.INTRO_DURATION = 2.8      // seconds for intro animation
TRUCK.INTRO_START_Z = -120      // intro start distance
TRUCK.TURBO_PROGRESS_START = 0.50  // scroll % when turbo begins
TRUCK.TURBO_PROGRESS_END = 0.62    // scroll % when turbo ends
WORLD.MAX_SPEED = 35            // maximum world scroll speed (units/sec)
ROAD.Y = 0.08                   // road height above terrain
SCROLL_PAGES = 12               // page heights of scroll (in App.jsx)
```

---

## Known Behaviors

- **Truck position**: Physically advances `progress × 60` units in Z as you scroll. Scrolling back moves it back. No accumulation.
- **GLB poles near origin**: All decoration meshes within 30 world units of Z=0 are disposed on load to prevent them overlapping the camera.
- **Intro animation**: 2.8s cinematic zoom from Z=−120. During intro, `window._introComplete = false`. Truck forward movement only applies after intro.
- **Page reload**: No longer triggers. The old `truckDriveZ >= DRIVE_LIMIT → reload` logic was removed.
- **SceneOptimizer**: Runs on `balanced` and `low` tiers only (not high). May adjust culling/rendering.
- **`scene.freezeMaterials()`**: Truck materials are unfrozen immediately after (`material.unfreeze()`). Road material also unfrozen for cinematic director roughness animation.

---

## Company Data (Kavya Transports)

- **Founded**: 2004
- **HQ**: Tirunelveli, Tamil Nadu
- **Phone**: +91 90472 44000
- **Email**: info@kavyatransports.com
- **GSTIN**: 33AABFK3563R1ZI
- **Slogan**: "Life on Wheels"
- **Fleet**: 750kg light vans → 35T+ low-bed trailers (8 vehicle categories)
- **Clients** (27): Amazon, TVS, Coca-Cola, Britannia, KPR Mill, Walkaroo, Propel, Elgi, + others
- **Services**: FTL, LTL, ODC transport, warehousing, last-mile
