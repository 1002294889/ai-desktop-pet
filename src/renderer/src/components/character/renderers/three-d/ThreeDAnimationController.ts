import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  LoopOnce,
  LoopRepeat,
  Object3D,
  PropertyBinding,
  SkinnedMesh,
  type AnimationMixerEventMap
} from 'three'

import type {
  CharacterAction,
  ThreeDCharacterAction,
  ThreeDRootMotionMode
} from '../../../../../../shared/character'
import type {
  LoadedThreeDAnimationLibrary,
  ThreeDAnimationLibraryDiagnostics
} from './ThreeDAnimationLibrary'

const DEFAULT_FADE_DURATION_MS = 140

export interface ThreeDAnimationDiagnostics extends ThreeDAnimationLibraryDiagnostics {
  clipNames: readonly string[]
  rootMotionTracks: readonly string[]
  missingMappings: readonly string[]
  skinnedMeshCount: number
  boneCount: number
}

export interface ThreeDAnimationPlayback {
  mode: 'clip' | 'procedural'
  semanticAction: string
  clipName?: string
  clipSource?: 'embedded' | 'external'
  fallbackReason?:
    | 'clip-not-configured'
    | 'clip-not-found'
    | 'external-clip-not-loaded'
}

interface ActiveCompletion {
  action: AnimationAction
  callback: () => void
  clipName: string
  semanticAction: string
}

interface RetiringAction {
  action: AnimationAction
  stopAtMixerTime: number
}

/**
 * Owns the single AnimationMixer for one loaded GLB instance. Manifest clip names
 * are authoritative; this controller deliberately does not guess aliases.
 */
export class ThreeDAnimationController {
  private readonly mixer: AnimationMixer
  private readonly clips: readonly AnimationClip[]
  private readonly clipsByName: ReadonlyMap<string, AnimationClip>
  private readonly externalClipsByAction: ReadonlyMap<string, AnimationClip>
  private readonly missingClipWarnings = new Set<string>()
  private readonly diagnostics: ThreeDAnimationDiagnostics
  private activeAction: AnimationAction | undefined
  private activeCompletion: ActiveCompletion | undefined
  private retiringAction: RetiringAction | undefined
  private disposed = false

  constructor(
    private readonly root: Object3D,
    sourceClips: readonly AnimationClip[],
    rootMotion: ThreeDRootMotionMode,
    configuredActions: Readonly<Record<string, CharacterAction>>,
    externalLibrary: LoadedThreeDAnimationLibrary = EMPTY_EXTERNAL_LIBRARY
  ) {
    const prepared = prepareAnimationClips(root, sourceClips, rootMotion)
    const preparedExternal = new Map<string, AnimationClip>()
    const externalRootMotionTracks: string[] = []

    for (const [semanticAction, sourceClip] of externalLibrary.clipsBySemanticAction) {
      const external = prepareAnimationClips(root, [sourceClip], rootMotion)
      const clip = external.clips[0]

      if (clip) {
        preparedExternal.set(semanticAction, clip)
      }
      externalRootMotionTracks.push(...external.rootMotionTracks)
    }

    const rig = inspectRig(root)

    this.clips = [...prepared.clips, ...preparedExternal.values()]
    this.clipsByName = new Map(prepared.clips.map((clip) => [clip.name, clip]))
    this.externalClipsByAction = preparedExternal
    const missingMappings = Object.entries(configuredActions).flatMap(
      ([semanticAction, definition]) =>
        definition.type === '3d' &&
        definition.clip &&
        (definition.source
          ? !this.externalClipsByAction.has(semanticAction)
          : !this.clipsByName.has(definition.clip))
          ? [`${semanticAction}:${definition.clip}`]
          : []
    )
    this.diagnostics = {
      clipNames: prepared.clips.map((clip) => clip.name),
      rootMotionTracks: [
        ...prepared.rootMotionTracks,
        ...externalRootMotionTracks
      ],
      missingMappings,
      skinnedMeshCount: rig.skinnedMeshCount,
      boneCount: rig.boneCount,
      ...externalLibrary.diagnostics
    }
    this.mixer = new AnimationMixer(root)
    this.mixer.addEventListener('finished', this.handleMixerFinished)

    if (import.meta.env.DEV && missingMappings.length > 0) {
      console.info('[ThreeDAnimation] Missing configured animation clips:', [
        ...missingMappings
      ])
    }
  }

