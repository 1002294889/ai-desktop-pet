import { AnimationClip, Object3D } from 'three'
import {
  GLTFLoader,
  type GLTF
} from 'three/examples/jsm/loaders/GLTFLoader.js'

import type {
  LoadedCharacterAction,
  LoadedThreeDCharacterAction,
  ThreeDCharacterAction
} from '../../../../../../shared/character'
import {
  retargetThreeDAnimationClip,
  type ThreeDAnimationRetargetDiagnostics
} from './ThreeDAnimationRetargeter'
import { disposeThreeDObject } from './three-d-resource-disposal'

export interface ThreeDAnimationLibraryDiagnostics {
  externalClipNames: readonly string[]
  externalSources: readonly string[]
  retargetedTracks: readonly string[]
  droppedRetargetTracks: readonly string[]
  missingRetargetBones: readonly string[]
  externalErrors: readonly string[]
  retargetModes: readonly string[]
  mappedHumanoidBones: readonly string[]
  retargetSampleCounts: readonly string[]
  retargetTranslationScales: readonly string[]
}

export interface LoadedThreeDAnimationLibrary {
  clipsBySemanticAction: ReadonlyMap<string, AnimationClip>
  diagnostics: ThreeDAnimationLibraryDiagnostics
}

/**
 * Loads self-contained external animation GLBs for one mounted character. Each
 * resource URL is fetched once, its clips are cloned/retargeted, and its scene is
 * disposed immediately. The resulting clips are owned by the model controller.
 */
export class ThreeDAnimationLibrary {
  private readonly abortController = new AbortController()
  private disposed = false

  constructor(
    private readonly targetRoot: Object3D,
    private readonly configuredActions: Readonly<Record<string, LoadedCharacterAction>>
  ) {}

  async load(): Promise<LoadedThreeDAnimationLibrary> {
    const clipsBySemanticAction = new Map<string, AnimationClip>()
    const externalClipNames: string[] = []
    const externalSources = new Set<string>()
    const retargetedTracks: string[] = []
    const droppedRetargetTracks: string[] = []
    const missingRetargetBones = new Set<string>()
    const externalErrors: string[] = []
    const retargetModes: string[] = []
    const mappedHumanoidBones: string[] = []
    const retargetSampleCounts: string[] = []
    const retargetTranslationScales: string[] = []
    const externalActions = Object.entries(this.configuredActions).flatMap(
      ([semanticAction, action]) =>
        isLoadedExternalAnimationAction(action)
          ? [[semanticAction, action] as const]
          : []
    )
    const resources = new Map<string, Promise<ExternalResourceResult>>()

    for (const [, action] of externalActions) {
      if (!resources.has(action.animationUrl)) {
        resources.set(
          action.animationUrl,
          this.loadGlb(action.animationUrl).then(
            (loaded) => ({ loaded }),
            (error: unknown) => ({ error })
          )
        )
      }
    }

    for (const [animationUrl, resourcePromise] of resources) {
      const resource = await resourcePromise

      if (!resource.loaded) {
        if (!this.disposed) {
          externalErrors.push(
            `${animationUrl}:${getErrorMessage(resource.error)}`
          )
        }
        continue
      }
      const loaded = resource.loaded

      try {
        if (this.disposed) {
          continue
        }

        externalSources.add(animationUrl)

        for (const [semanticAction, action] of externalActions) {
          if (action.animationUrl !== animationUrl) {
            continue
          }

          const sourceClip = loaded.animations.find(
            (clip) => clip.name === action.definition.clip
          )

          if (!sourceClip) {
            externalErrors.push(
              `${semanticAction}:clip-not-found:${action.definition.clip}`
            )
            continue
          }

          const result = action.definition.retarget
            ? retargetThreeDAnimationClip(
                sourceClip,
                loaded.scene,
                this.targetRoot,
                action.definition.retarget
              )
            : {
                clip: sourceClip.clone(),
                diagnostics: EMPTY_RETARGET_DIAGNOSTICS
              }

          if (result.clip.tracks.length === 0) {
            externalErrors.push(`${semanticAction}:no-compatible-tracks`)
            continue
          }

          const runtimeClip = result.clip

          runtimeClip.name = `external:${semanticAction}:${sourceClip.name}`
          clipsBySemanticAction.set(semanticAction, runtimeClip)
          externalClipNames.push(`${semanticAction}:${sourceClip.name}`)
          retargetedTracks.push(
            ...result.diagnostics.retargetedTracks.map(
              (track) => `${semanticAction}:${track}`
            )
          )
          droppedRetargetTracks.push(
            ...result.diagnostics.droppedTracks.map(
              (track) => `${semanticAction}:${track}`
            )
          )
          retargetModes.push(`${semanticAction}:${result.diagnostics.mode}`)
          mappedHumanoidBones.push(
            ...result.diagnostics.mappedHumanoidBones.map(
              (bone) => `${semanticAction}:${bone}`
            )
          )
          if (result.diagnostics.sampleCount > 0) {
            retargetSampleCounts.push(
              `${semanticAction}:${result.diagnostics.sampleCount}`
            )
          }
          if (result.diagnostics.translationScale !== undefined) {
            retargetTranslationScales.push(
              `${semanticAction}:${result.diagnostics.translationScale.toFixed(3)}`
            )
          }
          result.diagnostics.missingSourceBones.forEach((bone) =>
            missingRetargetBones.add(`source:${bone}`)
          )
          result.diagnostics.missingTargetBones.forEach((bone) =>
            missingRetargetBones.add(`target:${bone}`)
          )
        }
      } finally {
        disposeThreeDObject(loaded.scene)
      }
    }

    return {
      clipsBySemanticAction,
      diagnostics: {
        externalClipNames,
        externalSources: [...externalSources],
        retargetedTracks,
        droppedRetargetTracks,
        missingRetargetBones: [...missingRetargetBones],
        externalErrors,
        retargetModes,
        mappedHumanoidBones,
        retargetSampleCounts,
        retargetTranslationScales
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.abortController.abort()
  }

  private async loadGlb(url: string): Promise<GLTF> {
    const response = await fetch(url, { signal: this.abortController.signal })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.arrayBuffer()

    if (this.disposed) {
      throw new DOMException('Animation library was disposed', 'AbortError')
    }

    return new GLTFLoader().parseAsync(data, '')
  }
}

interface ExternalResourceResult {
  loaded?: GLTF
  error?: unknown
}

const EMPTY_RETARGET_DIAGNOSTICS: ThreeDAnimationRetargetDiagnostics = {
  mode: 'direct',
  retargetedTracks: [],
  droppedTracks: [],
  missingSourceBones: [],
  missingTargetBones: [],
  mappedHumanoidBones: [],
  sampleCount: 0
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown-error'
}

type LoadedExternalAnimationAction = LoadedThreeDCharacterAction & {
  definition: ThreeDCharacterAction & {
    source: string
    clip: string
  }
  animationUrl: string
}

function isLoadedExternalAnimationAction(
  action: LoadedCharacterAction
): action is LoadedExternalAnimationAction {
  if (action.definition.type !== '3d') {
    return false
  }

  const loadedThreeDAction = action as LoadedThreeDCharacterAction

  return (
    typeof loadedThreeDAction.definition.source === 'string' &&
    typeof loadedThreeDAction.definition.clip === 'string' &&
    typeof loadedThreeDAction.animationUrl === 'string'
  )
}
