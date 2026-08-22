import { Bone, Euler, MathUtils, Object3D, Quaternion } from 'three'

import type { ThreeDLookAtConfiguration } from '../../../../../../shared/character'
import type { PetAction } from '../../../../../../shared/pet-action'

const HEAD_MAX_YAW = 0.24
const HEAD_MAX_PITCH = 0.14
const EYE_MAX_YAW = 0.16
const EYE_MAX_PITCH = 0.11
const HEAD_RESPONSE = 5.5
const EYE_RESPONSE = 13

export interface ThreeDCursorAttentionTarget {
  active: boolean
  x: number
  y: number
}

export interface ThreeDLookAtDiagnostics {
  configured: boolean
  headBone?: string
  leftEyeBone?: string
  rightEyeBone?: string
  missingBones: readonly string[]
}

interface LookAtBoneState {
  bone: Bone
  appliedOffset: Quaternion
}

export class ThreeDLookAtController {
  private readonly head: LookAtBoneState | undefined
  private readonly leftEye: LookAtBoneState | undefined
  private readonly rightEye: LookAtBoneState | undefined
  private readonly diagnostics: ThreeDLookAtDiagnostics
  private readonly offsetEuler = new Euler(0, 0, 0, 'YXZ')
  private readonly inverseOffset = new Quaternion()
  private headYaw = 0
  private headPitch = 0
  private eyeYaw = 0
  private eyePitch = 0

  constructor(root: Object3D, configuration: ThreeDLookAtConfiguration | undefined) {
    const missingBones: string[] = []
    const claimedBones = new Set<Bone>()

    this.head = resolveBone(
      root,
      configuration?.headBone,
      'headBone',
      claimedBones,
      missingBones
    )
    this.leftEye = resolveBone(
      root,
      configuration?.leftEyeBone,
      'leftEyeBone',
      claimedBones,
      missingBones
    )
    this.rightEye = resolveBone(
      root,
      configuration?.rightEyeBone,
      'rightEyeBone',
      claimedBones,
      missingBones
    )
    this.diagnostics = {
      configured: configuration !== undefined,
      ...(this.head ? { headBone: this.head.bone.name } : {}),
      ...(this.leftEye ? { leftEyeBone: this.leftEye.bone.name } : {}),
      ...(this.rightEye ? { rightEyeBone: this.rightEye.bone.name } : {}),
      missingBones
    }

    if (import.meta.env.DEV && missingBones.length > 0) {
      console.info('[ThreeDLookAt] Configured bones were not available:', [
        ...missingBones
      ])
    }
  }

  getDiagnostics(): ThreeDLookAtDiagnostics {
    return this.diagnostics
  }

  beforeAnimationUpdate(): void {
    this.restoreBone(this.head)
    this.restoreBone(this.leftEye)
    this.restoreBone(this.rightEye)
  }

  update(
    deltaSeconds: number,
    target: ThreeDCursorAttentionTarget,
    action: PetAction,
    configuredWeight?: number
  ): void {
    const actionWeight = target.active
      ? MathUtils.clamp(configuredWeight ?? getActionTrackingWeight(action), 0, 1)
      : 0
    const targetX = MathUtils.clamp(target.x, -1, 1) * actionWeight
    const targetY = MathUtils.clamp(target.y, -1, 1) * actionWeight

    this.eyeYaw = MathUtils.damp(
      this.eyeYaw,
      targetX * EYE_MAX_YAW,
      EYE_RESPONSE,
      deltaSeconds
    )
    this.eyePitch = MathUtils.damp(
      this.eyePitch,
      -targetY * EYE_MAX_PITCH,
      EYE_RESPONSE,
      deltaSeconds
    )
    this.headYaw = MathUtils.damp(
      this.headYaw,
      targetX * HEAD_MAX_YAW,
      HEAD_RESPONSE,
      deltaSeconds
    )
    this.headPitch = MathUtils.damp(
      this.headPitch,
      -targetY * HEAD_MAX_PITCH,
      HEAD_RESPONSE,
      deltaSeconds
    )

    this.applyOffset(this.head, this.headPitch, this.headYaw)
    this.applyOffset(this.leftEye, this.eyePitch, this.eyeYaw)
    this.applyOffset(this.rightEye, this.eyePitch, this.eyeYaw)
  }

  dispose(): void {
    this.beforeAnimationUpdate()
  }

  private applyOffset(
    state: LookAtBoneState | undefined,
    pitch: number,
    yaw: number
  ): void {
    if (!state) {
      return
    }

    state.appliedOffset.setFromEuler(this.offsetEuler.set(pitch, yaw, 0))
    state.bone.quaternion.multiply(state.appliedOffset)
  }

  private restoreBone(state: LookAtBoneState | undefined): void {
    if (!state || state.appliedOffset.equals(IDENTITY_QUATERNION)) {
      return
    }

    this.inverseOffset.copy(state.appliedOffset).invert()
    state.bone.quaternion.multiply(this.inverseOffset)
    state.appliedOffset.identity()
  }
}

const IDENTITY_QUATERNION = new Quaternion()

function resolveBone(
  root: Object3D,
  configuredName: string | undefined,
  role: string,
  claimedBones: Set<Bone>,
  missingBones: string[]
): LookAtBoneState | undefined {
  if (!configuredName) {
    return undefined
  }

  const candidate = root.getObjectByName(configuredName)

  if (!(candidate instanceof Bone) || claimedBones.has(candidate)) {
    missingBones.push(`${role}:${configuredName}`)
    return undefined
  }

  claimedBones.add(candidate)
  return { bone: candidate, appliedOffset: new Quaternion() }
}

function getActionTrackingWeight(action: PetAction): number {
  switch (action) {
    case 'sleep':
    case 'dragged':
      return 0
    case 'jump':
      return 0.18
    case 'wake':
      return 0.35
    default:
      return 1
  }
}
