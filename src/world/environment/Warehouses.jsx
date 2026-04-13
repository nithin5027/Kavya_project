/**
 * GPU-INSTANCED WAREHOUSES
 * ═══════════════════════════════════════
 * Single InstancedMesh draw call. No per-frame updates.
 * Each warehouse = main body + flat roof + loading dock.
 * Uses WAREHOUSES config for layout.
 */
import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { WAREHOUSES, CONTAINER_YARDS, SCENE, COLORS } from '../config'

const _mat4 = new THREE.Matrix4()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()

export default function Warehouses() {
  const bodyRef = useRef()
  const roofRef = useRef()
  const dockRef = useRef()
  const doorRef = useRef()
  const count = WAREHOUSES.length

  // Body material
  const bodyMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: COLORS.WAREHOUSE_WALL, roughness: 0.85, metalness: 0.1 }), [])
  const roofMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: COLORS.WAREHOUSE_ROOF, roughness: 0.6, metalness: 0.3 }), [])
  const dockMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#555555', roughness: 0.9, metalness: 0.05 }), [])
  const doorMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: COLORS.WAREHOUSE_DOOR, roughness: 0.4, metalness: 0.6 }), [])

  useEffect(() => {
    WAREHOUSES.forEach((wh, i) => {
      const { pos, size, rot = 0 } = wh
      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot)

      // Body
      if (bodyRef.current) {
        _pos.set(pos[0], size[1] / 2, pos[2])
        _scale.set(size[0], size[1], size[2])
        _mat4.compose(_pos, _quat, _scale)
        bodyRef.current.setMatrixAt(i, _mat4)
      }

      // Roof overhang
      if (roofRef.current) {
        _pos.set(pos[0], size[1] + 0.15, pos[2])
        _scale.set(size[0] + 1.2, 0.3, size[2] + 1.2)
        _mat4.compose(_pos, _quat, _scale)
        roofRef.current.setMatrixAt(i, _mat4)
      }

      // Loading dock
      if (dockRef.current) {
        _pos.set(pos[0] + size[0] * 0.3, 0.15, pos[2] + size[2] / 2 + 1.2)
        _scale.set(size[0] * 0.5, 0.3, 2.5)
        _mat4.compose(_pos, _quat, _scale)
        dockRef.current.setMatrixAt(i, _mat4)
      }

      // Roll-up doors (2 per warehouse)
      if (doorRef.current && i * 2 < count * 2) {
        const doorW = Math.min(size[0] * 0.2, 3.5)
        const doorH = Math.min(size[1] * 0.7, 5)
        for (let d = 0; d < 2; d++) {
          _pos.set(
            pos[0] + (d === 0 ? -size[0] * 0.15 : size[0] * 0.15),
            doorH / 2,
            pos[2] + size[2] / 2 + 0.05
          )
          _scale.set(doorW, doorH, 0.1)
          _mat4.compose(_pos, _quat, _scale)
          doorRef.current.setMatrixAt(i * 2 + d, _mat4)
        }
      }
    })

    if (bodyRef.current) bodyRef.current.instanceMatrix.needsUpdate = true
    if (roofRef.current) roofRef.current.instanceMatrix.needsUpdate = true
    if (dockRef.current) dockRef.current.instanceMatrix.needsUpdate = true
    if (doorRef.current) doorRef.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[null, null, count]} material={bodyMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={roofRef} args={[null, null, count]} material={roofMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={dockRef} args={[null, null, count]} material={dockMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={doorRef} args={[null, null, count * 2]} material={doorMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  )
}

/**
 * GPU-INSTANCED CONTAINER YARD
 * ═══════════════════════════════════════
 * Multi-colored shipping containers stacked in yards.
 * Single InstancedMesh + per-instance color.
 */
export function ContainerYard() {
  const ref = useRef()
  
  const { totalCount, containerColors } = useMemo(() => {
    let total = 0
    const containers = []
    CONTAINER_YARDS.forEach(yard => {
      const cols = yard.cols || 5
      const rows = yard.rows || 3
      const layers = yard.layers || 2
      for (let l = 0; l < layers; l++)
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            containers.push({
              yard,
              col: c, row: r, layer: l,
              color: ['#B44040', '#4060A0', '#40A060', '#D4A030', '#808080', '#C06020'][Math.floor(Math.random() * 6)]
            })
            total++
          }
    })
    return { totalCount: total, containerColors: containers }
  }, [])

  useEffect(() => {
    if (!ref.current || totalCount === 0) return
    const containerW = 6.1, containerH = 2.6, containerD = 2.44
    const gapX = 0.3, gapZ = 0.15

    containerColors.forEach((c, i) => {
      const { yard, col, row, layer } = c
      const x = yard.pos[0] + col * (containerW + gapX)
      const y = layer * (containerH + 0.05) + containerH / 2
      const z = yard.pos[2] + row * (containerD + gapZ)

      _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yard.rotY || 0)
      _pos.set(x, y, z)
      _scale.set(containerW, containerH, containerD)
      _mat4.compose(_pos, _quat, _scale)
      ref.current.setMatrixAt(i, _mat4)
      ref.current.setColorAt(i, new THREE.Color(c.color))
    })

    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [totalCount, containerColors])

  return (
    <instancedMesh ref={ref} args={[null, null, totalCount]} frustumCulled={false} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.4} />
    </instancedMesh>
  )
}
