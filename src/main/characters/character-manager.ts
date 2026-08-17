import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  CharacterManifest,
  LoadedCharacter,
  LoadedCharacterAction
} from '../../shared/character'
import { CHARACTER_PROTOCOL_SCHEME } from './character-protocol'
import { validateCharacterManifest } from './character-manifest-validator'

const MANIFEST_FILE_NAME = 'character.json'

interface CharacterRecord {
  directory: string
  manifest: CharacterManifest
  allowedAssets: Set<string>
}

export interface CharacterManagerOptions {
  charactersDirectory: string
  preferredCharacterId?: string
}

export class CharacterManager {
  private readonly characters = new Map<string, CharacterRecord>()
  private activeCharacterId: string | undefined

  constructor(private readonly options: CharacterManagerOptions) {}

  async initialize(): Promise<void> {
    const entries = await readdir(this.options.charactersDirectory, { withFileTypes: true })
    const characterDirectories = entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of characterDirectories) {
      const record = await this.loadCharacter(join(this.options.charactersDirectory, entry.name))

      if (this.characters.has(record.manifest.id)) {
        throw new Error(`Duplicate character id "${record.manifest.id}"`)
      }

      this.characters.set(record.manifest.id, record)
    }

    if (this.characters.size === 0) {
      throw new Error(`No character packs found in ${this.options.charactersDirectory}`)
    }

    const availableCharacterIds = [...this.characters.keys()].sort()
    const requestedCharacterId = this.options.preferredCharacterId

    if (requestedCharacterId && !this.characters.has(requestedCharacterId)) {
      throw new Error(
        `Character "${requestedCharacterId}" was not found. Available characters: ${availableCharacterIds.join(', ')}`
      )
    }

    this.activeCharacterId = requestedCharacterId ?? availableCharacterIds[0]
  }

  getActiveCharacter(): LoadedCharacter {
    const record = this.getActiveRecord()

    return {
      manifest: record.manifest,
      actions: Object.fromEntries(
        Object.entries(record.manifest.actions).map(([actionName, definition]) => {
          const loadedAction: LoadedCharacterAction = {
            definition,
            assetUrl: this.createAssetUrl(record.manifest.id, definition.asset)
          }

          return [actionName, loadedAction]
        })
      )
    }
  }

  resolveAssetPath(characterId: string, assetPath: string): string | undefined {
    const record = this.characters.get(characterId)

    if (!record || !record.allowedAssets.has(assetPath)) {
      return undefined
    }

    return join(record.directory, ...assetPath.split('/'))
  }

  private getActiveRecord(): CharacterRecord {
    if (!this.activeCharacterId) {
      throw new Error('CharacterManager has not been initialized')
    }

    const record = this.characters.get(this.activeCharacterId)

    if (!record) {
      throw new Error(`Active character "${this.activeCharacterId}" is unavailable`)
    }

    return record
  }

  private async loadCharacter(directory: string): Promise<CharacterRecord> {
    const manifestPath = join(directory, MANIFEST_FILE_NAME)
    const manifestText = await readFile(manifestPath, 'utf8')
    let manifestValue: unknown

    try {
      manifestValue = JSON.parse(manifestText)
    } catch (error) {
      throw new Error(`${manifestPath}: invalid JSON`, { cause: error })
    }

    const manifest = validateCharacterManifest(manifestValue, manifestPath)
    const allowedAssets = new Set(Object.values(manifest.actions).map((action) => action.asset))

    await Promise.all(
      [...allowedAssets].map(async (assetPath) => {
        const assetStats = await stat(join(directory, ...assetPath.split('/')))

        if (!assetStats.isFile()) {
          throw new Error(`${manifestPath}: asset "${assetPath}" is not a file`)
        }
      })
    )

    return { directory, manifest, allowedAssets }
  }

  private createAssetUrl(characterId: string, assetPath: string): string {
    const encodedAssetPath = assetPath.split('/').map(encodeURIComponent).join('/')

    return `${CHARACTER_PROTOCOL_SCHEME}://${encodeURIComponent(characterId)}/${encodedAssetPath}`
  }
}
