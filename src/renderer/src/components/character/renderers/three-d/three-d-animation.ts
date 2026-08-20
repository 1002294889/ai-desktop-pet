import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  type Object3D
} from 'three'

import type { EmotionSnapshot } from '../../../../../../shared/companion-state'
import type { PetAction } from '../../../../../../shared/pet-action'

export const DEFAULT_3D_ACTION_DURATIONS_MS: Readonly<
  Partial<Record<PetAction, number>>
> = {
  wake: 900,
  happy: 1_300,
  angry: 1_200,
  jump: 950,
  wave: 1_450,
  talk: 1_150,
  dragged: 900
}

export interface ProceduralThreeDPose {
  rootX: number
  rootY: number
  rootRotationX: number
  rootRotationZ: number
  rootScale: number
  rootScaleX: number
  rootScaleY: number
  rootScaleZ: number
  headY: number
  headRotationX: number
  headRotationZ: number
  leftEarRotationZ: number
  rightEarRotationZ: number
  leftArmRotationX: number
  leftArmRotationZ: number
  rightArmRotationX: number
  rightArmRotationZ: number
  leftLegRotationX: number
  leftLegRotationZ: number
  rightLegRotationX: number
  rightLegRotationZ: number
  legY: number
  legZ: number
  eyeScaleY: number
  mouthScaleY: number
  tailRotationZ: number
  shadowScaleX: number
  shadowScaleY: number
  shadowOpacity: number
}

const RESTING_POSE: ProceduralThreeDPose = {
  rootX: 0,
  rootY: 0,
  rootRotationX: 0,
  rootRotationZ: 0,
  rootScale: 1,
  rootScaleX: 1,
  rootScaleY: 1,
  rootScaleZ: 1,
  headY: 0,
  headRotationX: 0,
  headRotationZ: 0,
  leftEarRotationZ: 0,
  rightEarRotationZ: 0,
  leftArmRotationX: 0,
  leftArmRotationZ: -0.16,
  rightArmRotationX: 0,
  rightArmRotationZ: 0.16,
  leftLegRotationX: 0,
  leftLegRotationZ: -0.04,
  rightLegRotationX: 0,
  rightLegRotationZ: 0.04,
  legY: 0,
  legZ: 0,
  eyeScaleY: 1,
  mouthScaleY: 0.16,
  tailRotationZ: 0,
  shadowScaleX: 1,
  shadowScaleY: 1,
  shadowOpacity: 0.12
}

