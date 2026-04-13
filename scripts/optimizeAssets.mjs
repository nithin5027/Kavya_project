import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  clearCache,
  hashFileMd5,
  hasSourceChanged,
  loadCache,
  saveCache,
  updateSourceHash,
} from './assetCache.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const assetsDir = path.join(projectRoot, 'public', 'assets')
const sourceDir = path.join(assetsDir, 'source')
const manifestPath = path.join(assetsDir, 'manifest.json')
const tempDir = path.join(assetsDir, '.tmp-optimize')

const args = new Set(process.argv.slice(2))
const options = {
  truckOnly: args.has('--truck-only'),
  envOnly: args.has('--env-only'),
  skipExisting: args.has('--skip-existing'),
  force: args.has('--force'),
  verbose: args.has('--verbose'),
}

if (options.truckOnly && options.envOnly) {
  console.error('Cannot use both --truck-only and --env-only together.')
  process.exit(1)
}

function shouldRunTruck() {
  return !options.envOnly
}

function shouldRunEnv() {
  return !options.truckOnly
}

function resolveCliBin() {
  const ext = process.platform === 'win32' ? '.cmd' : ''
  const localBin = path.join(projectRoot, 'node_modules', '.bin', `gltf-transform${ext}`)
  return fs.existsSync(localBin) ? localBin : 'gltf-transform'
}

const gltfTransformBin = resolveCliBin()

function runCli(commandArgs, label) {
  const result = spawnSync(gltfTransformBin, commandArgs, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.verbose ? 'inherit' : 'pipe',
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    const stdout = result.stdout?.trim()
    const detail = stderr || stdout || `Exit code ${result.status}`
    throw new Error(`${label} failed: ${detail}`)
  }

  if (!options.verbose) {
    console.log(`  - ${label}`)
  }
}

function ensureCleanTemp() {
  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })
}

function formatSize(bytes) {
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  return `${(bytes / 1024).toFixed(2)} KB`
}

function reductionPct(sourceBytes, outputBytes) {
  if (!sourceBytes || sourceBytes <= 0) {
    return 'n/a'
  }
  const reduction = ((sourceBytes - outputBytes) / sourceBytes) * 100
  const sign = reduction >= 0 ? '-' : '+'
  return `${sign}${Math.abs(reduction).toFixed(1)}%`
}

function outputExists(filePath) {
  return fs.existsSync(filePath)
}

function runPipeline({ inputPath, outputPath, stages, keyPrefix }) {
  let currentInput = inputPath
  stages.forEach((stage, index) => {
    const isLast = index === stages.length - 1
    const stageOutput = isLast
      ? outputPath
      : path.join(tempDir, `${keyPrefix}-${index + 1}.glb`)

    runCli([stage.command, currentInput, stageOutput, ...stage.args], stage.label)
    currentInput = stageOutput
  })
}

