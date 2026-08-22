import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Euler,
  LoopOnce,
  Object3D,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack
} from 'three'

import {
  HUMANOID_BONE_ROLES,
  type HumanoidBoneRole,
  type ThreeDAnimationRetargetConfiguration,
  type ThreeDDirectAnimationRetargetConfiguration,
  type ThreeDHumanoidAnimationRetargetConfiguration,
  type ThreeDHumanoidBoneMapping
} from '../../../../../../shared/character'

const DEFAULT_SAMPLE_RATE = 30
const MIN_AUTOMATIC_TRANSLATION_SCALE = 0.25
const MAX_AUTOMATIC_TRANSLATION_SCALE = 4

export interface ThreeDAnimationRetargetDiagnostics {
  mode: 'direct' | 'humanoid'
  retargetedTracks: readonly string[]
  droppedTracks: readonly string[]
  missingSourceBones: readonly string[]
  missingTargetBones: readonly string[]
  mappedHumanoidBones: readonly string[]
  sampleCount: number
  translationScale?: number
}

export interface ThreeDAnimationRetargetResult {
  clip: AnimationClip
  diagnostics: ThreeDAnimationRetargetDiagnostics
}

/**
 * Retargets one external clip without mutating the target skeleton. Direct mode
 * preserves the Phase 5 name-rebinding behavior. Humanoid mode bakes source
 * world-space motion deltas into target-local tracks using both rigs' rest poses.
 */
export function retargetThreeDAnimationClip(
  sourceClip: AnimationClip,
  sourceRoot: Object3D,
  targetRoot: Object3D,
  configuration: ThreeDAnimationRetargetConfiguration
): ThreeDAnimationRetargetResult {
  return configuration.mode === 'humanoid'
    ? retargetHumanoidAnimationClip(
        sourceClip,
        sourceRoot,
        targetRoot,
        configuration
      )
    : retargetDirectAnimationClip(
        sourceClip,
        sourceRoot,
        targetRoot,
        configuration
      )
}

function retargetDirectAnimationClip(
  sourceClip: AnimationClip,
  sourceRoot: Object3D,
  targetRoot: Object3D,
  configuration: ThreeDDirectAnimationRetargetConfiguration
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
      !isSupportedDirectBoneProperty(parsed.propertyName) ||
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
      mode: 'direct',
      retargetedTracks,
      droppedTracks,
      missingSourceBones: [...missingSourceBones],
      missingTargetBones: [...missingTargetBones],
      mappedHumanoidBones: [],
      sampleCount: 0
    }
  }
}

interface ResolvedHumanoidBone {
  role: HumanoidBoneRole
  source: Object3D
  target: Bone
  sourceRestWorldQuaternion: Quaternion
  sourceRestWorldPosition: Vector3
  sourceRestLocalPosition: Vector3
  targetRestWorldQuaternion: Quaternion
  targetRestWorldPosition: Vector3
  targetRestLocalPosition: Vector3
  axisCorrection: Quaternion
  inverseAxisCorrection: Quaternion
  targetDepth: number
}

