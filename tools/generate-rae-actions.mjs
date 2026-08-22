import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  SkinnedMesh,
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
globalThis.self ??= globalThis
globalThis.createImageBitmap ??= async () => ({
  close() {},
  height: 1,
  width: 1
})

const modelPath = resolve('characters/rae-red-panda/assets/rae-red-panda.glb')
const outputPath = resolve(
  'characters/rae-red-panda/assets/animations/rae-actions.glb'
)
const REQUIRED_BONES = [
  'Root',
  'FootL',
  'FootR',
  'Body',
  'Hips',
  'Abdomen',
  'Torso',
  'Neck',
  'Head',
  'ShoulderL',
  'ShoulderR',
  'UpperArmL',
  'UpperArmR',
  'LowerArmL',
  'LowerArmR',
  'UpperLegL',
  'UpperLegR',
  'LowerLegL',
  'LowerLegR'
]

const sourceModel = await loadGlb(modelPath)
const sourceBones = findSkeletonBones(sourceModel.scene)
const motionRig = cloneMotionRig(sourceBones)
const clips = [
  createJumpClip(motionRig.bones),
  createSitClip(motionRig.bones),
  createSleepClip(motionRig.bones),
  createWakeClip(motionRig.bones)
]
const scene = new Scene()

scene.name = 'RaeAuthoredActionRig'
scene.add(...motionRig.roots)
scene.updateMatrixWorld(true)

for (const clip of clips) {
  if (!clip.validate()) {
    throw new Error(`Generated clip ${clip.name} failed validation`)
  }
  clip.optimize()
}

const exported = await new GLTFExporter().parseAsync(scene, {
  animations: clips,
  binary: true,
  onlyVisible: false,
  trs: true
})

if (!(exported instanceof ArrayBuffer)) {
  throw new Error('GLTFExporter did not return a binary GLB')
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, new Uint8Array(exported))

const verified = await new GLTFLoader().parseAsync(exported, '')
const expectedClips = new Map(clips.map((clip) => [clip.name, clip.tracks.length]))

for (const [clipName, trackCount] of expectedClips) {
  const clip = verified.animations.find((candidate) => candidate.name === clipName)

  if (!clip || clip.tracks.length !== trackCount) {
    throw new Error(`Generated GLB did not preserve ${clipName}`)
  }
}

for (const boneName of REQUIRED_BONES) {
  if (!verified.scene.getObjectByName(boneName)) {
    throw new Error(`Generated GLB did not preserve motion bone ${boneName}`)
  }
}

console.info(`Generated ${outputPath} (${exported.byteLength} bytes)`)
console.info(
  `Animation clips: ${verified.animations.map((clip) => `${clip.name}:${clip.tracks.length}`).join(', ')}`
)

async function loadGlb(path) {
  const bytes = await readFile(path)
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )

  return new GLTFLoader().parseAsync(buffer, '')
}

function findSkeletonBones(scene) {
  let skinnedMesh

  scene.traverse((object) => {
    if (!skinnedMesh && object instanceof SkinnedMesh) {
      skinnedMesh = object
    }
  })

  if (!skinnedMesh) {
    throw new Error('Rae model does not contain a SkinnedMesh')
  }

  return skinnedMesh.skeleton.bones
}

function cloneMotionRig(sourceBones) {
  const bones = new Map()

  for (const sourceBone of sourceBones) {
    const bone = new Bone()

    bone.name = sourceBone.name
    bone.position.copy(sourceBone.position)
    bone.quaternion.copy(sourceBone.quaternion)
    bone.scale.copy(sourceBone.scale)
    bones.set(bone.name, bone)
  }

  const roots = []

  for (const sourceBone of sourceBones) {
    const bone = requiredBone(bones, sourceBone.name)
    const parent =
      sourceBone.parent instanceof Bone
        ? bones.get(sourceBone.parent.name)
        : undefined

    if (parent) {
      parent.add(bone)
    } else {
      roots.push(bone)
    }
  }

  return { bones, roots }
}

