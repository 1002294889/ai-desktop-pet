import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  AnimationClip,
  Bone,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
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

async function main() {
  const tPoseRig = createHumanoidRig(T_POSE_NAMES, {
    hipsHeight: 1.34,
    upperArmLength: 0.58,
    lowerArmLength: 0.46,
    upperLegLength: 0.62,
    lowerLegLength: 0.58,
    armAngle: 0,
    forearmTwist: 0
  })
  const aPoseRig = createHumanoidRig(A_POSE_NAMES, {
    hipsHeight: 1.5,
    upperArmLength: 0.46,
    lowerArmLength: 0.36,
    upperLegLength: 0.72,
    lowerLegLength: 0.67,
    armAngle: 0.66,
    forearmTwist: 0.32
  })

  await mkdir(outputDirectory, { recursive: true })
  await exportMotionGlb(
    'celebrate.glb',
    'OriginalTPoseMotionScene',
    tPoseRig,
    createTPoseCelebrateClip(tPoseRig)
  )
  await exportMotionGlb(
    'groove-a-pose.glb',
    'OriginalAPoseMotionScene',
    aPoseRig,
    createAPoseGrooveClip(aPoseRig)
  )
}

async function exportMotionGlb(fileName, sceneName, rig, clip) {
  const scene = new Scene()

  scene.name = sceneName
  scene.add(rig.bones.hips)
  scene.updateMatrixWorld(true)
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

  const outputPath = resolve(outputDirectory, fileName)

  await writeFile(outputPath, new Uint8Array(exported))

  const verified = await new GLTFLoader().parseAsync(exported, '')
  const verifiedClip = verified.animations.find(({ name }) => name === clip.name)

  if (!verifiedClip || verifiedClip.tracks.length !== clip.tracks.length) {
    throw new Error(`Generated GLB did not preserve ${clip.name} and its tracks`)
  }

  for (const bone of Object.values(rig.bones)) {
    if (!verified.scene.getObjectByName(bone.name)) {
      throw new Error(`Generated GLB did not preserve motion bone ${bone.name}`)
    }
  }

  console.info(`Generated ${outputPath} (${exported.byteLength} bytes)`)
  console.info(`Animation clip: ${verifiedClip.name}, ${verifiedClip.tracks.length} tracks`)
}

function createHumanoidRig(names, proportions) {
  const bones = {
    hips: namedBone(names.hips, [0, proportions.hipsHeight, 0]),
    spine: namedBone(names.spine, [0, 0.3, 0]),
    chest: namedBone(names.chest, [0, 0.4, 0]),
    neck: namedBone(names.neck, [0, 0.3, 0]),
    head: namedBone(names.head, [0, 0.25, 0]),
    leftShoulder: namedBone(names.leftShoulder, [-0.34, 0.12, 0]),
    rightShoulder: namedBone(names.rightShoulder, [0.34, 0.12, 0]),
    leftUpperArm: namedBone(names.leftUpperArm, [-0.18, 0, 0]),
    rightUpperArm: namedBone(names.rightUpperArm, [0.18, 0, 0]),
    leftLowerArm: namedBone(names.leftLowerArm, [-proportions.upperArmLength, 0, 0]),
    rightLowerArm: namedBone(names.rightLowerArm, [proportions.upperArmLength, 0, 0]),
    leftHand: namedBone(names.leftHand, [-proportions.lowerArmLength, 0, 0]),
    rightHand: namedBone(names.rightHand, [proportions.lowerArmLength, 0, 0]),
    leftUpperLeg: namedBone(names.leftUpperLeg, [-0.25, -0.05, 0]),
    rightUpperLeg: namedBone(names.rightUpperLeg, [0.25, -0.05, 0]),
    leftLowerLeg: namedBone(names.leftLowerLeg, [0, -proportions.upperLegLength, 0]),
    rightLowerLeg: namedBone(names.rightLowerLeg, [0, -proportions.upperLegLength, 0]),
    leftFoot: namedBone(names.leftFoot, [0, -proportions.lowerLegLength, 0.14]),
    rightFoot: namedBone(names.rightFoot, [0, -proportions.lowerLegLength, 0.14])
  }

  bones.leftUpperArm.quaternion.setFromEuler(
    new Euler(0, 0, proportions.armAngle)
  )
  bones.rightUpperArm.quaternion.setFromEuler(
    new Euler(0, 0, -proportions.armAngle)
  )
  bones.leftLowerArm.quaternion.setFromEuler(
    new Euler(proportions.forearmTwist, 0, 0)
  )
  bones.rightLowerArm.quaternion.setFromEuler(
    new Euler(-proportions.forearmTwist, 0, 0)
  )
  bones.leftFoot.quaternion.setFromEuler(new Euler(-0.14, 0, 0))
  bones.rightFoot.quaternion.setFromEuler(new Euler(-0.14, 0, 0))

  bones.hips.add(bones.spine, bones.leftUpperLeg, bones.rightUpperLeg)
  bones.spine.add(bones.chest)
  bones.chest.add(bones.neck, bones.leftShoulder, bones.rightShoulder)
  bones.neck.add(bones.head)
  bones.leftShoulder.add(bones.leftUpperArm)
  bones.leftUpperArm.add(bones.leftLowerArm)
  bones.leftLowerArm.add(bones.leftHand)
  bones.rightShoulder.add(bones.rightUpperArm)
  bones.rightUpperArm.add(bones.rightLowerArm)
  bones.rightLowerArm.add(bones.rightHand)
  bones.leftUpperLeg.add(bones.leftLowerLeg)
  bones.leftLowerLeg.add(bones.leftFoot)
  bones.rightUpperLeg.add(bones.rightLowerLeg)
  bones.rightLowerLeg.add(bones.rightFoot)
  bones.hips.updateMatrixWorld(true)

  return { bones }
}