function retargetHumanoidAnimationClip(
  sourceClip: AnimationClip,
  sourceRoot: Object3D,
  targetRoot: Object3D,
  configuration: ThreeDHumanoidAnimationRetargetConfiguration
): ThreeDAnimationRetargetResult {
  sourceRoot.updateMatrixWorld(true)
  targetRoot.updateMatrixWorld(true)

  const missingSourceBones = new Set<string>()
  const missingTargetBones = new Set<string>()
  const resolved = resolveHumanoidBones(
    sourceRoot,
    targetRoot,
    configuration,
    missingSourceBones,
    missingTargetBones
  ).sort((left, right) => left.targetDepth - right.targetDepth)
  const sampleRate = configuration.sampleRate ?? DEFAULT_SAMPLE_RATE
  const times = createSampleTimes(sourceClip.duration, sampleRate)
  const translationScale = getTranslationScale(configuration, resolved)
  const rotationValues = new Map<HumanoidBoneRole, number[]>()
  const previousQuaternions = new Map<HumanoidBoneRole, Quaternion>()
  const hipPositionValues: number[] = []
  const targetMappingByObject = new Map(
    resolved.map((mapping) => [mapping.target, mapping])
  )
  const sourceRestTransforms = captureLocalTransforms(sourceRoot)
  const mixer = new AnimationMixer(sourceRoot)
  const sourceAction = mixer.clipAction(sourceClip)

  for (const mapping of resolved) {
    rotationValues.set(mapping.role, [])
  }

  sourceAction.reset().setLoop(LoopOnce, 1)
  sourceAction.clampWhenFinished = true
  sourceAction.play()

  try {
    for (const time of times) {
      mixer.setTime(time)
      sourceRoot.updateMatrixWorld(true)

      const desiredWorldQuaternions = new Map<Object3D, Quaternion>()

      for (const mapping of resolved) {
        const sourceAnimatedWorld = mapping.source.getWorldQuaternion(
          new Quaternion()
        )
        const sourceDelta = mapping.sourceRestWorldQuaternion
          .clone()
          .invert()
          .multiply(sourceAnimatedWorld)
          .normalize()
        const correctedDelta = mapping.axisCorrection
          .clone()
          .multiply(sourceDelta)
          .multiply(mapping.inverseAxisCorrection)
          .normalize()
        const desiredTargetWorld = mapping.targetRestWorldQuaternion
          .clone()
          .multiply(correctedDelta)
          .normalize()

        desiredWorldQuaternions.set(mapping.target, desiredTargetWorld)
      }

      for (const mapping of resolved) {
        const desiredTargetWorld = desiredWorldQuaternions.get(mapping.target)

        if (!desiredTargetWorld) {
          continue
        }

        const parentWorld = getAnimatedTargetParentQuaternion(
          mapping.target.parent,
          targetMappingByObject,
          desiredWorldQuaternions
        )
        const targetLocal = parentWorld
          .invert()
          .multiply(desiredTargetWorld)
          .normalize()
        const previous = previousQuaternions.get(mapping.role)

        preserveQuaternionContinuity(targetLocal, previous)
        previousQuaternions.set(mapping.role, targetLocal.clone())
        rotationValues.get(mapping.role)?.push(...targetLocal.toArray())

        if (
          mapping.role === 'hips' &&
          configuration.hipTranslation !== 'none'
        ) {
          const sourceLocalDelta = mapping.source.position
            .clone()
            .sub(mapping.sourceRestLocalPosition)
            .applyQuaternion(mapping.axisCorrection)
            .multiplyScalar(translationScale)
          const targetLocalPosition = mapping.targetRestLocalPosition
            .clone()
            .add(sourceLocalDelta)

          hipPositionValues.push(...targetLocalPosition.toArray())
        }
      }
    }
  } finally {
    sourceAction.stop()
    mixer.stopAllAction()
    mixer.uncacheClip(sourceClip)
    mixer.uncacheRoot(sourceRoot)
    restoreLocalTransforms(sourceRestTransforms)
    sourceRoot.updateMatrixWorld(true)
  }

  const tracks: KeyframeTrack[] = []
  const retargetedTracks: string[] = []

  for (const mapping of resolved) {
    const values = rotationValues.get(mapping.role)

    if (!values || values.length === 0) {
      continue
    }

    const trackName = `${mapping.target.name}.quaternion`

    tracks.push(new QuaternionKeyframeTrack(trackName, times, values))
    retargetedTracks.push(
      `${mapping.role}:${mapping.source.name}->${trackName}`
    )
  }

  const hips = resolved.find(({ role }) => role === 'hips')

  if (hips && hipPositionValues.length === times.length * 3) {
    const trackName = `${hips.target.name}.position`

    tracks.push(new VectorKeyframeTrack(trackName, times, hipPositionValues))
    retargetedTracks.push(`hips:${hips.source.name}->${trackName}`)
  }

  const clip = new AnimationClip(sourceClip.name, sourceClip.duration, tracks)

  clip.optimize()

  return {
    clip,
    diagnostics: {
      mode: 'humanoid',
      retargetedTracks,
      droppedTracks: findDroppedHumanoidTracks(sourceClip, resolved),
      missingSourceBones: [...missingSourceBones],
      missingTargetBones: [...missingTargetBones],
      mappedHumanoidBones: resolved.map(
        ({ role, source, target }) => `${role}:${source.name}->${target.name}`
      ),
      sampleCount: times.length,
      translationScale
    }
  }
}

