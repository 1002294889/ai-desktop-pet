export const CHARACTER_RENDERER_TYPES = ['static', 'sprite', 'animated-image', 'live2d'] as const

export type CharacterRendererType = (typeof CHARACTER_RENDERER_TYPES)[number]

export const CHARACTER_ACTION_TYPES = ['static', 'sprite', 'animated-image', 'live2d'] as const

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

export type CharacterAction =
  | StaticCharacterAction
  | SpriteCharacterAction
  | AnimatedImageCharacterAction
  | Live2DCharacterAction

export interface CharacterManifest {
  id: string
  name: string
  renderer: CharacterRendererType
  version: number
  defaultWidth: number
  defaultHeight: number
  scale: number
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

export type LoadedCharacterAction =
  | LoadedStaticCharacterAction
  | LoadedSpriteCharacterAction
  | LoadedAnimatedImageCharacterAction
  | LoadedLive2DCharacterAction

export interface LoadedCharacter {
  manifest: CharacterManifest
  actions: Record<string, LoadedCharacterAction>
}
