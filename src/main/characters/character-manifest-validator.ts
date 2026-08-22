import { posix } from 'node:path'

import {
  CHARACTER_ACTION_TYPES,
  CHARACTER_RENDERER_TYPES,
  type CharacterAction,
  type CharacterActionType,
  type CharacterManifest,
  type CharacterRendererType,
  type SpriteCharacterAction,
  type ThreeDAnimationRetargetConfiguration,
  type ThreeDCharacterAction,
  type ThreeDCharacterConfiguration,
  type ThreeDLookAtConfiguration,
  type ThreeDRootMotionMode,
  type ThreeDVector
} from '../../shared/character'

const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const ACTION_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MAX_DISPLAY_NAME_LENGTH = 100
const MAX_ASSET_PATH_LENGTH = 240
const MAX_CHARACTER_DIMENSION = 4_096
const MAX_CHARACTER_SCALE = 10
const MAX_SPRITE_FPS = 120
const MAX_3D_COORDINATE = 1_000
const MAX_3D_ACTION_DURATION_MS = 30_000
const MAX_3D_FADE_DURATION_MS = 2_000
const MAX_ANIMATION_CLIP_NAME_LENGTH = 120
const MAX_BONE_NAME_LENGTH = 120
const MAX_RETARGET_BONES = 128
const DEFAULT_3D_CAMERA_POSITION: ThreeDVector = [0, 0.6, 4.5]
const DEFAULT_3D_MODEL_POSITION: ThreeDVector = [0, -0.9, 0]
const DEFAULT_3D_MODEL_ROTATION: ThreeDVector = [0, 0, 0]
const DEFAULT_3D_ROOT_MOTION: ThreeDRootMotionMode = 'lock-horizontal'
const MODEL_EXTENSIONS = ['.glb', '.gltf'] as const

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

function readOptionalString(
  record: Record<string, unknown>,
  field: string,
  source: string,
  maximumLength: number
): string | undefined {
  const value = record[field]

  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    throw new Error(
      `${source}: "${field}" must be a non-empty string up to ${maximumLength} characters`
    )
  }

  return value.trim()
}

