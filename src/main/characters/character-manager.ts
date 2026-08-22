import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises'
import {
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve
} from 'node:path'

import {
  IMPLEMENTED_CHARACTER_RENDERER_TYPES,
  type CharacterAction,
  type CharacterManifest,
  type LoadedCharacter,
  type LoadedCharacterAction
} from '../../shared/character'
import type {
  CharacterManagerOverview,
  CharacterPackOrigin,
  InstalledCharacterSummary
} from '../../shared/character-management'
import { CharacterPackError } from './character-pack-error'
import { validateCharacterManifest } from './character-manifest-validator'
import { CHARACTER_PROTOCOL_SCHEME } from './character-protocol'

const MANIFEST_FILE_NAME = 'character.json'
const SETTINGS_VERSION = 1
const MAX_MANIFEST_BYTES = 1_000_000
const MAX_PACK_FILES = 5_000
const MAX_PACK_BYTES = 200 * 1024 * 1024
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set([
  '.apng',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp'
])
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf'])
const GLTF_DEPENDENCY_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.bin'])
const PROHIBITED_FILE_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cjs',
  '.cmd',
  '.command',
  '.dll',
  '.dylib',
  '.exe',
  '.js',
  '.jsx',
  '.mjs',
  '.node',
  '.ps1',
  '.sh',
  '.so',
  '.ts',
  '.tsx'
])
const DEFAULT_PREVIEW_URL =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="32" fill="#f0eafe"/><circle cx="120" cy="112" r="58" fill="#a78bfa"/><circle cx="98" cy="105" r="6" fill="#4c1d95"/><circle cx="142" cy="105" r="6" fill="#4c1d95"/><path d="M94 137q26 22 52 0" fill="none" stroke="#4c1d95" stroke-width="8" stroke-linecap="round"/><text x="120" y="207" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#5b21b6">Character</text></svg>'
  )

interface CharacterRecord {
  directory: string
  manifest: CharacterManifest
  allowedAssets: Set<string>
  previewAssetPath?: string
  origin: CharacterPackOrigin
}

interface CharacterSettings {
  version: number
  activeCharacterId: string
}

export interface CharacterManagerOptions {
  builtInCharactersDirectory: string
  userCharactersDirectory: string
  settingsFilePath: string
  defaultCharacterId: string
  preferredCharacterId?: string
}

type ActiveCharacterListener = (character: LoadedCharacter) => void

