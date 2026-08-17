export const CHARACTER_RENDERER_TYPES = [
  'static-image',
  'sprite',
  'animated-image',
  'live2d'
] as const

export type CharacterRendererType = (typeof CHARACTER_RENDERER_TYPES)[number]

export const CHARACTER_ACTION_TYPES = ['static', 'sprite', 'animated-image', 'live2d'] as const

export type CharacterActionType = (typeof CHARACTER_ACTION_TYPES)[number]

export interface CharacterAction {
  type: CharacterActionType
  asset: string
  loop?: boolean
  frameWidth?: number
  frameHeight?: number
  frameCount?: number
  framesPerSecond?: number
}

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

export interface LoadedCharacterAction {
  definition: CharacterAction
  assetUrl: string
}

export interface LoadedCharacter {
  manifest: CharacterManifest
  actions: Record<string, LoadedCharacterAction>
}
