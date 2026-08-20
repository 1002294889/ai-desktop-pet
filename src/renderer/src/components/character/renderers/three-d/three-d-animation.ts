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
  headY: number
  headRotationZ: number
  leftArmRotationZ: number
  rightArmRotationZ: number
  leftLegRotationX: number
  rightLegRotationX: number
  eyeScaleY: number
}

const RESTING_POSE: ProceduralThreeDPose = {
  rootX: 0,
  rootY: 0,
  rootRotationX: 0,
  rootRotationZ: 0,
  rootScale: 1,
  headY: 0,
  headRotationZ: 0,
  leftArmRotationZ: 0.2,
  rightArmRotationZ: -0.2,
  leftLegRotationX: 0,
  rightLegRotationX: 0,
  eyeScaleY: 1
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

  pose.rootY = Math.sin(cycle * 0.34) * 0.025 * energy
  pose.rootRotationZ = Math.sin(cycle * 0.22) * 0.018 * energy
  pose.headY = Math.sin(cycle * 0.34 + 0.7) * 0.018 * energy

  switch (action) {
    case 'walk_left':
    case 'walk_right': {
      const stride = Math.sin(cycle * 1.35)
      pose.rootY = Math.abs(Math.sin(cycle * 1.35)) * 0.1
      pose.rootRotationZ = stride * 0.035
      pose.leftArmRotationZ = 0.2 + stride * 0.42
      pose.rightArmRotationZ = -0.2 + stride * 0.42
      pose.leftLegRotationX = stride * 0.48
      pose.rightLegRotationX = -stride * 0.48
      break
    }
    case 'sit':
      pose.rootY = -0.34 + Math.sin(cycle * 0.22) * 0.018 * energy
      pose.rootRotationX = -0.08
      pose.leftLegRotationX = -0.7
      pose.rightLegRotationX = -0.7
      break
    case 'sleep':
      pose.rootY = -0.63 + Math.sin(cycle * 0.12) * 0.012
      pose.rootRotationZ = 0.25
      pose.rootScale = 0.96
      pose.headRotationZ = 0.12
      pose.leftArmRotationZ = 0.55
      pose.rightArmRotationZ = -0.55
      pose.eyeScaleY = 0.08
      break
    case 'wake': {
      const eased = MathUtils.smoothstep(progress, 0, 1)
      pose.rootY = MathUtils.lerp(-0.48, 0, eased)
      pose.rootRotationZ = MathUtils.lerp(0.2, 0, eased)
      pose.eyeScaleY = MathUtils.lerp(0.08, 1, eased)
      break
    }
    case 'happy':
      pose.rootY = Math.abs(Math.sin(cycle * 1.2)) * 0.22
      pose.rootScale = 1 + Math.sin(cycle * 1.2) * 0.035
      pose.rootRotationZ = Math.sin(cycle * 0.8) * 0.08
      pose.leftArmRotationZ = -0.7
      pose.rightArmRotationZ = 0.7
      break
    case 'angry':
      pose.rootX = Math.sin(cycle * 2.5) * 0.045
      pose.rootRotationZ = Math.sin(cycle * 2.5) * 0.04
      pose.leftArmRotationZ = 0.85
      pose.rightArmRotationZ = -0.85
      pose.headRotationZ = Math.sin(cycle * 2.5) * 0.035
      break
    case 'jump':
      pose.rootY = Math.sin(Math.PI * progress) * 0.9
      pose.rootScale = 1 + Math.sin(Math.PI * progress) * 0.06
      pose.leftArmRotationZ = -0.8 * Math.sin(Math.PI * progress)
      pose.rightArmRotationZ = 0.8 * Math.sin(Math.PI * progress)
      break
    case 'wave':
      pose.rightArmRotationZ =
        -1.05 - Math.sin(cycle * 2.1) * 0.42 * Math.sin(Math.PI * progress)
      pose.leftArmRotationZ = 0.3
      pose.headRotationZ = -0.06
      break
    case 'talk':
      pose.rootY = Math.abs(Math.sin(cycle * 1.1)) * 0.055
      pose.headY = Math.sin(cycle * 1.1) * 0.04
      pose.headRotationZ = Math.sin(cycle * 0.75) * 0.045
      break
    case 'dragged':
      pose.rootRotationZ = -0.11 + Math.sin(cycle * 0.8) * 0.04
      pose.rootScale = 1.04
      pose.leftArmRotationZ = 0.65
      pose.rightArmRotationZ = -0.65
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

function normalizeClipName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_')
}
