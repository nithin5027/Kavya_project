/**
 * SKY — Cinematic HDR dome with day→sunset→night transitions (V2)
 * ═══════════════════════════════════════════════════════════════
 * Multi-layer gradient, atmospheric scattering, volumetric clouds,
 * sun disc + halo, star field.
 *
 * V2: All sky colors now animate with scroll progress via lerpColor3.
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../config'
import { useProgress, lerpColor3, lerpValue3, _color } from '../core'

/* ── Pre-allocated color triplets for each uniform ── */
const _topDay = new THREE.Color(COLORS.SKY_TOP_DAY)
const _topSunset = new THREE.Color(COLORS.SKY_TOP_SUNSET)
const _topNight = new THREE.Color(COLORS.SKY_TOP_NIGHT)
const _midDay = new THREE.Color(COLORS.SKY_MID_DAY)
const _midSunset = new THREE.Color(COLORS.SKY_MID_SUNSET)
const _midNight = new THREE.Color(COLORS.SKY_MID_NIGHT)
const _botDay = new THREE.Color(COLORS.SKY_BOT_DAY)
const _botSunset = new THREE.Color(COLORS.SKY_BOT_SUNSET)
const _botNight = new THREE.Color(COLORS.SKY_BOT_NIGHT)
const _sunDay = new THREE.Color(COLORS.SUN_DAY)
const _sunSunset = new THREE.Color(COLORS.SUN_SUNSET)
const _sunNight = new THREE.Color(COLORS.SUN_NIGHT)

