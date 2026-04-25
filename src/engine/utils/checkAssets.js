// [PERF-FIX] Fast HEAD checks with timeout to validate optimized asset availability.
import { loadAssetManifest } from './loadManifest'

function checkOne(path, timeoutMs = 2000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return fetch(path, {
    method: 'HEAD',
    signal: controller.signal,
    cache: 'no-store',
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => clearTimeout(timer))
}

export async function checkAssetAvailability(paths) {
  const manifest = await loadAssetManifest()
  if (manifest?.byPath) {
    const hasManifestPath = (assetPath) => {
      if (!assetPath) return false
      const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
      return Boolean(manifest.byPath[normalized])
    }

    return {
      truck: hasManifestPath(paths.truck),
      env: hasManifestPath(paths.env),
      truckLod1: hasManifestPath(paths.truckLod1),
      truckLod2: hasManifestPath(paths.truckLod2),
    }
  }

  const [truck, env, truckLod1, truckLod2] = await Promise.all([
    checkOne(paths.truck, 2000),
    checkOne(paths.env, 2000),
    checkOne(paths.truckLod1, 2000),
    checkOne(paths.truckLod2, 2000),
  ])

  return { truck, env, truckLod1, truckLod2 }
}