  getDiagnostics(): ThreeDAnimationDiagnostics {
    return this.diagnostics
  }

  play(
    semanticAction: string,
    definition: ThreeDCharacterAction,
    onFinished: () => void
  ): ThreeDAnimationPlayback {
    const clipName = definition.clip
    const fadeDurationSeconds = getFadeDurationSeconds(definition)

    if (!clipName) {
      this.beginProceduralFallback(fadeDurationSeconds)
      return {
        mode: 'procedural',
        semanticAction,
        fallbackReason: 'clip-not-configured'
      }
    }

    const clipSource = definition.source ? 'external' : 'embedded'
    const clip = definition.source
      ? this.externalClipsByAction.get(semanticAction)
      : this.clipsByName.get(clipName)

    if (!clip) {
      this.beginProceduralFallback(fadeDurationSeconds)
      this.warnAboutMissingClip(semanticAction, clipName)
      return {
        mode: 'procedural',
        semanticAction,
        clipName,
        fallbackReason: definition.source
          ? 'external-clip-not-loaded'
          : 'clip-not-found'
      }
    }

    const loop = definition.loop ?? false
    const nextAction = this.mixer.clipAction(clip)
    const previousAction = this.activeAction

    this.activeCompletion = undefined

    if (previousAction === nextAction && loop && nextAction.isRunning()) {
      nextAction.clampWhenFinished = false
      nextAction.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
      nextAction.setEffectiveTimeScale(1)

      if (import.meta.env.DEV) {
        console.info(
          `[ThreeDAnimation] Continuing clip "${clipName}" for semantic action "${semanticAction}" without restarting its loop.`
        )
      }

      return { mode: 'clip', semanticAction, clipName, clipSource }
    }

    this.stopRetiringAction()
    nextAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .setLoop(loop ? LoopRepeat : LoopOnce, loop ? Number.POSITIVE_INFINITY : 1)
    nextAction.clampWhenFinished = definition.clampWhenFinished ?? !loop
    nextAction.play()

    if (previousAction && previousAction !== nextAction) {
      if (fadeDurationSeconds > 0) {
        previousAction.crossFadeTo(nextAction, fadeDurationSeconds, false)
        this.retiringAction = {
          action: previousAction,
          stopAtMixerTime: this.mixer.time + fadeDurationSeconds
        }
      } else {
        previousAction.stop()
      }
    } else if (!previousAction && fadeDurationSeconds > 0) {
      nextAction.fadeIn(fadeDurationSeconds)
    }

    this.activeAction = nextAction
    this.activeCompletion = loop
      ? undefined
      : {
          action: nextAction,
          callback: onFinished,
          clipName,
          semanticAction
        }

    if (import.meta.env.DEV) {
      console.info(
        `[ThreeDAnimation] Playing clip "${clipName}" for semantic action "${semanticAction}".`,
        { loop, clipSource, fadeDurationMs: fadeDurationSeconds * 1_000 }
      )
    }

    return { mode: 'clip', semanticAction, clipName, clipSource }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return
    }

    this.mixer.update(deltaSeconds)

    if (
      this.retiringAction &&
      this.mixer.time >= this.retiringAction.stopAtMixerTime
    ) {
      this.stopRetiringAction()
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.mixer.removeEventListener('finished', this.handleMixerFinished)
    this.activeCompletion = undefined
    this.retiringAction = undefined
    this.mixer.stopAllAction()

    for (const clip of this.clips) {
      this.mixer.uncacheClip(clip)
    }

    this.mixer.uncacheRoot(this.root)
    this.activeAction = undefined
  }

  private readonly handleMixerFinished = (
    event: AnimationMixerEventMap['finished']
  ): void => {
    const completion = this.activeCompletion

    if (!completion || event.action !== completion.action) {
      return
    }

    this.activeCompletion = undefined

    if (import.meta.env.DEV) {
      console.info(
        `[ThreeDAnimation] Finished clip "${completion.clipName}" for semantic action "${completion.semanticAction}".`
      )
    }

    completion.callback()
  }

