export const CHARACTER_RENDERER_TYPES = [
  'static',
  'sprite',
  'animated-image',
  'live2d',
  '3d'
] as const

export const IMPLEMENTED_CHARACTER_RENDERER_TYPES = ['static', 'sprite', '3d'] as const

export type CharacterRendererType = (typeof CHARACTER_RENDERER_TYPES)[number]

export const CHARACTER_ACTION_TYPES = [
  'static',
  'sprite',
  'animated-image',
  'live2d',
  '3d'
] as const

export type CharacterActionType = (typeof CHARACTER_ACTION_TYPES)[number]

interface CharacterActionBase {
  type: CharacterActionType
  loop?: boolean
}

export interface StaticCharacterAction extends CharacterActionBase {
  type: 'static'
  asset: string
}

export interface SpriteCharacterAction extends CharacterActionBase {
  type: 'sprite'
  frames: string[]
  fps: number
  loop: boolean
}

export interface AnimatedImageCharacterAction extends CharacterActionBase {
  type: 'animated-image'
  asset: string
}

export interface Live2DCharacterAction extends CharacterActionBase {
  type: 'live2d'
  asset: string
}

export interface ThreeDCharacterAction extends CharacterActionBase {
  type: '3d'
  clip?: string
  durationMs?: number
  fadeDurationMs?: number
  clampWhenFinished?: boolean
}

export type CharacterAction =
  | StaticCharacterAction
  | SpriteCharacterAction
  | AnimatedImageCharacterAction
  | Live2DCharacterAction
  | ThreeDCharacterAction

export type ThreeDVector = [number, number, number]

export type ThreeDCharacterSource = 'model' | 'procedural'

export type ThreeDRootMotionMode = 'lock-horizontal' | 'lock-all'

export interface ThreeDCharacterConfiguration {
  source: ThreeDCharacterSource
  cameraPosition: ThreeDVector
  modelPosition: ThreeDVector
  modelRotation: ThreeDVector
  rootMotion: ThreeDRootMotionMode
}

export interface CharacterManifest {
  id: string
  name: string
  renderer: CharacterRendererType
  version: number
  defaultWidth: number
  defaultHeight: number
  scale: number
  preview?: string
  model?: string
  '3d'?: ThreeDCharacterConfiguration
  actions: Record<string, CharacterAction>
}

export interface LoadedStaticCharacterAction {
  definition: StaticCharacterAction
  assetUrl: string
}

export interface LoadedSpriteCharacterAction {
  definition: SpriteCharacterAction
  frameUrls: string[]
}

export interface LoadedAnimatedImageCharacterAction {
  definition: AnimatedImageCharacterAction
  assetUrl: string
}

export interface LoadedLive2DCharacterAction {
  definition: Live2DCharacterAction
  assetUrl: string
}

export interface LoadedThreeDCharacterAction {
  definition: ThreeDCharacterAction
}

export type LoadedCharacterAction =
  | LoadedStaticCharacterAction
  | LoadedSpriteCharacterAction
  | LoadedAnimatedImageCharacterAction
  | LoadedLive2DCharacterAction
  | LoadedThreeDCharacterAction

export interface LoadedCharacter {
  manifest: CharacterManifest
  actions: Record<string, LoadedCharacterAction>
  modelUrl?: string
}

export function isLoadedCharacter(value: unknown): value is LoadedCharacter {
  if (!isRecord(value)) {
    return false
  }

  const { manifest, actions, modelUrl } = value

  return (
    isCharacterManifest(manifest) &&
    isRecord(actions) &&
    Object.values(actions).every(isLoadedCharacterAction) &&
    (modelUrl === undefined || typeof modelUrl === 'string') &&
    (manifest.renderer !== '3d' ||
      manifest['3d']?.source !== 'model' ||
      typeof modelUrl === 'string')
  )
}

function isCharacterManifest(value: unknown): value is CharacterManifest {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    CHARACTER_RENDERER_TYPES.includes(value.renderer as CharacterRendererType) &&
    Number.isSafeInteger(value.version) &&
    typeof value.defaultWidth === 'number' &&
    Number.isFinite(value.defaultWidth) &&
    typeof value.defaultHeight === 'number' &&
    Number.isFinite(value.defaultHeight) &&
    typeof value.scale === 'number' &&
    Number.isFinite(value.scale) &&
    (value.preview === undefined || typeof value.preview === 'string') &&
    (value.model === undefined || typeof value.model === 'string') &&
    (value['3d'] === undefined || isThreeDCharacterConfiguration(value['3d'])) &&
    (value.renderer !== '3d' ||
      (isThreeDCharacterConfiguration(value['3d']) &&
        (value['3d'].source !== 'model' || typeof value.model === 'string'))) &&
    isRecord(value.actions) &&
    Object.values(value.actions).every(isCharacterAction)
  )
}

function isCharacterAction(value: unknown): value is CharacterAction {
  if (!isRecord(value) || !CHARACTER_ACTION_TYPES.includes(value.type as CharacterActionType)) {
    return false
  }

  if (value.type === 'sprite') {
    return (
      Array.isArray(value.frames) &&
      value.frames.length > 0 &&
      value.frames.every((frame) => typeof frame === 'string') &&
      typeof value.fps === 'number' &&
      Number.isFinite(value.fps) &&
      typeof value.loop === 'boolean'
    )
  }

  if (value.type === '3d') {
    return (
      (value.loop === undefined || typeof value.loop === 'boolean') &&
      (value.clip === undefined || typeof value.clip === 'string') &&
      (value.durationMs === undefined ||
        (typeof value.durationMs === 'number' && Number.isFinite(value.durationMs))) &&
      (value.fadeDurationMs === undefined ||
        (typeof value.fadeDurationMs === 'number' && Number.isFinite(value.fadeDurationMs))) &&
      (value.clampWhenFinished === undefined ||
        typeof value.clampWhenFinished === 'boolean')
    )
  }

  return typeof value.asset === 'string'
}

function isLoadedCharacterAction(value: unknown): value is LoadedCharacterAction {
  if (!isRecord(value) || !isCharacterAction(value.definition)) {
    return false
  }

  if (value.definition.type === 'sprite') {
    return (
      Array.isArray(value.frameUrls) &&
      value.frameUrls.length > 0 &&
      value.frameUrls.every((url) => typeof url === 'string')
    )
  }

  return value.definition.type === '3d' || typeof value.assetUrl === 'string'
}

function isThreeDCharacterConfiguration(
  value: unknown
): value is ThreeDCharacterConfiguration {
  if (!isRecord(value)) {
    return false
  }

  return (
    (value.source === 'model' || value.source === 'procedural') &&
    isThreeDVector(value.cameraPosition) &&
    isThreeDVector(value.modelPosition) &&
    isThreeDVector(value.modelRotation) &&
    (value.rootMotion === 'lock-horizontal' || value.rootMotion === 'lock-all')
  )
}

function isThreeDVector(value: unknown): value is ThreeDVector {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