interface LocalTransformSnapshot {
  object: Object3D
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

function captureLocalTransforms(root: Object3D): LocalTransformSnapshot[] {
  const snapshots: LocalTransformSnapshot[] = []

  root.traverse((object) => {
    snapshots.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone()
    })
  })

  return snapshots
}

function restoreLocalTransforms(
  snapshots: readonly LocalTransformSnapshot[]
): void {
  for (const snapshot of snapshots) {
    snapshot.object.position.copy(snapshot.position)
    snapshot.object.quaternion.copy(snapshot.quaternion)
    snapshot.object.scale.copy(snapshot.scale)
  }
}

function resolveHumanoidBones(
  sourceRoot: Object3D,
  targetRoot: Object3D,
  configuration: ThreeDHumanoidAnimationRetargetConfiguration,
  missingSourceBones: Set<string>,
  missingTargetBones: Set<string>
): ResolvedHumanoidBone[] {
  const resolved: ResolvedHumanoidBone[] = []
  const claimedSourceNodes = new Set<Object3D>()
  const claimedTargetBones = new Set<Bone>()

  for (const role of HUMANOID_BONE_ROLES) {
    const configuredMapping = configuration.bones[role]

    if (!configuredMapping) {
      continue
    }

    const source = sourceRoot.getObjectByName(configuredMapping.source)
    const targetCandidate = targetRoot.getObjectByName(configuredMapping.target)

    if (!source || claimedSourceNodes.has(source)) {
      missingSourceBones.add(`${role}:${configuredMapping.source}`)
      continue
    }

    if (!(targetCandidate instanceof Bone) || claimedTargetBones.has(targetCandidate)) {
      missingTargetBones.add(`${role}:${configuredMapping.target}`)
      continue
    }

    const axisCorrection = createAxisCorrection(configuredMapping)

    claimedSourceNodes.add(source)
    claimedTargetBones.add(targetCandidate)
    resolved.push({
      role,
      source,
      target: targetCandidate,
      sourceRestWorldQuaternion: source.getWorldQuaternion(new Quaternion()),
      sourceRestWorldPosition: source.getWorldPosition(new Vector3()),
      sourceRestLocalPosition: source.position.clone(),
      targetRestWorldQuaternion: targetCandidate.getWorldQuaternion(new Quaternion()),
      targetRestWorldPosition: targetCandidate.getWorldPosition(new Vector3()),
      targetRestLocalPosition: targetCandidate.position.clone(),
      axisCorrection,
      inverseAxisCorrection: axisCorrection.clone().invert(),
      targetDepth: getObjectDepth(targetCandidate)
    })
  }

  return resolved
}

function createAxisCorrection(mapping: ThreeDHumanoidBoneMapping): Quaternion {
  const correction = mapping.axisCorrectionDegrees

  if (!correction) {
    return new Quaternion()
  }

  return new Quaternion().setFromEuler(
    new Euler(
      degreesToRadians(correction[0]),
      degreesToRadians(correction[1]),
      degreesToRadians(correction[2]),
      'XYZ'
    )
  )
}