function createJumpClip(bones) {
  return createPoseClip('RaeJump', 2.05, bones, [
    frame(0, {}),
    frame(0.42, {
      Body: position(0, -0.16, -0.03),
      Hips: rotation(12, 0, 0),
      Torso: rotation(14, 0, 0),
      Head: rotation(-6, 0, 0),
      ShoulderL: rotation(0, 0, -8),
      ShoulderR: rotation(0, 0, 8),
      UpperArmL: rotation(-8, -12, -28),
      UpperArmR: rotation(-8, 12, 28),
      LowerArmL: rotation(-4, -18, -28),
      LowerArmR: rotation(-4, 18, 28),
      UpperLegL: rotation(-38, 0, -7),
      UpperLegR: rotation(-38, 0, 7),
      LowerLegL: rotation(64, 0, 3),
      LowerLegR: rotation(64, 0, -3),
      FootL: position(0, -0.04, 0.03),
      FootR: position(0, -0.04, 0.03)
    }),
    frame(0.68, {
      Body: position(0, 0.2, -0.01),
      Hips: rotation(-5, 0, 0),
      Torso: rotation(-7, 0, 0),
      Head: rotation(4, 0, 0),
      ShoulderL: rotation(0, 0, -12),
      ShoulderR: rotation(0, 0, 12),
      UpperArmL: rotation(-12, -22, -56),
      UpperArmR: rotation(-12, 22, 56),
      LowerArmL: rotation(6, -12, -22),
      LowerArmR: rotation(6, 12, 22),
      UpperLegL: rotation(8, 0, -3),
      UpperLegR: rotation(8, 0, 3),
      LowerLegL: rotation(-18, 0, 0),
      LowerLegR: rotation(-18, 0, 0),
      FootL: position(0, 0.25, -0.04),
      FootR: position(0, 0.25, -0.04)
    }),
    frame(0.98, {
      Body: position(0, 0.58, 0),
      Hips: rotation(-9, 0, 0),
      Abdomen: rotation(6, 0, 0),
      Torso: rotation(-5, 0, 0),
      Head: rotation(5, 0, 0),
      ShoulderL: rotation(0, 0, -14),
      ShoulderR: rotation(0, 0, 14),
      UpperArmL: rotation(-18, -18, -72),
      UpperArmR: rotation(-18, 18, 72),
      LowerArmL: rotation(12, -8, -20),
      LowerArmR: rotation(12, 8, 20),
      UpperLegL: rotation(38, 0, -13),
      UpperLegR: rotation(34, 0, 13),
      LowerLegL: rotation(-68, 0, 8),
      LowerLegR: rotation(-62, 0, -8),
      FootL: position(0, 0.7, -0.38),
      FootR: position(0, 0.62, 0.3),
      FootLRotation: rotation(-70, 0, 0),
      FootRRotation: rotation(-55, 0, 0)
    }),
    frame(1.2, {
      Body: position(0, 0.56, 0),
      Hips: rotation(-7, 0, 0),
      Abdomen: rotation(5, 0, 0),
      Torso: rotation(-4, 0, 0),
      Head: rotation(4, 0, 0),
      ShoulderL: rotation(0, 0, -12),
      ShoulderR: rotation(0, 0, 12),
      UpperArmL: rotation(-16, -16, -68),
      UpperArmR: rotation(-16, 16, 68),
      LowerArmL: rotation(10, -8, -18),
      LowerArmR: rotation(10, 8, 18),
      UpperLegL: rotation(34, 0, -11),
      UpperLegR: rotation(31, 0, 11),
      LowerLegL: rotation(-62, 0, 7),
      LowerLegR: rotation(-58, 0, -7),
      FootL: position(0, 0.67, -0.34),
      FootR: position(0, 0.6, 0.27),
      FootLRotation: rotation(-65, 0, 0),
      FootRRotation: rotation(-50, 0, 0)
    }),
    frame(1.45, {
      Body: position(0, 0.25, 0),
      Hips: rotation(5, 0, 0),
      Torso: rotation(6, 0, 0),
      Head: rotation(-3, 0, 0),
      UpperArmL: rotation(-10, -10, -38),
      UpperArmR: rotation(-10, 10, 38),
      LowerArmL: rotation(5, -5, -12),
      LowerArmR: rotation(5, 5, 12),
      UpperLegL: rotation(-12, 0, -5),
      UpperLegR: rotation(-12, 0, 5),
      LowerLegL: rotation(24, 0, 3),
      LowerLegR: rotation(24, 0, -3),
      FootL: position(0, 0.26, -0.08),
      FootR: position(0, 0.26, -0.08),
      FootLRotation: rotation(-20, 0, 0),
      FootRRotation: rotation(-20, 0, 0)
    }),
    frame(1.72, {
      Body: position(0, -0.14, -0.025),
      Hips: rotation(14, 0, 0),
      Torso: rotation(16, 0, 0),
      Head: rotation(-7, 0, 0),
      ShoulderL: rotation(0, 0, -6),
      ShoulderR: rotation(0, 0, 6),
      UpperArmL: rotation(-5, -8, -18),
      UpperArmR: rotation(-5, 8, 18),
      LowerArmL: rotation(-3, -10, -18),
      LowerArmR: rotation(-3, 10, 18),
      UpperLegL: rotation(-43, 0, -8),
      UpperLegR: rotation(-43, 0, 8),
      LowerLegL: rotation(72, 0, 4),
      LowerLegR: rotation(72, 0, -4),
      FootL: position(0, -0.05, 0.03),
      FootR: position(0, -0.05, 0.03)
    }),
    frame(2.05, {})
  ])
}

