import type { LoadedCharacter } from './character'

export interface DesktopApi {
  getAppVersion: () => Promise<string>
  getActiveCharacter: () => Promise<LoadedCharacter>
}