export class CharacterManager {
  private readonly characters = new Map<string, CharacterRecord>()
  private readonly listeners = new Set<ActiveCharacterListener>()
  private readonly warnings: string[] = []
  private activeCharacterId: string | undefined
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: CharacterManagerOptions) {}

  async initialize(): Promise<void> {
    this.characters.clear()
    this.warnings.length = 0
    await mkdir(this.options.userCharactersDirectory, { recursive: true })
    await this.discoverCharacters(
      this.options.builtInCharactersDirectory,
      'built-in',
      true
    )
    await this.discoverCharacters(
      this.options.userCharactersDirectory,
      'user',
      false
    )

    const defaultRecord = this.characters.get(this.options.defaultCharacterId)

    if (!defaultRecord || defaultRecord.origin !== 'built-in') {
      throw new Error(
        `Built-in default character "${this.options.defaultCharacterId}" is unavailable`
      )
    }

    if (!this.canActivateRecord(defaultRecord)) {
      throw new Error('The built-in default character must use an implemented renderer')
    }

    const persistedCharacterId = await this.readPersistedCharacterId()
    const requestedCharacterId =
      this.options.preferredCharacterId ??
      persistedCharacterId ??
      this.options.defaultCharacterId
    const requestedRecord = this.characters.get(requestedCharacterId)

    if (this.options.preferredCharacterId && !requestedRecord) {
      throw new Error(`Character "${requestedCharacterId}" was not found`)
    }

    if (requestedRecord && this.canActivateRecord(requestedRecord)) {
      this.activeCharacterId = requestedCharacterId
    } else {
      if (requestedCharacterId !== this.options.defaultCharacterId) {
        this.warnings.push(
          `Saved character "${requestedCharacterId}" is unavailable; using the default character.`
        )
      }

      this.activeCharacterId = this.options.defaultCharacterId
    }

    await this.persistActiveCharacter(this.activeCharacterId)
  }

  subscribe(listener: ActiveCharacterListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getWarnings(): readonly string[] {
    return [...this.warnings]
  }

  getActiveCharacter(): LoadedCharacter {
    return this.toLoadedCharacter(this.getActiveRecord())
  }

  getOverview(): CharacterManagerOverview {
    const activeCharacterId = this.requireActiveCharacterId()

    return {
      activeCharacterId,
      defaultCharacterId: this.options.defaultCharacterId,
      characters: [...this.characters.values()]
        .map((record) => this.toSummary(record, activeCharacterId))
        .sort((left, right) => {
          if (left.origin !== right.origin) {
            return left.origin === 'built-in' ? -1 : 1
          }

          return left.name.localeCompare(right.name)
        })
    }
  }

  async setActiveCharacter(characterId: string): Promise<LoadedCharacter> {
    return this.enqueueMutation(async () => {
      const record = this.characters.get(characterId)

      if (!record) {
        throw new CharacterPackError('not-found', 'Character is not installed')
      }

      if (!this.canActivateRecord(record)) {
        throw new CharacterPackError(
          'unsupported-renderer',
          `Renderer "${record.manifest.renderer}" is not implemented yet`
        )
      }

      if (this.activeCharacterId !== characterId) {
        await this.persistActiveCharacter(characterId)
        this.activeCharacterId = characterId
        this.emitActiveCharacter()
      }

      return this.toLoadedCharacter(record)
    })
  }

  async importCharacterPack(sourceDirectory: string): Promise<InstalledCharacterSummary> {
    return this.enqueueMutation(async () => {
      const sourceStats = await lstat(sourceDirectory).catch((error: unknown) => {
        throw new CharacterPackError('invalid-pack', 'The selected folder is unavailable.', {
          cause: error
        })
      })

      if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
        throw new CharacterPackError(
          'invalid-pack',
          'Select a normal folder containing character.json.'
        )
      }

      let sourceRecord: CharacterRecord

      try {
        sourceRecord = await this.loadCharacter(sourceDirectory, 'user')
      } catch (error: unknown) {
        throw toInvalidPackError(error)
      }

      const characterId = sourceRecord.manifest.id

      if (this.characters.has(characterId)) {
        throw new CharacterPackError(
          'duplicate-id',
          `Character ID "${characterId}" is already installed.`
        )
      }

      const destination = this.resolveManagedUserCharacterDirectory(characterId)

      if (await pathExists(destination)) {
        throw new CharacterPackError(
          'duplicate-id',
          `Character ID "${characterId}" is already installed.`
        )
      }

      const stagingDirectory = this.resolveManagedUserCharacterDirectory(
        `.importing-${characterId}-${randomUUID()}`
      )

      try {
        await cp(sourceDirectory, stagingDirectory, {
          recursive: true,
          errorOnExist: true,
          force: false,
          preserveTimestamps: false,
          verbatimSymlinks: true
        })

        const stagedRecord = await this.loadCharacter(stagingDirectory, 'user')

        if (stagedRecord.manifest.id !== characterId) {
          throw new CharacterPackError(
            'invalid-pack',
            'The character manifest changed during import.'
          )
        }

        await rename(stagingDirectory, destination)
        const installedRecord: CharacterRecord = {
          ...stagedRecord,
          directory: destination
        }

        this.characters.set(characterId, installedRecord)

        return this.toSummary(installedRecord, this.requireActiveCharacterId())
      } catch (error: unknown) {
        await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
        throw error instanceof CharacterPackError ? error : toInvalidPackError(error)
      }
    })
  }

  async removeCharacter(characterId: string): Promise<{ switchedToDefault: boolean }> {
    return this.enqueueMutation(async () => {
      const record = this.characters.get(characterId)

      if (!record) {
        throw new CharacterPackError('not-found', 'Character is not installed')
      }

      if (record.origin !== 'user') {
        throw new CharacterPackError(
          'built-in-character',
          'Built-in characters cannot be removed.'
        )
      }

      const expectedDirectory = this.resolveManagedUserCharacterDirectory(characterId)

      if (resolve(record.directory) !== expectedDirectory) {
        throw new CharacterPackError(
          'unexpected-error',
          'The user character directory is outside managed storage.'
        )
      }

      const switchedToDefault = this.activeCharacterId === characterId

      if (switchedToDefault) {
        await this.persistActiveCharacter(this.options.defaultCharacterId)
        this.activeCharacterId = this.options.defaultCharacterId
        this.emitActiveCharacter()
      }

      await rm(expectedDirectory, { recursive: true, force: false })
      this.characters.delete(characterId)

      return { switchedToDefault }
    })
  }

  resolveAssetPath(characterId: string, assetPath: string): string | undefined {
    const record = this.characters.get(characterId)

    if (!record || !record.allowedAssets.has(assetPath)) {
      return undefined
    }

    return resolveAssetInsideDirectory(record.directory, assetPath)
  }

  private async discoverCharacters(
    directory: string,
    origin: CharacterPackOrigin,
    strict: boolean
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    const characterDirectories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of characterDirectories) {
      const characterDirectory = join(directory, entry.name)

      try {
        const record = await this.loadCharacter(characterDirectory, origin)

        if (this.characters.has(record.manifest.id)) {
          throw new Error(`Duplicate character id "${record.manifest.id}"`)
        }

        this.characters.set(record.manifest.id, record)
      } catch (error: unknown) {
        if (strict) {
          throw error
        }

        this.warnings.push(
          `Skipped invalid user character folder "${entry.name}": ${getErrorMessage(error)}`
        )
      }
    }
  }

  private async loadCharacter(
    directory: string,
    origin: CharacterPackOrigin
  ): Promise<CharacterRecord> {
    await validatePackTree(directory)
    const manifestPath = join(directory, MANIFEST_FILE_NAME)
    const manifestStats = await lstat(manifestPath)

    if (
      manifestStats.isSymbolicLink() ||
      !manifestStats.isFile() ||
      manifestStats.size > MAX_MANIFEST_BYTES
    ) {
      throw new Error('character.json must be a normal JSON file under 1 MB')
    }

    const manifestText = await readFile(manifestPath, 'utf8')
    let manifestValue: unknown

    try {
      manifestValue = JSON.parse(manifestText)
    } catch (error: unknown) {
      throw new Error('character.json contains invalid JSON', { cause: error })
    }

    const manifest = validateCharacterManifest(manifestValue, MANIFEST_FILE_NAME)
    const actionAssets = Object.values(manifest.actions).flatMap(getActionAssetPaths)
    const modelAssets = await resolveThreeDModelAssets(directory, manifest)
    const previewAssetPath = await resolvePreviewAsset(directory, manifest)
    const allowedAssets = new Set([
      ...actionAssets,
      ...modelAssets,
      ...(previewAssetPath ? [previewAssetPath] : [])
    ])

    for (const assetPath of allowedAssets) {
      const resolvedAssetPath = resolveAssetInsideDirectory(directory, assetPath)

      if (!resolvedAssetPath) {
        throw new Error(`Asset "${assetPath}" escapes the character pack`)
      }

      const assetStats = await lstat(resolvedAssetPath)

      if (assetStats.isSymbolicLink() || !assetStats.isFile()) {
        throw new Error(`Asset "${assetPath}" is not a normal file`)
      }
    }

    validateRenderableAssetTypes(manifest)

    return { directory, manifest, allowedAssets, previewAssetPath, origin }
  }

  private toLoadedCharacter(record: CharacterRecord): LoadedCharacter {
    return {
      manifest: record.manifest,
      actions: Object.fromEntries(
        Object.entries(record.manifest.actions).map(([actionName, definition]) => [
          actionName,
          this.loadAction(record.manifest.id, definition)
        ])
      ),
      ...(record.manifest.model
        ? {
            modelUrl: this.createAssetUrl(
              record.manifest.id,
              record.manifest.model
            )
          }
        : {})
    }
  }

  private toSummary(
    record: CharacterRecord,
    activeCharacterId: string
  ): InstalledCharacterSummary {
    return {
      id: record.manifest.id,
      name: record.manifest.name,
      renderer: record.manifest.renderer,
      version: record.manifest.version,
      previewUrl: record.previewAssetPath
        ? this.createAssetUrl(record.manifest.id, record.previewAssetPath)
        : DEFAULT_PREVIEW_URL,
      origin: record.origin,
      isActive: record.manifest.id === activeCharacterId,
      canActivate: this.canActivateRecord(record),
      canRemove: record.origin === 'user'
    }
  }

  private canActivateRecord(record: CharacterRecord): boolean {
    if (
      !IMPLEMENTED_CHARACTER_RENDERER_TYPES.includes(
        record.manifest.renderer as (typeof IMPLEMENTED_CHARACTER_RENDERER_TYPES)[number]
      )
    ) {
      return false
    }

    if (record.manifest.renderer === '3d') {
      return (
        record.manifest['3d'] !== undefined &&
        Object.values(record.manifest.actions).every(
          (action) => action.type === '3d'
        )
      )
    }

    return Object.values(record.manifest.actions).every(
      (action) => action.type === 'static' || action.type === 'sprite'
    )
  }

  private createAssetUrl(characterId: string, assetPath: string): string {
    const encodedAssetPath = assetPath.split('/').map(encodeURIComponent).join('/')

    return `${CHARACTER_PROTOCOL_SCHEME}://${encodeURIComponent(characterId)}/${encodedAssetPath}`
  }

  private loadAction(
    characterId: string,
    definition: CharacterAction
  ): LoadedCharacterAction {
    switch (definition.type) {
      case 'sprite':
        return {
          definition,
          frameUrls: definition.frames.map((frame) =>
            this.createAssetUrl(characterId, frame)
          )
        }
      case 'static':
        return {
          definition,
          assetUrl: this.createAssetUrl(characterId, definition.asset)
        }
      case 'animated-image':
        return {
          definition,
          assetUrl: this.createAssetUrl(characterId, definition.asset)
        }
      case 'live2d':
        return {
          definition,
          assetUrl: this.createAssetUrl(characterId, definition.asset)
        }
      case '3d':
        return {
          definition,
          ...(definition.source
            ? { animationUrl: this.createAssetUrl(characterId, definition.source) }
            : {})
        }
    }
  }

  private getActiveRecord(): CharacterRecord {
    const activeCharacterId = this.requireActiveCharacterId()
    const record = this.characters.get(activeCharacterId)

    if (!record) {
      throw new Error(`Active character "${activeCharacterId}" is unavailable`)
    }

    return record
  }

  private requireActiveCharacterId(): string {
    if (!this.activeCharacterId) {
      throw new Error('CharacterManager has not been initialized')
    }

    return this.activeCharacterId
  }

  private resolveManagedUserCharacterDirectory(directoryName: string): string {
    const userRoot = resolve(this.options.userCharactersDirectory)
    const resolvedDirectory = resolve(userRoot, directoryName)
    const childPath = relative(userRoot, resolvedDirectory)

    if (!childPath || childPath.startsWith('..') || isAbsolute(childPath)) {
      throw new CharacterPackError(
        'unexpected-error',
        'Invalid managed character directory.'
      )
    }

    return resolvedDirectory
  }

  private async readPersistedCharacterId(): Promise<string | undefined> {
    try {
      const contents = await readFile(this.options.settingsFilePath, 'utf8')

      if (contents.length > 32_000) {
        throw new Error('character settings file is too large')
      }

      const value: unknown = JSON.parse(contents)

      if (
        !isRecord(value) ||
        value.version !== SETTINGS_VERSION ||
        typeof value.activeCharacterId !== 'string'
      ) {
        throw new Error('character settings file is invalid')
      }

      return value.activeCharacterId
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        return undefined
      }

      this.warnings.push('Character settings were invalid and have been reset.')
      return undefined
    }
  }

  private async persistActiveCharacter(characterId: string): Promise<void> {
    const settings: CharacterSettings = {
      version: SETTINGS_VERSION,
      activeCharacterId: characterId
    }
    const settingsDirectory = dirname(this.options.settingsFilePath)
    const temporaryPath = join(
      settingsDirectory,
      `.character-settings-${randomUUID()}.tmp`
    )

    await mkdir(settingsDirectory, { recursive: true })

    try {
      await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      })
      await rename(temporaryPath, this.options.settingsFilePath)
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private emitActiveCharacter(): void {
    const character = this.getActiveCharacter()

    for (const listener of this.listeners) {
      listener(character)
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation)

    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    )

    return result
  }
}

