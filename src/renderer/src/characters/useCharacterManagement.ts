import { useCallback, useEffect, useState } from 'react'

import type {
  CharacterManagerOverview,
  CharacterOperationResult
} from '../../../shared/character-management'

export interface CharacterManagementState {
  overview?: CharacterManagerOverview
  isLoading: boolean
  isMutating: boolean
  error?: string
  notice?: string
  refresh: () => Promise<void>
  importPack: () => Promise<void>
  activate: (characterId: string) => Promise<void>
  remove: (characterId: string) => Promise<void>
}

export function useCharacterManagement(): CharacterManagementState {
  const [overview, setOverview] = useState<CharacterManagerOverview>()
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(undefined)

    try {
      setOverview(await window.desktopApi.getCharacterOverview())
    } catch (refreshError: unknown) {
      setError(getErrorMessage(refreshError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runOperation = useCallback(
    async (operation: () => Promise<CharacterOperationResult>): Promise<void> => {
      setIsMutating(true)
      setError(undefined)
      setNotice(undefined)

      try {
        const result = await operation()

        setOverview(result.overview)

        if (result.status === 'error') {
          setError(result.message)
        } else if (result.status === 'success') {
          setNotice(result.message)
        }
      } catch (operationError: unknown) {
        setError(getErrorMessage(operationError))
      } finally {
        setIsMutating(false)
      }
    },
    []
  )

  return {
    overview,
    isLoading,
    isMutating,
    error,
    notice,
    refresh,
    importPack: () => runOperation(() => window.desktopApi.importCharacterPack()),
    activate: (characterId) =>
      runOperation(() => window.desktopApi.setActiveCharacter(characterId)),
    remove: (characterId) =>
      runOperation(() => window.desktopApi.removeCharacterPack(characterId))
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The character operation could not be completed.'
}
