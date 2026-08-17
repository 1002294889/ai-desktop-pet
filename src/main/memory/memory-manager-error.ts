export type MemoryManagerErrorCode =
  | 'not-initialized'
  | 'initialization-failed'
  | 'unsupported-schema'
  | 'invalid-input'
  | 'read-failed'
  | 'write-failed'
  | 'close-failed'

interface MemoryManagerErrorOptions {
  cause?: unknown
}

const SAFE_MESSAGES: Record<MemoryManagerErrorCode, string> = {
  'not-initialized': 'Local memory storage is not initialized.',
  'initialization-failed': 'Unable to initialize local memory storage.',
  'unsupported-schema': 'The local memory database uses an unsupported schema version.',
  'invalid-input': 'The local memory request contains invalid data.',
  'read-failed': 'Unable to read from local memory storage.',
  'write-failed': 'Unable to write to local memory storage.',
  'close-failed': 'Unable to close local memory storage cleanly.'
}

export class MemoryManagerError extends Error {
  readonly code: MemoryManagerErrorCode

  constructor(code: MemoryManagerErrorCode, options: MemoryManagerErrorOptions = {}) {
    super(SAFE_MESSAGES[code], { cause: options.cause })
    this.name = 'MemoryManagerError'
    this.code = code
  }
}