async function validatePackTree(rootDirectory: string): Promise<void> {
  const pendingDirectories = [rootDirectory]
  let fileCount = 0
  let totalBytes = 0

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()

    if (!directory) {
      continue
    }

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name)
      const entryStats = await lstat(entryPath)

      if (entryStats.isSymbolicLink()) {
        throw new Error('Character packs cannot contain symbolic links')
      }

      if (entryStats.isDirectory()) {
        pendingDirectories.push(entryPath)
        continue
      }

      if (!entryStats.isFile()) {
        throw new Error('Character packs may contain only folders and normal files')
      }

      fileCount += 1
      totalBytes += entryStats.size

      if (
        fileCount > MAX_PACK_FILES ||
        totalBytes > MAX_PACK_BYTES ||
        entryStats.size > MAX_SINGLE_FILE_BYTES
      ) {
        throw new Error('Character pack exceeds the allowed size limits')
      }

      if (PROHIBITED_FILE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        throw new Error('Character packs cannot contain executable or script files')
      }
    }
  }
}

async function resolvePreviewAsset(
  directory: string,
  manifest: CharacterManifest
): Promise<string | undefined> {
  if (manifest.preview) {
    if (!isImageAsset(manifest.preview)) {
      throw new Error('Character preview must be a supported image file')
    }

    return manifest.preview
  }

  const conventionalPreview = join(directory, 'preview.png')

  if (await pathExists(conventionalPreview)) {
    return 'preview.png'
  }

  const idleAction = manifest.actions.idle
  const idleAsset =
    idleAction?.type === 'sprite'
      ? idleAction.frames[0]
      : idleAction?.type === 'static' || idleAction?.type === 'animated-image'
        ? idleAction.asset
        : undefined

  return idleAsset && isImageAsset(idleAsset) ? idleAsset : undefined
}

