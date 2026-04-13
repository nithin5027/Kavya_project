const EXPECTED_VARIANTS = [
  '/assets/kavyatruck.opt.glb',
  '/assets/kavyatruck-lod1.glb',
  '/assets/kavyatruck-lod2.glb',
  '/assets/kavya-env.meshopt.glb',
]

let manifestPromise = null

function normalizePath(p) {
  if (!p) return ''
  return p.startsWith('/') ? p : `/${p}`
}

function indexManifestByPath(manifest) {
  const byPath = {}
  const files = Array.isArray(manifest?.files) ? manifest.files : []
  files.forEach((entry) => {
    const normalized = normalizePath(entry?.path)
    if (normalized) {
      byPath[normalized] = entry
    }
  })
  return byPath
}

function warnMissingVariants(byPath) {
  const missing = EXPECTED_VARIANTS.filter((variant) => !byPath[variant])
  if (missing.length > 0) {
    console.warn('[Kavya Assets] Manifest loaded but missing expected variants:', missing)
  }
}

async function fetchManifest() {
  try {
    const response = await fetch('/assets/manifest.json', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }

    const manifest = await response.json()
    if (!manifest || !Array.isArray(manifest.files)) {
      console.warn('[Kavya Assets] Invalid manifest format. Falling back to HEAD checks.')
      return null
    }

    const byPath = indexManifestByPath(manifest)
    warnMissingVariants(byPath)
    return {
      ...manifest,
      byPath,
    }
  } catch {
    return null
  }
}

export async function loadAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchManifest()
  }
  return manifestPromise
}

export function clearAssetManifestCache() {
  manifestPromise = null
}
