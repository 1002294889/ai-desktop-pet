import {
  AnimationClip,
  Bone,
  Object3D,
  PropertyBinding,
  type KeyframeTrack
} from 'three'

import type { ThreeDAnimationRetargetConfiguration } from '../../../../../../shared/character'

export interface ThreeDAnimationRetargetDiagnostics {
  retargetedTracks: readonly string[]
  droppedTracks: readonly string[]
  missingSourceBones: readonly string[]
  missingTargetBones: readonly string[]
}

export interface ThreeDAnimationRetargetResult {
  clip: AnimationClip
  diagnostics: ThreeDAnimationRetargetDiagnostics
}

/**
 * Rebinds tracks from one compatible skeleton to another using a manifest-owned
 * source-name -> target-name map. This intentionally does not guess bone names
 * or alter rest-pose orientation; packs remain responsible for rig compatibility.
 */
export function retargetThreeDAnimationClip(
  sourceClip: AnimationClip,
  sourceRoot: Object3D,
  targetRoot: Object3D,
  configuration: ThreeDAnimationRetargetConfiguration
): ThreeDAnimationRetargetResult {
  const retargetedTracks: string[] = []
  const droppedTracks: string[] = []
  const missingSourceBones = new Set<string>()
  const missingTargetBones = new Set<string>()
  const tracks: KeyframeTrack[] = []

  for (const sourceTrack of sourceClip.tracks) {
    let parsed: ReturnType<typeof PropertyBinding.parseTrackName>

    try {
      parsed = PropertyBinding.parseTrackName(sourceTrack.name)
    } catch {
      droppedTracks.push(sourceTrack.name)
      continue
    }

    const sourceBoneName = parsed.nodeName
    const targetBoneName = configuration.boneMap[sourceBoneName]

    if (!targetBoneName) {
      droppedTracks.push(sourceTrack.name)
      continue
    }

    if (!sourceRoot.getObjectByName(sourceBoneName)) {
      missingSourceBones.add(sourceBoneName)
      droppedTracks.push(sourceTrack.name)
      continue
    }

    if (!(targetRoot.getObjectByName(targetBoneName) instanceof Bone)) {
      missingTargetBones.add(targetBoneName)
      droppedTracks.push(sourceTrack.name)
      continue
    }

    if (
      parsed.objectName !== undefined ||
      parsed.objectIndex !== undefined ||
      !isSupportedBoneProperty(parsed.propertyName) ||
      parsed.propertyIndex !== undefined
    ) {
      droppedTracks.push(sourceTrack.name)
      continue
    }

    const track = sourceTrack.clone()

    track.name = `${targetBoneName}.${parsed.propertyName}`
    tracks.push(track)
    retargetedTracks.push(`${sourceTrack.name}->${track.name}`)
  }

  return {
    clip: new AnimationClip(sourceClip.name, sourceClip.duration, tracks),
    diagnostics: {
      retargetedTracks,
      droppedTracks,
      missingSourceBones: [...missingSourceBones],
      missingTargetBones: [...missingTargetBones]
    }
  }
}

function isSupportedBoneProperty(
  propertyName: string
): propertyName is 'position' | 'quaternion' | 'scale' {
  return (
    propertyName === 'position' ||
    propertyName === 'quaternion' ||
    propertyName === 'scale'
  )
}