export function createProceduralThreeDPose(
  action: PetAction,
  elapsedSeconds: number,
  durationMs: number | undefined,
  emotion: EmotionSnapshot | undefined
): ProceduralThreeDPose {
  const pose = { ...RESTING_POSE }
  const energy = getEmotionEnergy(emotion)
  const cycle = elapsedSeconds * Math.PI * 2
  const progress = getActionProgress(elapsedSeconds, durationMs)
  const gentleEntry = smootherStep(MathUtils.clamp(elapsedSeconds / 0.5, 0, 1))
  const breathing = Math.sin(cycle * 0.22)

  pose.rootY = breathing * 0.018 * energy
  pose.rootScaleX = 1 - breathing * 0.004 * energy
  pose.rootScaleY = 1 + breathing * 0.009 * energy
  pose.rootRotationZ = Math.sin(cycle * 0.12) * 0.018 * energy
  pose.headY = Math.sin(cycle * 0.22 + 0.7) * 0.014 * energy
  pose.headRotationZ = -pose.rootRotationZ * 0.45
  pose.leftEarRotationZ = Math.sin(cycle * 0.14 + 0.4) * 0.025 * energy
  pose.rightEarRotationZ = Math.sin(cycle * 0.14 + 1.2) * 0.025 * energy
  pose.tailRotationZ = Math.sin(cycle * 0.18 + 0.8) * 0.08 * energy

  switch (action) {
    case 'walk_left':
    case 'walk_right': {
      const stride = Math.sin(cycle * 1.04)
      const step = Math.abs(stride)

      pose.rootY = step * 0.065
      pose.rootRotationX = 0.025
      pose.rootRotationZ = stride * 0.028
      pose.rootScaleY = 1 - step * 0.012
      pose.headY = step * 0.018
      pose.headRotationZ = -stride * 0.025
      pose.leftArmRotationX = -stride * 0.55
      pose.rightArmRotationX = stride * 0.55
      pose.leftLegRotationX = stride * 0.58
      pose.rightLegRotationX = -stride * 0.58
      pose.leftEarRotationZ = -stride * 0.035
      pose.rightEarRotationZ = -stride * 0.035
      pose.tailRotationZ = -stride * 0.16
      pose.shadowScaleX = 1.03
      pose.shadowScaleY = 0.92
      break
    }
    case 'sit': {
      pose.rootY = MathUtils.lerp(0, -0.25, gentleEntry) + breathing * 0.012 * energy
      pose.rootRotationX = MathUtils.lerp(0, -0.045, gentleEntry)
      pose.rootScaleY = MathUtils.lerp(1, 0.96, gentleEntry)
      pose.headY = MathUtils.lerp(0, -0.035, gentleEntry) + breathing * 0.01
      pose.leftArmRotationZ = MathUtils.lerp(-0.16, -0.34, gentleEntry)
      pose.rightArmRotationZ = MathUtils.lerp(0.16, 0.34, gentleEntry)
      pose.leftLegRotationX = MathUtils.lerp(0, -1.05, gentleEntry)
      pose.rightLegRotationX = MathUtils.lerp(0, -1.05, gentleEntry)
      pose.leftLegRotationZ = MathUtils.lerp(-0.04, -0.2, gentleEntry)
      pose.rightLegRotationZ = MathUtils.lerp(0.04, 0.2, gentleEntry)
      pose.legY = MathUtils.lerp(0, 0.06, gentleEntry)
      pose.legZ = MathUtils.lerp(0, 0.12, gentleEntry)
      pose.shadowScaleX = MathUtils.lerp(1, 1.12, gentleEntry)
      pose.shadowScaleY = MathUtils.lerp(1, 0.86, gentleEntry)
      break
    }
    case 'sleep': {
      const settle = smootherStep(MathUtils.clamp(elapsedSeconds / 0.85, 0, 1))
      const sleepyBreath = Math.sin(cycle * 0.12)

      pose.rootY = MathUtils.lerp(0, -0.61, settle) + sleepyBreath * 0.01
      pose.rootRotationZ = MathUtils.lerp(0, 0.62, settle)
      pose.rootScale = MathUtils.lerp(1, 0.94, settle)
      pose.rootScaleX = 1 + sleepyBreath * 0.008
      pose.rootScaleY = 1 - sleepyBreath * 0.006
      pose.headY = MathUtils.lerp(0, -0.08, settle)
      pose.headRotationX = MathUtils.lerp(0, 0.08, settle)
      pose.headRotationZ = MathUtils.lerp(0, 0.16, settle)
      pose.leftEarRotationZ = MathUtils.lerp(0, -0.12, settle)
      pose.rightEarRotationZ = MathUtils.lerp(0, 0.1, settle)
      pose.leftArmRotationZ = MathUtils.lerp(-0.16, -0.82, settle)
      pose.rightArmRotationZ = MathUtils.lerp(0.16, 0.78, settle)
      pose.leftLegRotationX = MathUtils.lerp(0, -0.45, settle)
      pose.rightLegRotationX = MathUtils.lerp(0, -0.7, settle)
      pose.eyeScaleY = MathUtils.lerp(1, 0.07, settle)
      pose.mouthScaleY = 0.08
      pose.tailRotationZ = MathUtils.lerp(0, -0.28, settle)
      pose.shadowScaleX = MathUtils.lerp(1, 1.28, settle)
      pose.shadowScaleY = MathUtils.lerp(1, 0.68, settle)
      pose.shadowOpacity = MathUtils.lerp(0.12, 0.1, settle)
      break
    }
    case 'wake': {
      const eased = smootherStep(progress)
      const eyeWake = smootherStep(MathUtils.clamp((progress - 0.18) / 0.55, 0, 1))

      pose.rootY = MathUtils.lerp(-0.58, 0, eased)
      pose.rootRotationZ = MathUtils.lerp(0.58, 0, eased)
      pose.rootScale = MathUtils.lerp(0.95, 1, eased)
      pose.headY = MathUtils.lerp(-0.08, 0, eased)
      pose.headRotationX = MathUtils.lerp(0.08, -0.04, eased)
      pose.headRotationZ = MathUtils.lerp(0.14, 0, eased)
      pose.leftArmRotationZ = MathUtils.lerp(-0.72, -0.16, eased)
      pose.rightArmRotationZ = MathUtils.lerp(0.72, 0.16, eased)
      pose.eyeScaleY = MathUtils.lerp(0.07, 1, eyeWake)
      pose.shadowScaleX = MathUtils.lerp(1.25, 1, eased)
      pose.shadowScaleY = MathUtils.lerp(0.7, 1, eased)
      break
    }
    case 'happy': {
      const bounce = Math.abs(Math.sin(cycle * 1.32))
      const joy = Math.sin(cycle * 0.78)

      pose.rootY = bounce * 0.2
      pose.rootScaleX = 1 + bounce * 0.025
      pose.rootScaleY = 1 - bounce * 0.018
      pose.rootRotationZ = joy * 0.065
      pose.headY = bounce * 0.035
      pose.headRotationZ = -joy * 0.045
      pose.leftArmRotationZ = -2.05 + joy * 0.12
      pose.rightArmRotationZ = 2.05 + joy * 0.12
      pose.leftEarRotationZ = -0.08 - bounce * 0.04
      pose.rightEarRotationZ = 0.08 + bounce * 0.04
      pose.eyeScaleY = 0.78 + bounce * 0.16
      pose.tailRotationZ = Math.sin(cycle * 1.6) * 0.28
      pose.shadowScaleX = 1 - bounce * 0.12
      pose.shadowScaleY = 1 - bounce * 0.12
      pose.shadowOpacity = 0.12 - bounce * 0.035
      break
    }
    case 'angry':
      pose.rootX = Math.sin(cycle * 2.5) * 0.045
      pose.rootRotationZ = Math.sin(cycle * 2.5) * 0.04
      pose.rootScaleX = 1.035
      pose.rootScaleY = 0.98
      pose.leftArmRotationZ = 0.72
      pose.rightArmRotationZ = -0.72
      pose.headRotationZ = Math.sin(cycle * 2.5) * 0.035
      pose.eyeScaleY = 0.62
      pose.tailRotationZ = -0.2 + Math.sin(cycle * 2.5) * 0.08
      break
    case 'jump': {
      const airborne = Math.pow(Math.sin(Math.PI * progress), 0.86)
      const anticipation =
        progress < 0.18 ? Math.sin((progress / 0.18) * Math.PI) : 0
      const landing =
        progress > 0.76
          ? Math.sin(((progress - 0.76) / 0.24) * Math.PI)
          : 0

      pose.rootY = airborne * 0.82 - anticipation * 0.045
      pose.rootScaleX = 1 + anticipation * 0.1 - airborne * 0.025 + landing * 0.09
      pose.rootScaleY = 1 - anticipation * 0.13 + airborne * 0.07 - landing * 0.12
      pose.rootScaleZ = 1 + anticipation * 0.04
      pose.headY = airborne * 0.03
      pose.leftArmRotationZ = MathUtils.lerp(-0.16, -1.72, airborne)
      pose.rightArmRotationZ = MathUtils.lerp(0.16, 1.72, airborne)
      pose.leftLegRotationX = -airborne * 0.38
      pose.rightLegRotationX = -airborne * 0.38
      pose.leftEarRotationZ = airborne * 0.07
      pose.rightEarRotationZ = -airborne * 0.07
      pose.shadowScaleX = 1 - airborne * 0.42
      pose.shadowScaleY = 1 - airborne * 0.34
      pose.shadowOpacity = 0.12 - airborne * 0.075
      break
    }
    case 'wave': {
      const gesture = attackRelease(progress, 0.18, 0.2)
      const wave = Math.sin(cycle * 1.85) * 0.18

      pose.rootY = Math.abs(Math.sin(cycle * 0.92)) * 0.035 * gesture
      pose.rootRotationZ = -0.025 * gesture
      pose.rightArmRotationZ = MathUtils.lerp(0.16, 2.7 + wave, gesture)
      pose.rightArmRotationX = -0.08 * gesture
      pose.leftArmRotationZ = MathUtils.lerp(-0.16, -0.28, gesture)
      pose.headRotationZ = -0.09 * gesture
      pose.rightEarRotationZ = 0.07 * gesture
      pose.tailRotationZ = Math.sin(cycle * 1.1) * 0.14 * gesture
      break
    }
    case 'talk': {
      const speech = Math.sin(cycle * 1.58)

      pose.rootY = Math.abs(speech) * 0.035
      pose.rootRotationZ = Math.sin(cycle * 0.54) * 0.025
      pose.headY = speech * 0.026
      pose.headRotationX = -0.025 + Math.abs(speech) * 0.035
      pose.headRotationZ = Math.sin(cycle * 0.72) * 0.035
      pose.leftArmRotationZ = -0.22 + speech * 0.08
      pose.rightArmRotationZ = 0.32 + speech * 0.12
      pose.mouthScaleY = 0.22 + Math.abs(speech) * 1.15
      pose.tailRotationZ = Math.sin(cycle * 0.48) * 0.1
      break
    }
    case 'dragged':
      pose.rootRotationZ = -0.11 + Math.sin(cycle * 0.8) * 0.04
      pose.rootScale = 1.04
      pose.leftArmRotationZ = -1.35
      pose.rightArmRotationZ = 1.35
      pose.leftLegRotationX = -0.25
      pose.rightLegRotationX = 0.18
      pose.leftEarRotationZ = -0.1
      pose.rightEarRotationZ = 0.08
      pose.shadowScaleX = 0.88
      pose.shadowScaleY = 0.88
      pose.shadowOpacity = 0.08
      break
    case 'idle':
      break
  }

  return pose
}

