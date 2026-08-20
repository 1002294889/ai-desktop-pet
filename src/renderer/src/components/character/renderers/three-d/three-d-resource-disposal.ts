import {
  Material,
  Mesh,
  Texture,
  type Object3D
} from 'three'

export function disposeThreeDObject(root: Object3D): void {
  const disposedTextures = new Set<Texture>()
  const disposedMaterials = new Set<Material>()

  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return
    }

    object.geometry.dispose()

    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (disposedMaterials.has(material)) {
        continue
      }

      disposeMaterialTextures(material, disposedTextures)
      material.dispose()
      disposedMaterials.add(material)
    }
  })
}

function disposeMaterialTextures(
  material: Material,
  disposedTextures: Set<Texture>
): void {
  for (const value of Object.values(material)) {
    if (!(value instanceof Texture) || disposedTextures.has(value)) {
      continue
    }

    value.dispose()
    disposedTextures.add(value)
  }
}