export default function Sky() {
  const meshRef = useRef()
  const progressRef = useProgress()

  const skyMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunPosition: { value: new THREE.Vector3(100, 80, -100) },
        uTopColor: { value: new THREE.Color(COLORS.SKY_TOP_DAY) },
        uMidColor: { value: new THREE.Color(COLORS.SKY_MID_DAY) },
        uBottomColor: { value: new THREE.Color(COLORS.SKY_BOT_DAY) },
        uSunColor: { value: new THREE.Color(COLORS.SUN_DAY) },
        uCloudColor: { value: new THREE.Color('#ffffff') },
        uCloudDensity: { value: 0.10 },
        uStarVisibility: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        void main() {
          vPosition = position;
          vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunPosition;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunColor;
        uniform vec3 uCloudColor;
        uniform float uCloudDensity;
        uniform float uStarVisibility;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;

        vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
        vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
        float snoise(vec3 v){
          const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
          vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
          vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
          vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
          vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
          i=mod289(i);
          vec4 p=permute(permute(permute(i.z+vec4(0,i1.z,i2.z,1))+i.y+vec4(0,i1.y,i2.y,1))+i.x+vec4(0,i1.x,i2.x,1));
          float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
          vec4 j=p-49.0*floor(p*ns.z*ns.z);
          vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
          vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
          vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
          vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;
          vec4 sh=-step(h,vec4(0.0));
          vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
          vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
          vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
          p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
          vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
          m=m*m;
          return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
        }

        float fbm(vec3 p){
          float v=0.0,amp=0.5,freq=1.0;
          for(int i=0;i<5;i++){v+=amp*snoise(p*freq);amp*=0.5;freq*=2.0;}
          return v;
        }
        float fbmTurbulence(vec3 p){
          float v=0.0,amp=0.5,freq=1.0;
          for(int i=0;i<5;i++){v+=amp*abs(snoise(p*freq));amp*=0.5;freq*=2.0;}
          return v;
        }

        float hash(vec3 p){return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);}

        vec3 atmosphericScatter(vec3 viewDir, vec3 sunDir, float height) {
          float sunAngle = max(0.0, dot(viewDir, sunDir));
          vec3 rayleigh = vec3(0.3, 0.5, 1.0) * pow(1.0 - abs(height), 2.0) * 0.15;
          float mie = pow(sunAngle, 5.0) * 0.3;
          vec3 mieColor = mix(uSunColor, vec3(1.0, 0.8, 0.6), 0.5) * mie;
          return rayleigh + mieColor;
        }

        void main(){
          vec3 viewDir = normalize(vPosition);
          float height = viewDir.y;

          // Sky gradient — 3-band
          vec3 skyColor;
          if (height > 0.0) {
            float topMix = pow(height, 0.35);
            skyColor = mix(uMidColor, uTopColor, topMix);
          } else {
            float botMix = min(1.0, -height * 3.0);
            skyColor = mix(uMidColor, uBottomColor, botMix);
          }

          // Atmospheric scattering
          vec3 sunDir = normalize(uSunPosition);
          skyColor += atmosphericScatter(viewDir, sunDir, height);

          // Warm horizon band
          float horizonBand = pow(1.0 - abs(height), 8.0);
          vec3 horizonWarm = mix(uSunColor * 0.6, vec3(1.0, 0.7, 0.4), 0.5);
          skyColor += horizonWarm * horizonBand * 0.2;

          // Sun disc + glow + halo + corona
          float sunAngle = dot(viewDir, sunDir);
          float sunDisc = smoothstep(0.9995, 0.9998, sunAngle);
          float sunGlow = pow(max(0.0, sunAngle), 12.0) * 0.5;
          float sunHalo = pow(max(0.0, sunAngle), 3.0) * 0.15;
          float corona = smoothstep(0.998, 0.9995, sunAngle) * (1.0 - sunDisc) * 0.4;
          skyColor += uSunColor * (sunDisc + sunGlow + sunHalo + corona);

          // Volumetric clouds
          if (height > -0.1) {
            vec3 cloudPos = viewDir * 8.0 + vec3(uTime * 0.015, 0.0, uTime * 0.008);
            float cloudNoise = fbm(cloudPos) * 0.5 + 0.5;
            cloudNoise = smoothstep(0.25, 0.7, cloudNoise);
            float cloudDetail = fbm(cloudPos * 2.5 + vec3(uTime * 0.03, 0.0, 0.0)) * 0.5 + 0.5;
            cloudNoise *= 0.7 + cloudDetail * 0.3;

            vec3 cirrusPos = viewDir * 12.0 + vec3(uTime * 0.025, 0.0, uTime * 0.012);
            float cirrus = fbmTurbulence(cirrusPos) * 0.5;
            cirrus = smoothstep(0.3, 0.6, cirrus) * smoothstep(0.1, 0.5, height) * 0.15;

            float cloudShadow = fbm(cloudPos + vec3(0.15, 0.08, 0.0)) * 0.5 + 0.5;
            vec3 cloudShaded = mix(uCloudColor * 0.6, uCloudColor, cloudShadow);
            float cloudSunlight = pow(max(0.0, dot(viewDir, sunDir) + 0.5), 2.5);
            cloudShaded += uSunColor * cloudSunlight * 0.25;
            float cloudBase = smoothstep(0.2, 0.05, height);
            cloudShaded *= 1.0 - cloudBase * 0.2;
            float cloudMask = cloudNoise * uCloudDensity * smoothstep(-0.1, 0.25, height);
            skyColor = mix(skyColor, cloudShaded, cloudMask);
            skyColor = mix(skyColor, uCloudColor * 0.9, cirrus);
          }

          // Star field
          if (height > 0.1) {
            vec3 starGrid = floor(viewDir * 300.0);
            float starBright = hash(starGrid);
            float starMask = step(0.998, starBright);
            float twinkle = sin(uTime * 2.0 + starBright * 100.0) * 0.5 + 0.5;
            float starFade = smoothstep(0.1, 0.3, height);
            skyColor += vec3(1.0, 0.95, 0.9) * starMask * twinkle * uStarVisibility * starFade * 0.8;
          }

          // Horizon haze
          float horizonHaze = pow(1.0 - abs(height), 5.0) * 0.25;
          skyColor = mix(skyColor, uSunColor * 0.7 + vec3(0.1, 0.08, 0.06), horizonHaze);

          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
    })
  }, [])

  // Animate ALL sky uniforms with scroll progress
  useFrame(({ clock }) => {
    const t = progressRef.current
    skyMaterial.uniforms.uTime.value = clock.elapsedTime

    // Sky gradient colors
    lerpColor3(_topDay, _topSunset, _topNight, t)
    skyMaterial.uniforms.uTopColor.value.copy(_color)
    lerpColor3(_midDay, _midSunset, _midNight, t)
    skyMaterial.uniforms.uMidColor.value.copy(_color)
    lerpColor3(_botDay, _botSunset, _botNight, t)
    skyMaterial.uniforms.uBottomColor.value.copy(_color)

    // Sun color + position
    lerpColor3(_sunDay, _sunSunset, _sunNight, t)
    skyMaterial.uniforms.uSunColor.value.copy(_color)
    const sunY = lerpValue3(60, 15, -20, t)
    const sunX = lerpValue3(100, 80, 60, t)
    skyMaterial.uniforms.uSunPosition.value.set(sunX, sunY, -100)

    // Cloud density reduces at night
    skyMaterial.uniforms.uCloudDensity.value = lerpValue3(0.10, 0.18, 0.06, t)

    // Star visibility increases towards night
    skyMaterial.uniforms.uStarVisibility.value = lerpValue3(0.0, 0.1, 1.0, t)
  })

  return (
    <mesh ref={meshRef} material={skyMaterial} renderOrder={-1000}>
      <sphereGeometry args={[200, 64, 64]} />
    </mesh>
  )
}
