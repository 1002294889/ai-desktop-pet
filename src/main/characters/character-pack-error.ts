import type { CharacterOperationErrorCode } from '../../shared/character-management'

export class CharacterPackError extends Error {
  constructor(
    readonly code: CharacterOperationErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'CharacterPackError'
  }
}

export function getCharacterPackErrorMessage(error: unknown): string {
  if (!(error instanceof CharacterPackError)) {
    return 'The character operation could not be completed.'
  }

  switch (error.code) {
    case 'built-in-character':
      return 'Built-in characters cannot be removed.'
    case 'duplicate-id':
      return 'A character with this ID is already installed.'
    case 'invalid-pack':
      return error.message
    case 'not-found':
      return 'The requested character is not installed.'
    case 'unsupported-renderer':
      return 'This character uses a renderer that is not available yet.'
    case 'unexpected-error':
      return 'The character operation could not be completed.'
  }
}