function validateRenderableAssetTypes(manifest: CharacterManifest): void {
  if (manifest.model && !MODEL_EXTENSIONS.has(extname(manifest.model).toLowerCase())) {
    throw new Error('3D models must use .glb or .gltf')
  }

  for (const [actionName, action] of Object.entries(manifest.actions)) {
    if (action.type === 'live2d') {
      continue
    }

    if (action.type === '3d') {
      if (action.source && extname(action.source).toLowerCase() !== '.glb') {
        throw new Error(
          `Action "${actionName}" external animations must use a self-contained .glb file`
        )
      }
      continue
    }

    for (const assetPath of getActionAssetPaths(action)) {
      if (!isImageAsset(assetPath)) {
        throw new Error(
          `Action "${actionName}" must reference a supported image asset`
        )
      }
    }
  }
}

function getActionAssetPaths(action: CharacterAction): string[] {
  switch (action.type) {
    case 'sprite':
      return action.frames
    case '3d':
      return action.source ? [action.source] : []
    default:
      return [action.asset]
  }
}

async function resolveThreeDModelAssets(
  directory: string,
  manifest: CharacterManifest
): Promise<string[]> {
  if (!manifest.model) {
    return []
  }

  const extension = extname(manifest.model).toLowerCase()

  if (!MODEL_EXTENSIONS.has(extension)) {
    throw new Error('3D models must use .glb or .gltf')
  }

  if (extension === '.glb') {
    return [manifest.model]
  }

  const modelPath = resolveAssetInsideDirectory(directory, manifest.model)

  if (!modelPath) {
    throw new Error('3D model escapes the character pack')
  }

  let document: unknown

  try {
    document = JSON.parse(await readFile(modelPath, 'utf8'))
  } catch (error: unknown) {
    throw new Error('GLTF model must contain valid JSON', { cause: error })
  }

  if (!isRecord(document)) {
    throw new Error('GLTF model must contain a JSON object')
  }

  const dependencyUris = [
    ...readGltfResourceUris(document.buffers, 'buffers'),
    ...readGltfResourceUris(document.images, 'images')
  ]
  const modelDirectory = posix.dirname(manifest.model)
  const dependencies = dependencyUris.flatMap((uri) => {
    if (uri.startsWith('data:')) {
      return []
    }

    if (uri.includes('?') || uri.includes('#')) {
      throw new Error('GLTF resource paths cannot contain query strings or fragments')
    }

    let decodedUri: string

    try {
      decodedUri = decodeURIComponent(uri)
    } catch (error: unknown) {
      throw new Error('GLTF resource path contains invalid encoding', { cause: error })
    }

    const segments = decodedUri.split('/')

    if (
      !decodedUri ||
      decodedUri.includes(':') ||
      decodedUri.includes('\\') ||
      decodedUri.startsWith('/') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new Error('GLTF resource paths must stay inside the character pack')
    }

    const dependencyPath =
      modelDirectory === '.'
        ? decodedUri
        : posix.join(modelDirectory, decodedUri)

    if (!GLTF_DEPENDENCY_EXTENSIONS.has(extname(dependencyPath).toLowerCase())) {
      throw new Error('GLTF dependencies must be images or binary buffers')
    }

    return [dependencyPath]
  })

  return [manifest.model, ...dependencies]
}

function readGltfResourceUris(value: unknown, field: string): string[] {
  if (value === undefined) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new Error(`GLTF "${field}" must be an array`)
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry) || entry.uri === undefined) {
      return []
    }

    if (typeof entry.uri !== 'string' || !entry.uri) {
      throw new Error(`GLTF "${field}[${index}].uri" must be a string`)
    }

    return [entry.uri]
  })
}

function isImageAsset(assetPath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(assetPath).toLowerCase())
}

function resolveAssetInsideDirectory(
  directory: string,
  assetPath: string
): string | undefined {
  const root = resolve(directory)
  const resolvedAsset = resolve(root, ...assetPath.split('/'))
  const childPath = relative(root, resolvedAsset)

  return childPath && !childPath.startsWith('..') && !isAbsolute(childPath)
    ? resolvedAsset
    : undefined
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      return false
    }

    throw error
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

function toInvalidPackError(error: unknown): CharacterPackError {
  if (error instanceof CharacterPackError) {
    return error
  }

  return new CharacterPackError(
    'invalid-pack',
    `Character pack was rejected: ${getErrorMessage(error)}`,
    { cause: error }
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown validation error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
