import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { Bone, PropertyBinding, SkinnedMesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

class NodeFileReader {
  result = null
  onerror = null
  onloadend = null

  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer()
      this.onloadend?.({ target: this })
    } catch (error) {
      this.onerror?.(error)
    }
  }

  async readAsDataURL(blob) {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer())
      this.result = `data:${blob.type};base64,${bytes.toString('base64')}`
      this.onloadend?.({ target: this })
    } catch (error) {
      this.onerror?.(error)
    }
  }
}

globalThis.FileReader ??= NodeFileReader
globalThis.self ??= globalThis
globalThis.createImageBitmap ??= async () => ({
  close() {},
  height: 1,
  width: 1
})

const repositoryRoot = resolve(import.meta.dirname, '..')
const modelPath = resolve(
  repositoryRoot,
  'characters/rae-red-panda/assets/rae-red-panda.glb'
)
const animationPath = resolve(
  process.argv[2] ??
    resolve(
      repositoryRoot,
      'characters/rae-red-panda/assets/animations/rae-actions.glb'
    )
)
const expectedClipNames = ['RaeJump', 'RaeSit', 'RaeSleep', 'RaeWake']

const [model, animationResource] = await Promise.all([
  loadGlb(modelPath),
  loadGlb(animationPath)
])
const targetNames = new Set()
const targetBones = new Set()

model.scene.traverse((object) => {
  targetNames.add(object.name)

  if (object instanceof Bone) {
    targetBones.add(object.name)
  }
})

const skinnedMeshes = []
model.scene.traverse((object) => {
  if (object instanceof SkinnedMesh) {
    skinnedMeshes.push(object)
  }
})

if (skinnedMeshes.length === 0 || targetBones.size !== 43) {
  throw new Error(
    `Unexpected Rae target rig: ${skinnedMeshes.length} skinned meshes, ${targetBones.size} bones`
  )
}

const clipsByName = new Map(
  animationResource.animations.map((clip) => [clip.name, clip])
)
const errors = []
const warnings = []

for (const clipName of expectedClipNames) {
  const clip = clipsByName.get(clipName)

  if (!clip) {
    errors.push(`missing clip ${clipName}`)
    continue
  }

  if (!(clip.duration > 0) || clip.tracks.length === 0) {
    errors.push(`${clipName} has no usable keyed duration/tracks`)
    continue
  }

  let skeletalTrackCount = 0

  for (const track of clip.tracks) {
    let binding

    try {
      binding = PropertyBinding.parseTrackName(track.name)
    } catch {
      errors.push(`${clipName} has an invalid track name: ${track.name}`)
      continue
    }

    const nodeName = binding.nodeName

    if (!nodeName || !targetNames.has(nodeName)) {
      errors.push(`${clipName} targets a node Rae does not have: ${track.name}`)
      continue
    }

    if (targetBones.has(nodeName)) {
      skeletalTrackCount += 1
    }

    if (
      !['position', 'quaternion', 'scale'].includes(binding.propertyName ?? '')
    ) {
      errors.push(`${clipName} uses unsupported track property: ${track.name}`)
    }
  }

  if (skeletalTrackCount === 0) {
    errors.push(`${clipName} contains no Rae bone animation tracks`)
  }

  const rootPositionTrack = clip.tracks.find((track) =>
    ['Root.position', 'CharacterArmature.position'].includes(track.name)
  )

  if (rootPositionTrack) {
    warnings.push(
      `${clipName} includes ${rootPositionTrack.name}; runtime root-motion locking remains authoritative`
    )
  }

  console.info(
    `${clipName}: ${clip.duration.toFixed(3)}s, ${clip.tracks.length} tracks (${skeletalTrackCount} skeletal)`
  )
}

const unexpectedClips = animationResource.animations
  .map((clip) => clip.name)
  .filter((name) => !expectedClipNames.includes(name))

if (unexpectedClips.length > 0) {
  warnings.push(`additional clips will be ignored: ${unexpectedClips.join(', ')}`)
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`)
}

if (errors.length > 0) {
  throw new Error(`Rae action validation failed:\n- ${errors.join('\n- ')}`)
}

console.info(
  `Validated ${animationPath} against Rae's ${targetBones.size}-bone runtime rig.`
)

async function loadGlb(path) {
  const bytes = await readFile(path)
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )

  return new GLTFLoader().parseAsync(buffer, '')
}
