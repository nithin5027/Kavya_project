import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const CACHE_FILE_NAME = '.asset-cache.json'

function createDefaultCache() {
  return {
    version: 1,
    updatedAt: null,
    sources: {},
  }
}

export function getCacheFilePath(projectRoot) {
  return path.join(projectRoot, CACHE_FILE_NAME)
}

export function loadCache(projectRoot) {
  const cachePath = getCacheFilePath(projectRoot)
  if (!fs.existsSync(cachePath)) {
    return createDefaultCache()
  }

  try {
    const raw = fs.readFileSync(cachePath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...createDefaultCache(),
      ...parsed,
      sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    }
  } catch {
    return createDefaultCache()
  }
}

export function saveCache(projectRoot, cache) {
  const cachePath = getCacheFilePath(projectRoot)
  const nextCache = {
    ...createDefaultCache(),
    ...cache,
    updatedAt: new Date().toISOString(),
  }

  fs.writeFileSync(cachePath, JSON.stringify(nextCache, null, 2), 'utf8')
}

export function clearCache(projectRoot) {
  const cachePath = getCacheFilePath(projectRoot)
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath)
  }
}

export function hashFileMd5(filePath) {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('md5').update(content).digest('hex')
}

export function hasSourceChanged(cache, key, nextHash) {
  const prevHash = cache?.sources?.[key]?.hash
  return prevHash !== nextHash
}

export function updateSourceHash(cache, key, filePath, hash) {
  const next = cache || createDefaultCache()
  next.sources = next.sources || {}
  next.sources[key] = {
    filePath,
    hash,
    updatedAt: new Date().toISOString(),
  }
  return next
}