  private beginProceduralFallback(fadeDurationSeconds: number): void {
    this.activeCompletion = undefined
    this.stopRetiringAction()

    if (this.activeAction) {
      const previousAction = this.activeAction
      this.activeAction = undefined

      if (fadeDurationSeconds > 0 && previousAction.isRunning()) {
        previousAction.fadeOut(fadeDurationSeconds)
        this.retiringAction = {
          action: previousAction,
          stopAtMixerTime: this.mixer.time + fadeDurationSeconds
        }
      } else {
        previousAction.stop()
      }
    }
  }

  private stopRetiringAction(): void {
    if (!this.retiringAction) {
      return
    }

    this.retiringAction.action.stop()
    this.retiringAction = undefined
  }

  private warnAboutMissingClip(semanticAction: string, clipName: string): void {
    const warningKey = `${semanticAction}:${clipName}`

    if (!import.meta.env.DEV || this.missingClipWarnings.has(warningKey)) {
      return
    }

    this.missingClipWarnings.add(warningKey)
    console.info(
      `[ThreeDAnimation] Missing clip "${clipName}" for semantic action "${semanticAction}"; using procedural fallback.`
    )
  }
}

const EMPTY_EXTERNAL_LIBRARY: LoadedThreeDAnimationLibrary = {
  clipsBySemanticAction: new Map(),
  diagnostics: {
    externalClipNames: [],
    externalSources: [],
    retargetedTracks: [],
    droppedRetargetTracks: [],
    missingRetargetBones: [],
    externalErrors: []
  }
}

function getFadeDurationSeconds(definition: ThreeDCharacterAction): number {
  return Math.max(
    0,
    definition.fadeDurationMs ?? DEFAULT_FADE_DURATION_MS
  ) / 1_000
}

function inspectRig(root: Object3D): {
  skinnedMeshCount: number
  boneCount: number
} {
  const bones = new Set<Bone>()
  let skinnedMeshCount = 0

  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) {
      return
    }

    skinnedMeshCount += 1
    object.skeleton.bones.forEach((bone) => bones.add(bone))
  })

  return { skinnedMeshCount, boneCount: bones.size }
}

interface PreparedAnimationClips {
  clips: AnimationClip[]
  rootMotionTracks: string[]
}

function prepareAnimationClips(
  root: Object3D,
  sourceClips: readonly AnimationClip[],
  rootMotion: ThreeDRootMotionMode
): PreparedAnimationClips {
  const candidates = collectRootMotionCandidates(root)
  const rootMotionTracks: string[] = []
  const clips = sourceClips.map((sourceClip) => {
    const clip = sourceClip.clone()

    for (const track of clip.tracks) {
      if (!isRootPositionTrack(root, track.name, candidates, track.getValueSize())) {
        continue
      }

      lockRootTranslation(track.values, rootMotion)
      rootMotionTracks.push(`${clip.name}:${track.name}`)
    }

    return clip
  })

  return { clips, rootMotionTracks }
}

function collectRootMotionCandidates(root: Object3D): ReadonlySet<Object3D> {
  const candidates = new Set<Object3D>([root, ...root.children])

  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) {
      return
    }

    for (const bone of object.skeleton.bones) {
      if (!(bone.parent instanceof Bone)) {
        candidates.add(bone)
      }
    }
  })

  return candidates
}

function isRootPositionTrack(
  root: Object3D,
  trackName: string,
  candidates: ReadonlySet<Object3D>,
  valueSize: number
): boolean {
  if (valueSize !== 3) {
    return false
  }

  let parsed: ReturnType<typeof PropertyBinding.parseTrackName>

  try {
    parsed = PropertyBinding.parseTrackName(trackName)
  } catch {
    return false
  }

  if (parsed.propertyName !== 'position') {
    return false
  }

  const target = PropertyBinding.findNode(root, parsed.nodeName)

  return target instanceof Object3D && candidates.has(target)
}

function lockRootTranslation(
  values: Float32Array,
  mode: ThreeDRootMotionMode
): void {
  if (values.length < 3) {
    return
  }

  const originX = values[0]
  const originY = values[1]
  const originZ = values[2]

  for (let index = 0; index + 2 < values.length; index += 3) {
    values[index] = originX
    values[index + 2] = originZ

    if (mode === 'lock-all') {
      values[index + 1] = originY
    }
  }
}