function getAnimatedTargetParentQuaternion(
  parent: Object3D | null,
  mappingsByTarget: ReadonlyMap<Object3D, ResolvedHumanoidBone>,
  desiredWorldQuaternions: ReadonlyMap<Object3D, Quaternion>
): Quaternion {
  if (!parent) {
    return new Quaternion()
  }

  const parentRestWorld = parent.getWorldQuaternion(new Quaternion())
  let ancestor: Object3D | null = parent

  while (ancestor) {
    const ancestorMapping = mappingsByTarget.get(ancestor)
    const ancestorDesired = desiredWorldQuaternions.get(ancestor)

    if (ancestorMapping && ancestorDesired) {
      return ancestorDesired
        .clone()
        .multiply(
          ancestorMapping.targetRestWorldQuaternion.clone().invert()
        )
        .multiply(parentRestWorld)
        .normalize()
    }

    ancestor = ancestor.parent
  }

  return parentRestWorld
}

function getTranslationScale(
  configuration: ThreeDHumanoidAnimationRetargetConfiguration,
  mappings: readonly ResolvedHumanoidBone[]
): number {
  if (typeof configuration.translationScale === 'number') {
    return configuration.translationScale
  }

  const hips = mappings.find(({ role }) => role === 'hips')

  if (!hips) {
    return 1
  }

  const legReferences = getLegReferenceMappings(mappings)

  if (legReferences.length === 0) {
    return 1
  }

  const sourceLength = average(
    legReferences.map(({ sourceRestWorldPosition }) =>
      sourceRestWorldPosition.distanceTo(hips.sourceRestWorldPosition)
    )
  )
  const targetLength = average(
    legReferences.map(({ targetRestWorldPosition }) =>
      targetRestWorldPosition.distanceTo(hips.targetRestWorldPosition)
    )
  )

  if (sourceLength <= Number.EPSILON || targetLength <= Number.EPSILON) {
    return 1
  }

  return Math.min(
    MAX_AUTOMATIC_TRANSLATION_SCALE,
    Math.max(MIN_AUTOMATIC_TRANSLATION_SCALE, targetLength / sourceLength)
  )
}

function getLegReferenceMappings(
  mappings: readonly ResolvedHumanoidBone[]
): ResolvedHumanoidBone[] {
  for (const roles of [
    ['leftFoot', 'rightFoot'],
    ['leftLowerLeg', 'rightLowerLeg'],
    ['leftUpperLeg', 'rightUpperLeg']
  ] as const) {
    const matches = roles.flatMap((role) => {
      const mapping = mappings.find((candidate) => candidate.role === role)
      return mapping ? [mapping] : []
    })

    if (matches.length > 0) {
      return matches
    }
  }

  return []
}

function createSampleTimes(duration: number, sampleRate: number): number[] {
  const safeDuration = Math.max(0, duration)
  const intervals = Math.max(1, Math.ceil(safeDuration * sampleRate))

  return Array.from(
    { length: intervals + 1 },
    (_, index) => (index / intervals) * safeDuration
  )
}

function findDroppedHumanoidTracks(
  sourceClip: AnimationClip,
  mappings: readonly ResolvedHumanoidBone[]
): string[] {
  const mappedSourceNames = new Set(mappings.map(({ source }) => source.name))

  return sourceClip.tracks.flatMap((track) => {
    try {
      const parsed = PropertyBinding.parseTrackName(track.name)

      return mappedSourceNames.has(parsed.nodeName) && parsed.propertyName !== 'scale'
        ? []
        : [track.name]
    } catch {
      return [track.name]
    }
  })
}

function preserveQuaternionContinuity(
  quaternion: Quaternion,
  previous: Quaternion | undefined
): void {
  if (!previous || previous.dot(quaternion) >= 0) {
    return
  }

  quaternion.set(
    -quaternion.x,
    -quaternion.y,
    -quaternion.z,
    -quaternion.w
  )
}

function getObjectDepth(object: Object3D): number {
  let depth = 0
  let parent = object.parent

  while (parent) {
    depth += 1
    parent = parent.parent
  }

  return depth
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function isSupportedDirectBoneProperty(
  propertyName: string
): propertyName is 'position' | 'quaternion' | 'scale' {
  return (
    propertyName === 'position' ||
    propertyName === 'quaternion' ||
    propertyName === 'scale'
  )
}
