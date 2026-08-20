export type SettingsManagerErrorCode =
  | 'invalid-input'
  | 'login-item-unavailable'
  | 'persistence-failed'
  | 'not-initialized'

export class SettingsManagerError extends Error {
  constructor(
    readonly code: SettingsManagerErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'SettingsManagerError'
  }
}
