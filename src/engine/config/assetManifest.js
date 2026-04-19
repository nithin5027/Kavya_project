// [PERF-FIX] Runtime tier-to-asset manifest for automatic GLB variant selection.
export function getAssetPaths(tier) {
  const envOptimized = '/assets/kavya-env.meshopt.glb'
  const envFallback = '/assets/kavya-env.glb'
  const truckOptimized = '/assets/kavyatruck.opt.glb'
  // Mobile-safe truck: kavyatruck-mobile.glb is 3.6MB vs kavyatruck.opt.glb at 48MB.
  // Mobile (low tier) uses this to prevent OOM crashes and timeout failures.
  const truckMobile = '/assets/kavyatruck-mobile.glb'
  const truckLod1 = '/assets/kavyatruck-lod1.glb'
  const truckLod2 = '/assets/kavyatruck-lod2.glb'

  if (tier === 'low') {
    return {
      truck: truckMobile,           // 6MB — mobile-safe
      env: envOptimized,            // 1.1MB — meshopt compressed
      truckLod1,
      truckLod2,
      fallbackTruck: truckMobile,
      fallbackEnv: envFallback,
    }
  }

  return {
    truck: truckOptimized,
    env: envOptimized,
    truckLod1,
    truckLod2,
    fallbackTruck: truckMobile,     // fallback to 6MB if 48MB fails
    fallbackEnv: envFallback,
  }
}