function namedBone(name, position) {
  const bone = new Bone()

  bone.name = name
  bone.position.fromArray(position)
  return bone
}

function createTPoseCelebrateClip(rig) {
  const times = [0, 0.22, 0.5, 0.78, 1.06, 1.34, 1.7]
  const { bones } = rig

  return new AnimationClip('CelebrateT', 1.7, [
    positionTrack(bones.hips, times, [
      [0, 0, 0],
      [0.08, 0.14, 0.02],
      [0.18, 0.48, 0.05],
      [0.28, 0.04, 0.08],
      [0.38, 0.32, 0.1],
      [0.48, 0.03, 0.12],
      [0.62, 0, 0.16]
    ]),
    rotationTrack(bones.spine, times, zSwing([0, -0.08, 0.12, -0.12, 0.1, -0.06, 0])),
    rotationTrack(bones.chest, times, ySwing([0, 0.08, -0.1, 0.12, -0.1, 0.05, 0])),
    rotationTrack(bones.neck, times, zSwing([0, 0.05, -0.06, 0.07, -0.05, 0.03, 0])),
    rotationTrack(bones.head, times, zSwing([0, 0.12, -0.14, 0.15, -0.12, 0.08, 0])),
    rotationTrack(bones.leftShoulder, times, zSwing([0, -0.12, -0.2, -0.1, -0.22, -0.08, 0])),
    rotationTrack(bones.rightShoulder, times, zSwing([0, 0.12, 0.2, 0.1, 0.22, 0.08, 0])),
    rotationTrack(bones.leftUpperArm, times, zSwing([0, -0.6, -1.35, -0.8, -1.55, -0.7, 0])),
    rotationTrack(bones.rightUpperArm, times, zSwing([0, 0.6, 1.35, 0.8, 1.55, 0.7, 0])),
    rotationTrack(bones.leftLowerArm, times, ySwing([0, 0.35, 0.75, 0.3, 0.82, 0.25, 0])),
    rotationTrack(bones.rightLowerArm, times, ySwing([0, -0.35, -0.75, -0.3, -0.82, -0.25, 0])),
    rotationTrack(bones.leftHand, times, zSwing([0, -0.18, 0.22, -0.2, 0.25, -0.12, 0])),
    rotationTrack(bones.rightHand, times, zSwing([0, 0.18, -0.22, 0.2, -0.25, 0.12, 0])),
    rotationTrack(bones.leftUpperLeg, times, xSwing([0, -0.2, 0.28, -0.16, 0.24, -0.1, 0])),
    rotationTrack(bones.rightUpperLeg, times, xSwing([0, 0.2, -0.28, 0.16, -0.24, 0.1, 0])),
    rotationTrack(bones.leftLowerLeg, times, xSwing([0, 0.16, 0.42, 0.1, 0.36, 0.08, 0])),
    rotationTrack(bones.rightLowerLeg, times, xSwing([0, 0.1, 0.32, 0.16, 0.4, 0.08, 0])),
    rotationTrack(bones.leftFoot, times, xSwing([0, -0.08, 0.2, -0.06, 0.16, -0.04, 0])),
    rotationTrack(bones.rightFoot, times, xSwing([0, -0.06, 0.16, -0.08, 0.2, -0.04, 0]))
  ])
}

