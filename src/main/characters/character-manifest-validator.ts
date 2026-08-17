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

const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

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

  if (
    asset.includes('\\') ||
    asset.startsWith('/') ||
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

    return spriteAction
  }

  const asset = validateAssetPath(
    readNonEmptyString(value, 'asset', actionSource),
    'asset',
    actionSource
  )

  return {
    type: type as 'static' | 'animated-image' | 'live2d',
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

  return {
    id,
    name: readNonEmptyString(value, 'name', source),
    renderer: renderer as CharacterRendererType,
    version,
    defaultWidth: readPositiveNumber(value, 'defaultWidth', source),
    defaultHeight: readPositiveNumber(value, 'defaultHeight', source),
    scale: readPositiveNumber(value, 'scale', source),
    actions
  }
}