function readOptionalThreeDVector(
  record: Record<string, unknown>,
  field: string,
  source: string,
  fallback: ThreeDVector
): ThreeDVector {
  const value = record[field]

  if (value === undefined) {
    return [...fallback]
  }

  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some(
      (entry) =>
        typeof entry !== 'number' ||
        !Number.isFinite(entry) ||
        Math.abs(entry) > MAX_3D_COORDINATE
    )
  ) {
    throw new Error(
      `${source}: "${field}" must contain three finite numbers between -${MAX_3D_COORDINATE} and ${MAX_3D_COORDINATE}`
    )
  }

  return [value[0] as number, value[1] as number, value[2] as number]
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

  if (type === '3d') {
    const durationMs = value.durationMs
    const fadeDurationMs = value.fadeDurationMs
    const clampWhenFinished = value.clampWhenFinished
    const clip = readOptionalString(
      value,
      'clip',
      actionSource,
      MAX_ANIMATION_CLIP_NAME_LENGTH
    )
    const externalSourceValue = readOptionalString(
      value,
      'source',
      actionSource,
      MAX_ASSET_PATH_LENGTH
    )
    const externalSource = externalSourceValue
      ? validateAssetPath(externalSourceValue, 'source', actionSource)
      : undefined
    const retarget = readOptionalThreeDRetargetConfiguration(
      value.retarget,
      `${actionSource}: "retarget"`
    )
    const lookAtWeight = value.lookAtWeight

    if (externalSource && !externalSource.toLowerCase().endsWith('.glb')) {
      throw new Error(`${actionSource}: external animation "source" must reference a .glb file`)
    }

    if (externalSource && !clip) {
      throw new Error(`${actionSource}: external animation "source" requires "clip"`)
    }

    if (retarget && !externalSource) {
      throw new Error(`${actionSource}: "retarget" requires an external animation "source"`)
    }

    if (
      durationMs !== undefined &&
      (typeof durationMs !== 'number' ||
        !Number.isInteger(durationMs) ||
        durationMs <= 0 ||
        durationMs > MAX_3D_ACTION_DURATION_MS)
    ) {
      throw new Error(
        `${actionSource}: "durationMs" must be an integer from 1 to ${MAX_3D_ACTION_DURATION_MS}`
      )
    }

    if (
      fadeDurationMs !== undefined &&
      (typeof fadeDurationMs !== 'number' ||
        !Number.isInteger(fadeDurationMs) ||
        fadeDurationMs < 0 ||
        fadeDurationMs > MAX_3D_FADE_DURATION_MS)
    ) {
      throw new Error(
        `${actionSource}: "fadeDurationMs" must be an integer from 0 to ${MAX_3D_FADE_DURATION_MS}`
      )
    }

    if (
      clampWhenFinished !== undefined &&
      typeof clampWhenFinished !== 'boolean'
    ) {
      throw new Error(
        `${actionSource}: "clampWhenFinished" must be a boolean when provided`
      )
    }

    if (
      lookAtWeight !== undefined &&
      (typeof lookAtWeight !== 'number' ||
        !Number.isFinite(lookAtWeight) ||
        lookAtWeight < 0 ||
        lookAtWeight > 1)
    ) {
      throw new Error(`${actionSource}: "lookAtWeight" must be a number from 0 to 1`)
    }

    const action: ThreeDCharacterAction = {
      type,
      ...(loop === undefined ? {} : { loop }),
      ...(clip ? { clip } : {}),
      ...(externalSource ? { source: externalSource } : {}),
      ...(retarget ? { retarget } : {}),
      ...(typeof durationMs === 'number' ? { durationMs } : {}),
      ...(typeof fadeDurationMs === 'number' ? { fadeDurationMs } : {}),
      ...(typeof clampWhenFinished === 'boolean'
        ? { clampWhenFinished }
        : {}),
      ...(typeof lookAtWeight === 'number' ? { lookAtWeight } : {})
    }

    return action
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

function readOptionalThreeDRetargetConfiguration(
  value: unknown,
  source: string
): ThreeDAnimationRetargetConfiguration | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value) || !isRecord(value.boneMap)) {
    throw new Error(`${source} must contain a "boneMap" object`)
  }

  const entries = Object.entries(value.boneMap)

  if (entries.length === 0 || entries.length > MAX_RETARGET_BONES) {
    throw new Error(`${source}: "boneMap" must contain 1 to ${MAX_RETARGET_BONES} entries`)
  }

  const boneMap = Object.fromEntries(
    entries.map(([sourceBone, targetBone]) => {
      if (
        !sourceBone.trim() ||
        sourceBone.length > MAX_BONE_NAME_LENGTH ||
        typeof targetBone !== 'string' ||
        !targetBone.trim() ||
        targetBone.length > MAX_BONE_NAME_LENGTH
      ) {
        throw new Error(
          `${source}: bone names must be non-empty strings up to ${MAX_BONE_NAME_LENGTH} characters`
        )
      }

      return [sourceBone.trim(), targetBone.trim()]
    })
  )

  return { boneMap }
}

