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

const DEFAULT_FADE_DURATION_MS = 140

export interface ThreeDAnimationDiagnostics {
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
  fallbackReason?: 'clip-not-configured' | 'clip-not-found'
}

interface ActiveCompletion {
  action: AnimationAction
  callback: () => void
  clipName: string
  semanticAction: string
}

/**
 * Owns the single AnimationMixer for one loaded GLB instance. Manifest clip names
 * are authoritative; this controller deliberately does not guess aliases.
 */
export class ThreeDAnimationController {
  private readonly mixer: AnimationMixer
  private readonly clips: readonly AnimationClip[]
  private readonly clipsByName: ReadonlyMap<string, AnimationClip>
  private readonly retiringActions = new Map<AnimationAction, number>()
  private readonly missingClipWarnings = new Set<string>()
  private readonly diagnostics: ThreeDAnimationDiagnostics
  private activeAction: AnimationAction | undefined
  private activeCompletion: ActiveCompletion | undefined
  private disposed = false

  constructor(
    private readonly root: Object3D,
    sourceClips: readonly AnimationClip[],
    rootMotion: ThreeDRootMotionMode,
    configuredActions: Readonly<Record<string, CharacterAction>>
  ) {
    const prepared = prepareAnimationClips(root, sourceClips, rootMotion)
    const rig = inspectRig(root)

    this.clips = prepared.clips
    this.clipsByName = new Map(this.clips.map((clip) => [clip.name, clip]))
    const missingMappings = Object.entries(configuredActions).flatMap(
      ([semanticAction, definition]) =>
        definition.type === '3d' &&
        definition.clip &&
        !this.clipsByName.has(definition.clip)
          ? [`${semanticAction}:${definition.clip}`]
          : []
    )
    this.diagnostics = {
      clipNames: this.clips.map((clip) => clip.name),
      rootMotionTracks: prepared.rootMotionTracks,
      missingMappings,
      skinnedMeshCount: rig.skinnedMeshCount,
      boneCount: rig.boneCount
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

    if (!clipName) {
      this.beginProceduralFallback()
      return {
        mode: 'procedural',
        semanticAction,
        fallbackReason: 'clip-not-configured'
      }
    }

    const clip = this.clipsByName.get(clipName)

    if (!clip) {
      this.beginProceduralFallback()
      this.warnAboutMissingClip(semanticAction, clipName)
      return {
        mode: 'procedural',
        semanticAction,
        clipName,
        fallbackReason: 'clip-not-found'
      }
    }

    const loop = definition.loop ?? false
    const fadeDurationSeconds =
      (definition.fadeDurationMs ?? DEFAULT_FADE_DURATION_MS) / 1_000
    const nextAction = this.mixer.clipAction(clip)
    const previousAction = this.activeAction

    this.activeCompletion = undefined
    this.retiringActions.delete(nextAction)
    nextAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .setLoop(loop ? LoopRepeat : LoopOnce, loop ? Number.POSITIVE_INFINITY : 1)
    nextAction.clampWhenFinished = definition.clampWhenFinished ?? !loop
    nextAction.play()

    if (previousAction && previousAction !== nextAction) {
      if (fadeDurationSeconds > 0) {
        previousAction.crossFadeTo(nextAction, fadeDurationSeconds, true)
        this.retiringActions.set(
          previousAction,
          this.mixer.time + fadeDurationSeconds
        )
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
        { loop, fadeDurationMs: fadeDurationSeconds * 1_000 }
      )
    }

    return { mode: 'clip', semanticAction, clipName }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return
    }

    this.mixer.update(deltaSeconds)

    for (const [action, stopAt] of this.retiringActions) {
      if (this.mixer.time >= stopAt) {
        action.stop()
        this.retiringActions.delete(action)
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.mixer.removeEventListener('finished', this.handleMixerFinished)
    this.activeCompletion = undefined
    this.retiringActions.clear()
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

  private beginProceduralFallback(): void {
    this.activeCompletion = undefined

    if (this.activeAction) {
      this.activeAction.stop()
      this.activeAction = undefined
    }

    for (const action of this.retiringActions.keys()) {
      action.stop()
    }

    this.retiringActions.clear()
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
