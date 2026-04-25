// [PERF-FIX] Runtime tier-to-asset manifest for automatic GLB variant selection.
export function getAssetPaths(tier) {
  const envOptimized = '/assets/kavya-env.meshopt.glb'
  const envFallback = '/assets/kavya-env.glb'
  const truckOptimized = '/assets/kavyatruck.opt.glb'
  const truckLod1 = '/assets/kavyatruck-lod1.glb'
  const truckLod2 = '/assets/kavyatruck-lod2.glb'

  if (tier === 'low') {
    return {
      truck: truckOptimized,
      env: envOptimized,
      truckLod1,
      truckLod2,
      fallbackTruck: truckOptimized,
      fallbackEnv: envFallback,
    }
  }

  return {
    truck: truckOptimized,
    env: envOptimized,
    truckLod1,
    truckLod2,
    fallbackTruck: truckOptimized,
    fallbackEnv: envFallback,
  }
}
