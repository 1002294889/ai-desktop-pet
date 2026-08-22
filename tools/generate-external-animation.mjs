import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Vector3,
  VectorKeyframeTrack
} from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
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

const outputDirectory = resolve(
  'characters/three-skeletal-demo/assets/animations'
)
const outputPath = resolve(outputDirectory, 'celebrate.glb')
const scene = new Scene()
const rig = createMotionRig()

scene.name = 'OriginalExternalMotionScene'
scene.add(rig.MotionRoot)
scene.updateMatrixWorld(true)

const clip = createCelebrateClip()

clip.validate()
clip.optimize()

const exported = await new GLTFExporter().parseAsync(scene, {
  animations: [clip],
  binary: true,
  onlyVisible: false,
  trs: true
})

if (!(exported instanceof ArrayBuffer)) {
  throw new Error('GLTFExporter did not return a binary GLB')
}

await mkdir(outputDirectory, { recursive: true })
await writeFile(outputPath, new Uint8Array(exported))

const verified = await new GLTFLoader().parseAsync(exported, '')
const verifiedClip = verified.animations.find(({ name }) => name === 'Celebrate')

if (!verifiedClip || verifiedClip.tracks.length !== clip.tracks.length) {
  throw new Error('Generated GLB did not preserve the Celebrate clip and tracks')
}

for (const boneName of Object.keys(rig)) {
  if (!verified.scene.getObjectByName(boneName)) {
    throw new Error(`Generated GLB did not preserve motion bone ${boneName}`)
  }
}

console.info(`Generated ${outputPath} (${exported.byteLength} bytes)`)
console.info(`Animation clip: ${verifiedClip.name}, ${verifiedClip.tracks.length} tracks`)

function createMotionRig() {
  const MotionRoot = namedBone('MotionRoot', [0, 0, 0])
  const MotionBody = namedBone('MotionBody', [0, 1.15, 0])
  const MotionHead = namedBone('MotionHead', [0, 1, 0])
  const MotionLeftArm = namedBone('MotionLeftArm', [-0.66, 0.4, 0])
  const MotionRightArm = namedBone('MotionRightArm', [0.66, 0.4, 0])
  const MotionLeftLeg = namedBone('MotionLeftLeg', [-0.34, -0.72, 0])
  const MotionRightLeg = namedBone('MotionRightLeg', [0.34, -0.72, 0])

  MotionRoot.add(MotionBody)
  MotionBody.add(
    MotionHead,
    MotionLeftArm,
    MotionRightArm,
    MotionLeftLeg,
    MotionRightLeg
  )

  return {
    MotionRoot,
    MotionBody,
    MotionHead,
    MotionLeftArm,
    MotionRightArm,
    MotionLeftLeg,
    MotionRightLeg
  }
}

function namedBone(name, position) {
  const bone = new Bone()

  bone.name = name
  bone.position.fromArray(position)
  return bone
}

function createCelebrateClip() {
  const times = [0, 0.22, 0.5, 0.78, 1.06, 1.34, 1.7]

  return new AnimationClip('Celebrate', 1.7, [
    vectorTrack(
      'MotionRoot.position',
      times,
      [
        [0, 0, 0],
        [0.08, 0.15, 0.02],
        [0.18, 0.5, 0.05],
        [0.28, 0.04, 0.08],
        [0.38, 0.34, 0.1],
        [0.48, 0.03, 0.12],
        [0.62, 0, 0.16]
      ]
    ),
    vectorTrack(
      'MotionBody.scale',
      times,
      [
        [1, 1, 1],
        [1.07, 0.91, 1.04],
        [0.96, 1.08, 0.98],
        [1.04, 0.94, 1.02],
        [0.97, 1.06, 0.99],
        [1.03, 0.96, 1.01],
        [1, 1, 1]
      ]
    ),
    quaternionTrack('MotionBody.quaternion', times, 'z', [0, -0.08, 0.12, -0.12, 0.1, -0.06, 0]),
    quaternionTrack('MotionHead.quaternion', times, 'z', [0, 0.12, -0.14, 0.15, -0.12, 0.08, 0]),
    quaternionTrack('MotionLeftArm.quaternion', times, 'z', [0, -1.45, -2.2, -1.7, -2.35, -1.55, 0]),
    quaternionTrack('MotionRightArm.quaternion', times, 'z', [0, 1.45, 2.2, 1.7, 2.35, 1.55, 0]),
    quaternionTrack('MotionLeftLeg.quaternion', times, 'x', [0, -0.22, 0.3, -0.18, 0.26, -0.12, 0]),
    quaternionTrack('MotionRightLeg.quaternion', times, 'x', [0, 0.22, -0.3, 0.18, -0.26, 0.12, 0])
  ])
}

function vectorTrack(name, times, vectors) {
  return new VectorKeyframeTrack(name, times, vectors.flat())
}

function quaternionTrack(name, times, axis, angles) {
  const direction =
    axis === 'x'
      ? new Vector3(1, 0, 0)
      : axis === 'y'
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1)
  const values = angles.flatMap((angle) =>
    new Quaternion().setFromAxisAngle(direction, angle).toArray()
  )

  return new QuaternionKeyframeTrack(name, times, values)
}