function readThreeDConfiguration(
  value: Record<string, unknown>,
  model: string | undefined,
  source: string
): ThreeDCharacterConfiguration {
  const rawConfiguration = value['3d']

  if (rawConfiguration !== undefined && !isRecord(rawConfiguration)) {
    throw new Error(`${source}: "3d" must be an object when provided`)
  }

  const configuration = rawConfiguration ?? {}
  const configuredSource = configuration.source

  if (
    configuredSource !== undefined &&
    configuredSource !== 'model' &&
    configuredSource !== 'procedural'
  ) {
    throw new Error(`${source}: "3d.source" must be "model" or "procedural"`)
  }

  const rendererSource = configuredSource ?? (model ? 'model' : 'procedural')
  const configuredRootMotion = configuration.rootMotion
  const lookAt = readOptionalThreeDLookAtConfiguration(
    configuration.lookAt,
    `${source}: "3d.lookAt"`
  )

  if (
    configuredRootMotion !== undefined &&
    configuredRootMotion !== 'lock-horizontal' &&
    configuredRootMotion !== 'lock-all'
  ) {
    throw new Error(
      `${source}: "3d.rootMotion" must be "lock-horizontal" or "lock-all"`
    )
  }

  if (rendererSource === 'model' && !model) {
    throw new Error(`${source}: renderer "3d" with source "model" requires "model"`)
  }

  if (rendererSource === 'procedural' && model) {
    throw new Error(`${source}: procedural 3D characters must not declare "model"`)
  }

  return {
    source: rendererSource,
    cameraPosition: readOptionalThreeDVector(
      configuration,
      'cameraPosition',
      `${source}: "3d"`,
      DEFAULT_3D_CAMERA_POSITION
    ),
    modelPosition: readOptionalThreeDVector(
      configuration,
      'modelPosition',
      `${source}: "3d"`,
      DEFAULT_3D_MODEL_POSITION
    ),
    modelRotation: readOptionalThreeDVector(
      configuration,
      'modelRotation',
      `${source}: "3d"`,
      DEFAULT_3D_MODEL_ROTATION
    ),
    rootMotion: configuredRootMotion ?? DEFAULT_3D_ROOT_MOTION,
    ...(lookAt ? { lookAt } : {})
  }
}

function readOptionalThreeDLookAtConfiguration(
  value: unknown,
  source: string
): ThreeDLookAtConfiguration | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${source} must be an object when provided`)
  }

  const headBone = readOptionalString(
    value,
    'headBone',
    source,
    MAX_BONE_NAME_LENGTH
  )
  const leftEyeBone = readOptionalString(
    value,
    'leftEyeBone',
    source,
    MAX_BONE_NAME_LENGTH
  )
  const rightEyeBone = readOptionalString(
    value,
    'rightEyeBone',
    source,
    MAX_BONE_NAME_LENGTH
  )

  if (!headBone && !leftEyeBone && !rightEyeBone) {
    throw new Error(
      `${source} must configure at least one head or eye bone`
    )
  }

  return {
    ...(headBone ? { headBone } : {}),
    ...(leftEyeBone ? { leftEyeBone } : {}),
    ...(rightEyeBone ? { rightEyeBone } : {})
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

  const rawModel = value.model

  if (rawModel !== undefined && (typeof rawModel !== 'string' || !rawModel.trim())) {
    throw new Error(`${source}: "model" must be a non-empty string when provided`)
  }

  const model =
    typeof rawModel === 'string'
      ? validateAssetPath(rawModel, 'model', source)
      : undefined

  if (
    model &&
    !MODEL_EXTENSIONS.some((extension) => model.toLowerCase().endsWith(extension))
  ) {
    throw new Error(`${source}: "model" must reference a .glb or .gltf file`)
  }

  if (renderer !== '3d' && (model || value['3d'] !== undefined)) {
    throw new Error(`${source}: "model" and "3d" are only valid for renderer "3d"`)
  }

  if (
    renderer === '3d' &&
    Object.values(actions).some((action) => action.type !== '3d')
  ) {
    throw new Error(`${source}: renderer "3d" requires 3D action definitions`)
  }

  const threeDConfiguration =
    renderer === '3d' ? readThreeDConfiguration(value, model, source) : undefined

  if (
    threeDConfiguration?.source === 'procedural' &&
    Object.values(actions).some(
      (action) =>
        action.type === '3d' &&
        (action.clip !== undefined || action.source !== undefined)
    )
  ) {
    throw new Error(
      `${source}: procedural 3D characters must not declare skeletal animation clips`
    )
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
    ...(model ? { model } : {}),
    ...(threeDConfiguration ? { '3d': threeDConfiguration } : {}),
    actions
  }
}