function createAPoseGrooveClip(rig) {
  const times = [0, 0.2, 0.46, 0.72, 0.98, 1.24, 1.52, 1.85]
  const { bones } = rig

  return new AnimationClip('GrooveA', 1.85, [
    positionTrack(bones.hips, times, [
      [0, 0, 0],
      [-0.05, 0.08, 0.03],
      [0.06, 0.22, 0.02],
      [-0.1, 0.05, 0.05],
      [0.11, 0.25, 0.04],
      [-0.08, 0.05, 0.02],
      [0.04, 0.14, 0.01],
      [0, 0, 0]
    ]),
    rotationTrack(bones.spine, times, zSwing([0, 0.12, -0.15, 0.16, -0.14, 0.12, -0.08, 0])),
    rotationTrack(bones.chest, times, ySwing([0, -0.16, 0.2, -0.22, 0.18, -0.14, 0.08, 0])),
    rotationTrack(bones.neck, times, ySwing([0, 0.08, -0.1, 0.12, -0.1, 0.08, -0.04, 0])),
    rotationTrack(bones.head, times, zSwing([0, -0.14, 0.18, -0.16, 0.2, -0.12, 0.08, 0])),
    rotationTrack(bones.leftShoulder, times, zSwing([0, -0.08, -0.18, -0.1, -0.2, -0.08, -0.04, 0])),
    rotationTrack(bones.rightShoulder, times, zSwing([0, 0.08, 0.18, 0.1, 0.2, 0.08, 0.04, 0])),
    rotationTrack(bones.leftUpperArm, times, zSwing([0, -0.4, -0.85, -0.35, -1.0, -0.45, -0.7, 0])),
    rotationTrack(bones.rightUpperArm, times, zSwing([0, 0.75, 0.35, 0.95, 0.42, 0.9, 0.5, 0])),
    rotationTrack(bones.leftLowerArm, times, ySwing([0, 0.45, 0.8, 0.3, 0.9, 0.35, 0.65, 0])),
    rotationTrack(bones.rightLowerArm, times, ySwing([0, -0.7, -0.35, -0.82, -0.3, -0.75, -0.42, 0])),
    rotationTrack(bones.leftHand, times, xSwing([0, 0.3, -0.25, 0.35, -0.3, 0.28, -0.2, 0])),
    rotationTrack(bones.rightHand, times, xSwing([0, -0.25, 0.3, -0.3, 0.34, -0.25, 0.18, 0])),
    rotationTrack(bones.leftUpperLeg, times, xSwing([0, 0.18, -0.28, 0.22, -0.3, 0.18, -0.12, 0])),
    rotationTrack(bones.rightUpperLeg, times, xSwing([0, -0.24, 0.2, -0.3, 0.24, -0.2, 0.14, 0])),
    rotationTrack(bones.leftLowerLeg, times, xSwing([0, 0.36, 0.12, 0.42, 0.1, 0.34, 0.16, 0])),
    rotationTrack(bones.rightLowerLeg, times, xSwing([0, 0.12, 0.4, 0.08, 0.44, 0.14, 0.3, 0])),
    rotationTrack(bones.leftFoot, times, xSwing([0, 0.16, -0.12, 0.2, -0.1, 0.16, -0.08, 0])),
    rotationTrack(bones.rightFoot, times, xSwing([0, -0.12, 0.18, -0.08, 0.2, -0.1, 0.14, 0]))
  ])
}

function positionTrack(bone, times, offsets) {
  const values = offsets.flatMap(([x, y, z]) => [
    bone.position.x + x,
    bone.position.y + y,
    bone.position.z + z
  ])

  return new VectorKeyframeTrack(`${bone.name}.position`, times, values)
}

function rotationTrack(bone, times, deltaEulers) {
  const values = deltaEulers.flatMap(([x, y, z]) =>
    bone.quaternion
      .clone()
      .multiply(new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')))
      .toArray()
  )

  return new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values)
}

function xSwing(values) {
  return values.map((value) => [value, 0, 0])
}

function ySwing(values) {
  return values.map((value) => [0, value, 0])
}

function zSwing(values) {
  return values.map((value) => [0, 0, value])
}

const T_POSE_NAMES = {
  hips: 'TP_Hips',
  spine: 'TP_Spine',
  chest: 'TP_Chest',
  neck: 'TP_Neck',
  head: 'TP_Head',
  leftShoulder: 'TP_L_Shoulder',
  rightShoulder: 'TP_R_Shoulder',
  leftUpperArm: 'TP_L_UpperArm',
  rightUpperArm: 'TP_R_UpperArm',
  leftLowerArm: 'TP_L_LowerArm',
  rightLowerArm: 'TP_R_LowerArm',
  leftHand: 'TP_L_Hand',
  rightHand: 'TP_R_Hand',
  leftUpperLeg: 'TP_L_Thigh',
  rightUpperLeg: 'TP_R_Thigh',
  leftLowerLeg: 'TP_L_Shin',
  rightLowerLeg: 'TP_R_Shin',
  leftFoot: 'TP_L_Foot',
  rightFoot: 'TP_R_Foot'
}

const A_POSE_NAMES = {
  hips: 'AP_Pelvis',
  spine: 'AP_Lumbar',
  chest: 'AP_Thorax',
  neck: 'AP_NeckJoint',
  head: 'AP_HeadJoint',
  leftShoulder: 'AP_LeftClavicle',
  rightShoulder: 'AP_RightClavicle',
  leftUpperArm: 'AP_LeftUpperArm',
  rightUpperArm: 'AP_RightUpperArm',
  leftLowerArm: 'AP_LeftForearm',
  rightLowerArm: 'AP_RightForearm',
  leftHand: 'AP_LeftPalm',
  rightHand: 'AP_RightPalm',
  leftUpperLeg: 'AP_LeftThigh',
  rightUpperLeg: 'AP_RightThigh',
  leftLowerLeg: 'AP_LeftCalf',
  rightLowerLeg: 'AP_RightCalf',
  leftFoot: 'AP_LeftAnkle',
  rightFoot: 'AP_RightAnkle'
}

await main()