function createSitClip(bones) {
  const seated = {
    Body: pose({ position: [0, -0.66, -0.14], rotation: [-8, -12, 0] }),
    Hips: rotation(24, 0, 0),
    Abdomen: rotation(-10, 0, 0),
    Torso: rotation(-9, 0, 0),
    Neck: rotation(3, 0, 0),
    Head: rotation(6, 0, 0),
    ShoulderL: rotation(0, 0, -5),
    ShoulderR: rotation(0, 0, 5),
    UpperArmL: rotation(8, -10, -36),
    UpperArmR: rotation(8, 10, 36),
    LowerArmL: rotation(-10, -18, -26),
    LowerArmR: rotation(-10, 18, 26),
    UpperLegL: rotation(-104, 0, -38),
    UpperLegR: rotation(-104, 0, 38),
    LowerLegL: rotation(98, 0, 25),
    LowerLegR: rotation(98, 0, -25),
    FootL: position(0.62, -0.14, 0.38),
    FootR: position(-0.62, -0.14, 0.38),
    FootLRotation: rotation(-18, 0, -18),
    FootRRotation: rotation(-18, 0, 18)
  }

  return createPoseClip('RaeSit', 2.6, bones, [
    frame(0, seated),
    frame(1.3, {
      ...seated,
      Body: pose({ position: [0, -0.645, -0.14], rotation: [-8, -12, 0] }),
      Abdomen: rotation(-6, 0, 0),
      Torso: rotation(-5, 0, 0),
      Head: rotation(4, 0, 2)
    }),
    frame(2.6, seated)
  ])
}

function createSleepClip(bones) {
  const sleeping = sleepPose(0)

  return createPoseClip('RaeSleep', 3.2, bones, [
    frame(0, sleeping),
    frame(1.6, sleepPose(0.015)),
    frame(3.2, sleeping)
  ])
}

function createWakeClip(bones) {
  return createPoseClip('RaeWake', 2.2, bones, [
    frame(0, sleepPose(0)),
    frame(0.42, {
      ...sleepPose(0.02),
      Body: pose({ position: [0.14, -0.9, 0], rotation: [0, 0, 72] }),
      Head: rotation(-3, 0, -5),
      UpperArmL: rotation(-8, -18, -38),
      UpperArmR: rotation(10, 22, 40)
    }),
    frame(1.02, {
      Body: pose({ position: [0.03, -0.53, -0.1], rotation: [-3, 0, 25] }),
      Hips: rotation(22, 0, 0),
      Abdomen: rotation(-9, 0, 0),
      Torso: rotation(-8, 0, 0),
      Neck: rotation(4, 0, -3),
      Head: rotation(9, 0, -4),
      ShoulderL: rotation(0, 0, -4),
      ShoulderR: rotation(0, 0, 4),
      UpperArmL: rotation(6, -10, -24),
      UpperArmR: rotation(10, 12, 28),
      LowerArmL: rotation(-12, -18, -28),
      LowerArmR: rotation(-12, 20, 30),
      UpperLegL: rotation(-88, 0, -20),
      UpperLegR: rotation(-86, 0, 20),
      LowerLegL: rotation(118, 0, 8),
      LowerLegR: rotation(114, 0, -8),
      FootL: position(0.36, -0.08, 0.3),
      FootR: position(-0.36, -0.08, 0.3),
      FootLRotation: rotation(-15, 0, -6),
      FootRRotation: rotation(-15, 0, 6)
    }),
    frame(1.58, {
      Body: pose({ position: [0, -0.16, -0.02], rotation: [2, 0, 4] }),
      Hips: rotation(10, 0, 0),
      Torso: rotation(10, 0, 0),
      Head: rotation(-4, 0, -2),
      UpperArmL: rotation(-4, -6, -12),
      UpperArmR: rotation(-4, 6, 12),
      LowerArmL: rotation(-3, -8, -14),
      LowerArmR: rotation(-3, 8, 14),
      UpperLegL: rotation(-35, 0, -6),
      UpperLegR: rotation(-35, 0, 6),
      LowerLegL: rotation(56, 0, 3),
      LowerLegR: rotation(56, 0, -3),
      FootL: position(0, -0.03, 0.04),
      FootR: position(0, -0.03, 0.04)
    }),
    frame(2.2, {})
  ])
}

