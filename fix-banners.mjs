/**
 * Definitive banner fix:
 * 1. Re-compress original tr.glb → tr-final.glb (restores original transforms)
 * 2. Flip UV.u for the left banner (KavyaBannerRight.002) in the GLB itself
 *    so the mirrored transform shows correct text
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

// Step 1: Read the ORIGINAL tr.glb
console.log('=== Reading original tr.glb ===')
const doc = await io.read('public/assets/tr.glb')
const root = doc.getRoot()

// Step 2: Inspect all nodes to find banner meshes
console.log('\n=== All Nodes ===')
for (const node of root.listNodes()) {
  const name = node.getName()
  const t = node.getTranslation()
  const r = node.getRotation()
  const s = node.getScale()
  const mesh = node.getMesh()
  
  console.log(`Node: "${name}"`)
  console.log(`  T: [${t.map(v => v.toFixed(6)).join(', ')}]`)
  console.log(`  R: [${r.map(v => v.toFixed(6)).join(', ')}]`)
  console.log(`  S: [${s.map(v => v.toFixed(6)).join(', ')}]`)
  
  if (mesh) {
    for (const prim of mesh.listPrimitives()) {
      const posAcc = prim.getAttribute('POSITION')
      const uvAcc = prim.getAttribute('TEXCOORD_0')
      const vertCount = posAcc ? posAcc.getCount() : 0
      console.log(`  Mesh: ${mesh.getName()}, verts=${vertCount}`)
      
      if (uvAcc && vertCount <= 10) {
        console.log(`  UVs:`)
        for (let i = 0; i < vertCount; i++) {
          const uv = uvAcc.getElement(i, [0, 0])
          console.log(`    v${i}: u=${uv[0].toFixed(4)}, v=${uv[1].toFixed(4)}`)
        }
      }
      
      if (posAcc && vertCount <= 10) {
        console.log(`  Positions:`)
        for (let i = 0; i < vertCount; i++) {
          const pos = posAcc.getElement(i, [0, 0, 0])
          console.log(`    v${i}: [${pos.map(v => v.toFixed(4)).join(', ')}]`)
        }
      }
      
      // Check material
      const mat = prim.getMaterial()
      if (mat) {
        const baseColorTex = mat.getBaseColorTexture()
        console.log(`  Material: ${mat.getName()}, baseColorTex: ${baseColorTex ? baseColorTex.getName() || baseColorTex.getURI() : 'none'}`)
      }
    }
  }
}

// Step 3: Find the left banner and flip its UVs
console.log('\n=== Fixing left banner UVs ===')
let leftBannerFixed = false
let rightBannerFound = false

for (const node of root.listNodes()) {
  const name = node.getName()
  const mesh = node.getMesh()
  
  if (name === 'KavyaBannerRight.001') {
    rightBannerFound = true
    console.log(`Found RIGHT banner: ${name}`)
    const t = node.getTranslation()
    const r = node.getRotation()
    const s = node.getScale()
    console.log(`  T: [${t.map(v => v.toFixed(6)).join(', ')}]`)
    console.log(`  R: [${r.map(v => v.toFixed(6)).join(', ')}]`)
    console.log(`  S: [${s.map(v => v.toFixed(6)).join(', ')}]`)
  }
  
  if (name === 'KavyaBannerRight.002' && mesh) {
    console.log(`Found LEFT banner: ${name}`)
    const t = node.getTranslation()
    const r = node.getRotation()
    const s = node.getScale()
    console.log(`  ORIGINAL T: [${t.map(v => v.toFixed(6)).join(', ')}]`)
    console.log(`  ORIGINAL R: [${r.map(v => v.toFixed(6)).join(', ')}]`)
    console.log(`  ORIGINAL S: [${s.map(v => v.toFixed(6)).join(', ')}]`)
    
    for (const prim of mesh.listPrimitives()) {
      const uvAcc = prim.getAttribute('TEXCOORD_0')
      if (!uvAcc) {
        console.log('  ERROR: No UV accessor!')
        continue
      }
      
      // Check if this accessor is shared with the right banner
      let isShared = false
      for (const otherNode of root.listNodes()) {
        if (otherNode.getName() === 'KavyaBannerRight.001' && otherNode.getMesh()) {
          for (const otherPrim of otherNode.getMesh().listPrimitives()) {
            const otherUV = otherPrim.getAttribute('TEXCOORD_0')
            if (otherUV === uvAcc) {
              isShared = true
              console.log('  UV accessor is SHARED with right banner - will create a copy')
            }
          }
        }
      }
      
      let targetUV = uvAcc
      if (isShared) {
        // Create a new accessor with copied data
        const Accessor = (await import('@gltf-transform/core')).Accessor
        const newUVAcc = doc.createAccessor()
        newUVAcc.setType('VEC2')
        newUVAcc.setArray(new Float32Array(uvAcc.getArray()))
        prim.setAttribute('TEXCOORD_0', newUVAcc)
        targetUV = newUVAcc
        console.log('  Created independent UV accessor for left banner')
      }
      
      // Flip U coordinates: newU = 1 - oldU
      const count = targetUV.getCount()
      console.log(`  Flipping ${count} UV.u coordinates...`)
      for (let i = 0; i < count; i++) {
        const uv = targetUV.getElement(i, [0, 0])
        console.log(`    v${i}: u=${uv[0].toFixed(4)} → ${(1 - uv[0]).toFixed(4)}`)
        uv[0] = 1 - uv[0]
        targetUV.setElement(i, uv)
      }
      
      leftBannerFixed = true
    }
  }
}

if (!rightBannerFound) console.log('WARNING: Right banner not found!')
if (!leftBannerFixed) console.log('WARNING: Left banner UV fix failed!')

// Step 4: Compress textures to WebP and apply Draco
console.log('\n=== Compressing textures ===')
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 })
)

// Step 5: Write output
console.log('\n=== Writing tr-final.glb ===')
// Enable Draco compression
const { draco } = await import('@gltf-transform/functions')
await doc.transform(draco())

await io.write('public/assets/tr-final.glb', doc)

// Verify file size
import { statSync } from 'fs'
const stat = statSync('public/assets/tr-final.glb')
console.log(`\nOutput: tr-final.glb (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
console.log('Done!')