export function getFacingTarget(action: PetAction): number | undefined {
  if (action === 'walk_left') {
    return -0.68
  }

  if (action === 'walk_right') {
    return 0.68
  }

  return undefined
}

export class ThreeDSkeletalAnimationAdapter {
  private readonly mixer: AnimationMixer
  private activeAction: AnimationAction | undefined

  constructor(
    private readonly root: Object3D,
    private readonly clips: readonly AnimationClip[]
  ) {
    this.mixer = new AnimationMixer(root)
  }

  playSemanticAction(
    action: PetAction,
    configuredClip: string | undefined,
    loop: boolean
  ): boolean {
    const clip = this.resolveClip(configuredClip ?? action)

    if (!clip) {
      this.activeAction?.fadeOut(0.12)
      this.activeAction = undefined
      return false
    }

    const nextAction = this.mixer.clipAction(clip)

    if (this.activeAction && this.activeAction !== nextAction) {
      this.activeAction.fadeOut(0.12)
    }

    nextAction
      .reset()
      .setLoop(loop ? LoopRepeat : LoopOnce, loop ? Number.POSITIVE_INFINITY : 1)
      .fadeIn(0.12)
      .play()
    nextAction.clampWhenFinished = !loop
    this.activeAction = nextAction
    return true
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.activeAction = undefined
  }