function buildManifestEntries(fileNames) {
  const generatedAt = new Date().toISOString()
  const entries = []

  fileNames.forEach((fileName) => {
    const absPath = path.join(assetsDir, fileName)
    if (!fs.existsSync(absPath)) {
      return
    }

    const sizeBytes = fs.statSync(absPath).size
    entries.push({
      path: `/assets/${fileName}`,
      sizeBytes,
      sizeKB: Number((sizeBytes / 1024).toFixed(2)),
      md5hash: hashFileMd5(absPath),
      generatedAt,
    })
  })

  return {
    generatedAt,
    files: entries,
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
}

function printSummary(rows) {
  console.log('\nAsset Optimization Summary')
  console.log('File                 | Size      | Reduction')
  console.log('---------------------|-----------|----------')
  rows.forEach((row) => {
    const file = row.file.padEnd(20, ' ')
    const size = row.size.padEnd(9, ' ')
    console.log(`${file} | ${size} | ${row.reduction}`)
  })
}

function shouldSkipAsset({ cache, cacheKey, sourceHash, outputs }) {
  if (options.force) return false

  const unchanged = !hasSourceChanged(cache, cacheKey, sourceHash)
  if (!unchanged) return false

  if (!options.skipExisting) {
    return true
  }

  return outputs.every((filePath) => outputExists(filePath))
}

function optimizeTruck(sourcePath, summaryRows) {
  const sourceBytes = fs.statSync(sourcePath).size
  const out2k = path.join(assetsDir, 'tr-final-2k.opt.glb')
  const out1k = path.join(assetsDir, 'tr-final-1k.opt.glb')
  const lod1 = path.join(assetsDir, 'tr-final-lod1.glb')
  const lod2 = path.join(assetsDir, 'tr-final-lod2.glb')

  runPipeline({
    inputPath: sourcePath,
    outputPath: out2k,
    keyPrefix: 'truck-2k',
    stages: [
      { command: 'resize', args: ['--width', '2048', '--height', '2048'], label: 'truck-2k resize 2048' },
      { command: 'draco', args: [], label: 'truck-2k draco' },
      { command: 'webp', args: ['--quality', '85'], label: 'truck-2k webp' },
      { command: 'prune', args: [], label: 'truck-2k prune' },
      { command: 'weld', args: [], label: 'truck-2k weld' },
    ],
  })

  runPipeline({
    inputPath: sourcePath,
    outputPath: out1k,
    keyPrefix: 'truck-1k',
    stages: [
      { command: 'resize', args: ['--width', '1024', '--height', '1024'], label: 'truck-1k resize 1024' },
      { command: 'draco', args: [], label: 'truck-1k draco' },
      { command: 'webp', args: ['--quality', '80'], label: 'truck-1k webp' },
      { command: 'prune', args: [], label: 'truck-1k prune' },
      { command: 'weld', args: [], label: 'truck-1k weld' },
    ],
  })

  // Placeholder LOD assets with aggressive simplification.
  runPipeline({
    inputPath: sourcePath,
    outputPath: lod1,
    keyPrefix: 'truck-lod1',
    stages: [
      { command: 'simplify', args: ['--ratio', '0.35'], label: 'truck-lod1 simplify' },
      { command: 'prune', args: [], label: 'truck-lod1 prune' },
      { command: 'weld', args: [], label: 'truck-lod1 weld' },
      { command: 'draco', args: [], label: 'truck-lod1 draco' },
    ],
  })

  runPipeline({
    inputPath: sourcePath,
    outputPath: lod2,
    keyPrefix: 'truck-lod2',
    stages: [
      { command: 'simplify', args: ['--ratio', '0.15'], label: 'truck-lod2 simplify' },
      { command: 'prune', args: [], label: 'truck-lod2 prune' },
      { command: 'weld', args: [], label: 'truck-lod2 weld' },
      { command: 'draco', args: [], label: 'truck-lod2 draco' },
    ],
  })

  const out2kBytes = fs.statSync(out2k).size
  const out1kBytes = fs.statSync(out1k).size
  const lod1Bytes = fs.statSync(lod1).size
  const lod2Bytes = fs.statSync(lod2).size

  summaryRows.push({
    file: 'tr-final-2k.opt',
    size: formatSize(out2kBytes),
    reduction: reductionPct(sourceBytes, out2kBytes),
  })
  summaryRows.push({
    file: 'tr-final-1k.opt',
    size: formatSize(out1kBytes),
    reduction: reductionPct(sourceBytes, out1kBytes),
  })
  summaryRows.push({
    file: 'tr-final-lod1',
    size: formatSize(lod1Bytes),
    reduction: reductionPct(sourceBytes, lod1Bytes),
  })
  summaryRows.push({
    file: 'tr-final-lod2',
    size: formatSize(lod2Bytes),
    reduction: reductionPct(sourceBytes, lod2Bytes),
  })
}

function optimizeEnv(sourcePath, summaryRows) {
  const sourceBytes = fs.statSync(sourcePath).size
  const output = path.join(assetsDir, 'kavya-env.meshopt.glb')

  runPipeline({
    inputPath: sourcePath,
    outputPath: output,
    keyPrefix: 'env-meshopt',
    stages: [
      { command: 'meshopt', args: [], label: 'env meshopt' },
      { command: 'prune', args: [], label: 'env prune' },
      { command: 'weld', args: [], label: 'env weld' },
    ],
  })

  const outBytes = fs.statSync(output).size
  summaryRows.push({
    file: 'kavya-env.meshopt',
    size: formatSize(outBytes),
    reduction: reductionPct(sourceBytes, outBytes),
  })
}

function main() {
  const selectedSources = []
  if (shouldRunTruck()) {
    selectedSources.push({
      cacheKey: 'truck',
      sourcePath: path.join(sourceDir, 'tr-final.glb'),
      outputs: [
        path.join(assetsDir, 'tr-final-2k.opt.glb'),
        path.join(assetsDir, 'tr-final-1k.opt.glb'),
        path.join(assetsDir, 'tr-final-lod1.glb'),
        path.join(assetsDir, 'tr-final-lod2.glb'),
      ],
      run: optimizeTruck,
      label: 'truck',
    })
  }

  if (shouldRunEnv()) {
    selectedSources.push({
      cacheKey: 'environment',
      sourcePath: path.join(sourceDir, 'kavya-env.glb'),
      outputs: [path.join(assetsDir, 'kavya-env.meshopt.glb')],
      run: optimizeEnv,
      label: 'environment',
    })
  }

  if (options.force) {
    clearCache(projectRoot)
  }

  let cache = loadCache(projectRoot)
  const summaryRows = []

  fs.mkdirSync(assetsDir, { recursive: true })
  ensureCleanTemp()

  selectedSources.forEach((asset) => {
    if (!fs.existsSync(asset.sourcePath)) {
      const canSkip = options.skipExisting && !options.force && asset.outputs.every((out) => outputExists(out))
      if (canSkip) {
        console.log(`Skipping ${asset.label}: source missing, existing optimized outputs retained.`)
        return
      }
      throw new Error(`Missing source file: ${path.relative(projectRoot, asset.sourcePath)}`)
    }

    const sourceHash = hashFileMd5(asset.sourcePath)

    if (shouldSkipAsset({
      cache,
      cacheKey: asset.cacheKey,
      sourceHash,
      outputs: asset.outputs,
    })) {
      console.log(`Skipping ${asset.label}: source unchanged.`)
      return
    }

    console.log(`Optimizing ${asset.label}...`)
    asset.run(asset.sourcePath, summaryRows)
    cache = updateSourceHash(cache, asset.cacheKey, asset.sourcePath, sourceHash)
  })

  saveCache(projectRoot, cache)

  const manifest = buildManifestEntries([
    'kavyatruck.opt.glb',
    'kavyatruck-lod1.glb',
    'kavyatruck-lod2.glb',
    'kavya-env.meshopt.glb',
  ])
  writeManifest(manifest)

  if (summaryRows.length > 0) {
    printSummary(summaryRows)
  } else {
    console.log('No assets needed regeneration. Manifest refreshed.')
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('\nAsset optimization completed successfully.')
}

try {
  main()
  process.exit(0)
} catch (error) {
  fs.rmSync(tempDir, { recursive: true, force: true })
  console.error(`Asset optimization failed: ${error.message}`)
  process.exit(1)
}
