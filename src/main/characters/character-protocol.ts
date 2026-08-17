import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { protocol } from 'electron'

import type { CharacterManager } from './character-manager'

export const CHARACTER_PROTOCOL_SCHEME = 'character-pack'

const CONTENT_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

export function registerCharacterProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: CHARACTER_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function registerCharacterAssetProtocol(characterManager: CharacterManager): void {
  protocol.handle(CHARACTER_PROTOCOL_SCHEME, async (request) => {
    try {
      const requestUrl = new URL(request.url)
      const characterId = decodeURIComponent(requestUrl.hostname)
      const assetPath = requestUrl.pathname
        .slice(1)
        .split('/')
        .map(decodeURIComponent)
        .join('/')
      const resolvedAssetPath = characterManager.resolveAssetPath(characterId, assetPath)

      if (!resolvedAssetPath) {
        return new Response('Character asset not found', { status: 404 })
      }

      const contentType = CONTENT_TYPES[extname(resolvedAssetPath).toLowerCase()]

      if (!contentType) {
        return new Response('Unsupported character asset type', { status: 415 })
      }

      const content = await readFile(resolvedAssetPath)

      return new Response(new Uint8Array(content), {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff'
        }
      })
    } catch {
      return new Response('Invalid character asset request', { status: 400 })
    }
  })
}
