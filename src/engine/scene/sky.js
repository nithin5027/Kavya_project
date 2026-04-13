/**
 * SKY — Procedural Gradient Dome (no HDR)
 * ════════════════════════════════════════
 * Large hemisphere with a custom shader that blends:
 *   top   → deep blue sky
 *   mid   → hazy atmospheric blue
 *   bottom→ warm horizon glow (golden hour)
 *
 * Cinematic reasoning:
 * - Gradient sky avoids flat skybox seams
 * - Warm horizon band sells golden-hour mood instantly
 * - Large sun glow disc at the light direction angle
 * - No HDR file = zero network cost, deterministic look
 */
import {
  MeshBuilder, ShaderMaterial, Effect, Color3, Vector3, Mesh,
} from '@babylonjs/core'
import { SKY, LIGHTING, FOG } from '../config'

/* ── Register custom shader inline ── */
const SKY_VERTEX = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  uniform mat4 worldViewProjection;
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = position;
    gl_Position = worldViewProjection * vec4(position, 1.0);
  }
`

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uTopColor;
  uniform vec3 uMidColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunGlow;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uTime;
  uniform float uDayPhase;
  varying vec3 vWorldPos;

  // Hash for stars
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // UV from world direction
  vec2 dirToUV(vec3 d) {
    return vec2(atan(d.x, d.z) / 6.2832 + 0.5, d.y * 0.5 + 0.5);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    float height = dir.y;

    // 3-stop gradient: horizon → mid → top
    vec3 sky = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.25, height));
    sky = mix(sky, uTopColor, smoothstep(0.25, 0.7, height));

    // Sun glow disc — soft bloom around sun direction
    float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
    float sunDisc = pow(sunDot, 32.0) * 0.8;
    float sunHalo = pow(sunDot, 4.0) * 0.25;
    sky += uSunGlow * (sunDisc + sunHalo);

    // Sunset horizon glow band — warm band at sunset (dayPhase > 0.6)
    float sunsetBlend = smoothstep(0.5, 0.8, uDayPhase);
    float horizonBand = smoothstep(0.15, 0.0, height) * smoothstep(-0.05, 0.02, height);
    vec3 sunsetGlow = vec3(0.95, 0.45, 0.15) * horizonBand * sunsetBlend * 0.3;
    sky += sunsetGlow;

    // Horizon haze band
    float hazeBlend = 1.0 - smoothstep(-0.02, 0.15, height);
    sky = mix(sky, uFogColor, hazeBlend * 0.5);

    // Sun disc — visible in day phase
    vec2 vUV = dirToUV(dir);
    vec2 sunDir2D = normalize(vec2(0.35, 0.18));
    float sunDist = distance(vUV, sunDir2D);
    float sunDiscVal = 1.0 - smoothstep(0.02, 0.025, sunDist);
    float corona = exp(-sunDist * 12.0) * 0.5;
    float sunVis = (1.0 - min(1.0, uDayPhase * 2.5));
    sky += (vec3(1.0, 0.98, 0.85) * sunDiscVal + vec3(1.0, 0.85, 0.5) * corona) * sunVis;

    // Sunset sun (lower, redder, larger)
    float sunsetPhase = max(0.0, min(1.0, (uDayPhase - 0.3) / 0.4));
    vec2 sunsetDir2D = vec2(0.5, 0.05);
    float sunsetDist = distance(vUV, sunsetDir2D);
    float sunsetDiscVal = exp(-sunsetDist * 18.0) * sunsetPhase;
    sky += vec3(1.0, 0.35, 0.05) * sunsetDiscVal * 1.8;

    // Stars — appear when sky is dark (night mode)
    float darkness = 1.0 - length(sky);
    if (darkness > 0.3 && height > 0.05) {
      vec2 starUV = dir.xz / (height + 0.01) * 50.0;
      float star = hash21(floor(starUV));
      float twinkle = sin(uTime * 2.0 + star * 100.0) * 0.3 + 0.5
                    + sin(uTime * 3.7 + star * 57.0) * 0.2;
      if (star > 0.983) {
        float brightness = (star - 0.983) * 58.0 * twinkle * darkness;
        sky += vec3(brightness * 0.9, brightness * 0.95, brightness);
      }
    }

    // Below horizon
    if (height < 0.0) {
      sky = mix(uFogColor * 0.6, sky, smoothstep(-0.1, 0.0, height));
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`

export function setupSky(scene) {
  // Register shader store
  Effect.ShadersStore['skyGradientVertexShader'] = SKY_VERTEX
  Effect.ShadersStore['skyGradientFragmentShader'] = SKY_FRAGMENT

  // Large sphere, rendered inside-out (BackSide)
  const skyDome = MeshBuilder.CreateSphere('skyDome', {
    diameter: SKY.SIZE * 2,
    segments: 32,
  }, scene)
  skyDome.isPickable = false
  skyDome.infiniteDistance = true
  skyDome.renderingGroupId = 0

  const sunDir = new Vector3(
    -LIGHTING.SUN.DIRECTION[0],
    -LIGHTING.SUN.DIRECTION[1],
    -LIGHTING.SUN.DIRECTION[2]
  ).normalize()

  const skyMat = new ShaderMaterial('skyMat', scene, {
    vertex: 'skyGradient',
    fragment: 'skyGradient',
  }, {
    attributes: ['position'],
    uniforms: [
      'worldViewProjection', 'uTopColor', 'uMidColor', 'uHorizonColor',
      'uSunGlow', 'uSunDir', 'uFogColor', 'uTime', 'uDayPhase',
    ],
  })

  skyMat.setColor3('uTopColor', new Color3(SKY.TOP_COLOR[0], SKY.TOP_COLOR[1], SKY.TOP_COLOR[2]))
  skyMat.setColor3('uMidColor', new Color3(SKY.MID_COLOR[0], SKY.MID_COLOR[1], SKY.MID_COLOR[2]))
  skyMat.setColor3('uHorizonColor', new Color3(SKY.HORIZON_COLOR[0], SKY.HORIZON_COLOR[1], SKY.HORIZON_COLOR[2]))
  skyMat.setColor3('uSunGlow', new Color3(SKY.SUN_GLOW_COLOR[0], SKY.SUN_GLOW_COLOR[1], SKY.SUN_GLOW_COLOR[2]))
  skyMat.setVector3('uSunDir', sunDir)
  skyMat.setColor3('uFogColor', new Color3(FOG.COLOR[0], FOG.COLOR[1], FOG.COLOR[2]))
  skyMat.setFloat('uTime', 0)
  skyMat.setFloat('uDayPhase', 0)
  skyMat.backFaceCulling = false
  skyMat.disableDepthWrite = true

  skyDome.material = skyMat

  return { skyDome, skyMat }
}