function sleepPose(breathingOffset) {
  return {
    Body: pose({
      position: [0.16, -1.02 + breathingOffset, 0],
      rotation: [0, 0, 90]
    }),
    Hips: rotation(12, 0, -4),
    Abdomen: rotation(8, 0, 0),
    Torso: rotation(5, 0, 0),
    Neck: rotation(-4, 0, -5),
    Head: rotation(-6, 0, -8),
    ShoulderL: rotation(0, 0, -5),
    ShoulderR: rotation(0, 0, 5),
    UpperArmL: rotation(-10, -25, -45),
    UpperArmR: rotation(10, 25, 45),
    LowerArmL: rotation(-10, -45, -65),
    LowerArmR: rotation(10, 45, 65),
    UpperLegL: rotation(-38, 0, -15),
    UpperLegR: rotation(-28, 0, 12),
    LowerLegL: rotation(72, 0, 7),
    LowerLegR: rotation(60, 0, -7),
    FootL: position(0.3, -0.12 + breathingOffset, 0.12),
    FootR: position(1.15, 0 + breathingOffset, 0),
    FootLRotation: rotation(-12, 0, -78),
    FootRRotation: rotation(-10, 0, -72)
  }
}

function createPoseClip(name, duration, bones, frames) {
  const animationBones = new Set(
    frames.flatMap(({ poses }) =>
      Object.keys(poses).map((boneName) => normalizePoseBoneName(boneName))
    )
  )
  const times = frames.map(({ time }) => time)
  const tracks = []

  for (const boneName of animationBones) {
    const bone = requiredBone(bones, boneName)
    const keyedPoses = frames.map(({ poses }) =>
      getFrameBonePose(poses, boneName)
    )

    if (keyedPoses.some((bonePose) => bonePose.position)) {
      tracks.push(
        new VectorKeyframeTrack(
          `${boneName}.position`,
          times,
          keyedPoses.flatMap((bonePose) =>
            bone.position
              .clone()
              .add(new Vector3().fromArray(bonePose.position ?? [0, 0, 0]))
              .toArray()
          )
        )
      )
    }

    if (keyedPoses.some((bonePose) => bonePose.rotation)) {
      tracks.push(
        new QuaternionKeyframeTrack(
          `${boneName}.quaternion`,
          times,
          keyedPoses.flatMap((bonePose) =>
            bone.quaternion
              .clone()
              .multiply(
                new Quaternion().setFromEuler(
                  new Euler(
                    ...degreesToRadians(bonePose.rotation ?? [0, 0, 0]),
                    'XYZ'
                  )
                )
              )
              .toArray()
          )
        )
      )
    }
  }

  return new AnimationClip(name, duration, tracks)
}

function getFrameBonePose(poses, boneName) {
  return {
    ...(poses[boneName] ?? {}),
    ...(poses[`${boneName}Rotation`] ?? {})
  }
}

function normalizePoseBoneName(name) {
  return name.endsWith('Rotation') ? name.slice(0, -'Rotation'.length) : name
}

function requiredBone(bones, name) {
  const bone = bones.get(name)

  if (!bone) {
    throw new Error(`Rae rig is missing required bone ${name}`)
  }

  return bone
}

function frame(time, poses) {
  return { poses, time }
}

function pose({ position: positionOffset, rotation: rotationDegrees }) {
  return {
    ...(positionOffset ? { position: positionOffset } : {}),
    ...(rotationDegrees ? { rotation: rotationDegrees } : {})
  }
}

function position(x, y, z) {
  return { position: [x, y, z] }
}

function rotation(x, y, z) {
  return { rotation: [x, y, z] }
}

function degreesToRadians(values) {
  return values.map((value) => (value * Math.PI) / 180)
}
