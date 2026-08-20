import { posix } from 'node:path'

import {
  CHARACTER_ACTION_TYPES,
  CHARACTER_RENDERER_TYPES,
  type CharacterAction,
  type CharacterActionType,
  type CharacterManifest,
  type CharacterRendererType,
  type SpriteCharacterAction
} from '../../shared/character'

const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const ACTION_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_DISPLAY_NAME_LENGTH = 100
const MAX_ASSET_PATH_LENGTH = 240
const MAX_CHARACTER_DIMENSION = 4_096
const MAX_CHARACTER_SCALE = 10
const MAX_SPRITE_FPS = 120

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNonEmptyString(
  record: Record<string, unknown>,
  field: string,
  source: string
): string {
  const value = record[field]

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${source}: "${field}" must be a non-empty string`)
  }

  return value
}

function readPositiveNumber(
  record: Record<string, unknown>,
  field: string,
  source: string
): number {
  const value = record[field]

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${source}: "${field}" must be a positive number`)
  }

  return value
}

function readOptionalLoop(record: Record<string, unknown>, source: string): boolean | undefined {
  const loop = record.loop

  if (loop !== undefined && typeof loop !== 'boolean') {
    throw new Error(`${source}: "loop" must be a boolean when provided`)
  }

  return loop
}

function validateAssetPath(asset: string, field: string, source: string): string {
  const normalizedPath = posix.normalize(asset)
  const segments = asset.split('/')

  if (
    asset.length > MAX_ASSET_PATH_LENGTH ||
    asset.includes('\0') ||
    asset.includes(':') ||
    asset.includes('\\') ||
    asset.startsWith('/') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath !== asset
  ) {
    throw new Error(`${source}: "${field}" must be a normalized relative path inside the pack`)
  }

  return asset
}

function readFrames(record: Record<string, unknown>, source: string): string[] {
  if (!Array.isArray(record.frames) || record.frames.length === 0) {
    throw new Error(`${source}: "frames" must contain at least one asset path`)
  }

  return record.frames.map((frame, index) => {
    if (typeof frame !== 'string' || frame.trim().length === 0) {
      throw new Error(`${source}: "frames[${index}]" must be a non-empty string`)
    }

    return validateAssetPath(frame, `frames[${index}]`, source)
  })
}

function validateAction(actionName: string, value: unknown, source: string): CharacterAction {
  const actionSource = `${source}: action "${actionName}"`

  if (!ACTION_NAME_PATTERN.test(actionName)) {
    throw new Error(`${source}: action names must be normalized semantic identifiers`)
  }

  if (!isRecord(value)) {
    throw new Error(`${actionSource} must be an object`)
  }

  const type = readNonEmptyString(value, 'type', actionSource)

  if (!CHARACTER_ACTION_TYPES.includes(type as CharacterActionType)) {
    throw new Error(`${actionSource}: unsupported action type "${type}"`)
  }

  const loop = readOptionalLoop(value, actionSource)

  if (type === 'sprite') {
    const spriteAction: SpriteCharacterAction = {
      type,
      frames: readFrames(value, actionSource),
      fps: readPositiveNumber(value, 'fps', actionSource),
      loop: loop ?? false
    }

    if (spriteAction.fps > MAX_SPRITE_FPS) {
      throw new Error(`${actionSource}: "fps" must not exceed ${MAX_SPRITE_FPS}`)
    }

    return spriteAction
  }

  const asset = validateAssetPath(
    readNonEmptyString(value, 'asset', actionSource),
    'asset',
    actionSource
  )

  return {
    type: type as 'static' | 'animated-image' | 'live2d' | '3d',
    asset,
    ...(loop === undefined ? {} : { loop })
  }
}

export function validateCharacterManifest(value: unknown, source: string): CharacterManifest {
  if (!isRecord(value)) {
    throw new Error(`${source}: manifest must be a JSON object`)
  }

  const id = readNonEmptyString(value, 'id', source)

  if (!CHARACTER_ID_PATTERN.test(id)) {
    throw new Error(
      `${source}: "id" must use lowercase letters, numbers, hyphens, or underscores`
    )
  }

  const renderer = readNonEmptyString(value, 'renderer', source)

  if (!CHARACTER_RENDERER_TYPES.includes(renderer as CharacterRendererType)) {
    throw new Error(`${source}: unsupported renderer "${renderer}"`)
  }

  const version = readPositiveNumber(value, 'version', source)

  if (!Number.isInteger(version)) {
    throw new Error(`${source}: "version" must be an integer`)
  }

  const name = readNonEmptyString(value, 'name', source).trim()

  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`${source}: "name" must not exceed ${MAX_DISPLAY_NAME_LENGTH} characters`)
  }

  const defaultWidth = readPositiveNumber(value, 'defaultWidth', source)
  const defaultHeight = readPositiveNumber(value, 'defaultHeight', source)
  const scale = readPositiveNumber(value, 'scale', source)

  if (defaultWidth > MAX_CHARACTER_DIMENSION || defaultHeight > MAX_CHARACTER_DIMENSION) {
    throw new Error(
      `${source}: character dimensions must not exceed ${MAX_CHARACTER_DIMENSION}`
    )
  }

  if (scale > MAX_CHARACTER_SCALE) {
    throw new Error(`${source}: "scale" must not exceed ${MAX_CHARACTER_SCALE}`)
  }

  if (!isRecord(value.actions) || Object.keys(value.actions).length === 0) {
    throw new Error(`${source}: "actions" must contain at least an idle action`)
  }

  const actions = Object.fromEntries(
    Object.entries(value.actions).map(([actionName, action]) => [
      actionName,
      validateAction(actionName, action, source)
    ])
  )

  if (!actions.idle) {
    throw new Error(`${source}: "actions.idle" is required`)
  }

  const preview = value.preview

  if (preview !== undefined && (typeof preview !== 'string' || !preview.trim())) {
    throw new Error(`${source}: "preview" must be a non-empty string when provided`)
  }

  return {
    id,
    name,
    renderer: renderer as CharacterRendererType,
    version,
    defaultWidth,
    defaultHeight,
    scale,
    ...(typeof preview === 'string'
      ? { preview: validateAssetPath(preview, 'preview', source) }
      : {}),
    actions
  }
}