  private resolveClip(name: string): AnimationClip | undefined {
    const normalizedName = normalizeClipName(name)

    return this.clips.find(
      (clip) => normalizeClipName(clip.name) === normalizedName
    )
  }
}

function getEmotionEnergy(emotion: EmotionSnapshot | undefined): number {
  if (!emotion) {
    return 1
  }

  const intensity = MathUtils.clamp(emotion.intensity, 0, 1)

  switch (emotion.state) {
    case 'happy':
    case 'excited':
      return 1 + intensity * 0.45
    case 'calm':
      return 0.72
    case 'sleepy':
      return 0.5
    case 'annoyed':
      return 1 + intensity * 0.18
    case 'neutral':
      return 1
  }
}

function getActionProgress(
  elapsedSeconds: number,
  durationMs: number | undefined
): number {
  if (!durationMs) {
    return Math.min(1, elapsedSeconds)
  }

  return MathUtils.clamp(elapsedSeconds / (durationMs / 1_000), 0, 1)
}

function smootherStep(value: number): number {
  const clamped = MathUtils.clamp(value, 0, 1)

  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10)
}

function attackRelease(
  progress: number,
  attackDuration: number,
  releaseDuration: number
): number {
  const attack = smootherStep(progress / attackDuration)
  const release = smootherStep((1 - progress) / releaseDuration)

  return Math.min(attack, release)
}

function normalizeClipName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_')
}
