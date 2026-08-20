import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ClearMemoryResult,
  MemoryCategoryFilter,
  MemoryOverview,
  MemoryOverviewQuery
} from '../../../shared/memory-management'

const DEFAULT_QUERY: MemoryOverviewQuery = { category: 'all', search: '' }

export interface MemoryManagementState {
  overview: MemoryOverview | undefined
  query: MemoryOverviewQuery
  isLoading: boolean
  isMutating: boolean
  error: string | undefined
  notice: string | undefined
  setCategory: (category: MemoryCategoryFilter) => void
  setSearch: (search: string) => void
  updateProfile: (key: string, value: string) => Promise<boolean>
  deleteProfile: (key: string) => Promise<boolean>
  updateMemory: (id: number, content: string) => Promise<boolean>
  deleteMemory: (id: number) => Promise<boolean>
  setEnabled: (enabled: boolean) => Promise<boolean>
  clearConversation: () => Promise<boolean>
  clearLongTermMemory: () => Promise<boolean>
  clearAllMemory: () => Promise<boolean>
  refresh: () => Promise<void>
}

export function useMemoryManagement(): MemoryManagementState {
  const [overview, setOverview] = useState<MemoryOverview>()
  const [query, setQuery] = useState<MemoryOverviewQuery>(DEFAULT_QUERY)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const requestGeneration = useRef(0)

  const loadOverview = useCallback(async (nextQuery: MemoryOverviewQuery): Promise<void> => {
    const generation = ++requestGeneration.current

    try {
      const result = await window.desktopApi.getMemoryOverview(nextQuery)

      if (generation === requestGeneration.current) {
        setOverview(result)
        setError(undefined)
      }
    } catch (loadError: unknown) {
      if (generation === requestGeneration.current) {
        setError(getErrorMessage(loadError))
      }
    } finally {
      if (generation === requestGeneration.current) {
        setIsLoading(false)
      }
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    await loadOverview(query)
  }, [loadOverview, query])

  useEffect(() => {
    setIsLoading(true)
    const timer = window.setTimeout(() => {
      void loadOverview(query)
    }, query.search ? 180 : 0)

    return () => window.clearTimeout(timer)
  }, [loadOverview, query])

  const runMutation = useCallback(
    async (operation: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
      setIsMutating(true)
      setError(undefined)
      setNotice(undefined)

      try {
        await operation()
        await loadOverview(query)
        setNotice(successMessage)
        return true
      } catch (mutationError: unknown) {
        setError(getErrorMessage(mutationError))
        return false
      } finally {
        setIsMutating(false)
      }
    },
    [loadOverview, query]
  )

  const runClearMutation = useCallback(
    async (
      operation: () => Promise<ClearMemoryResult>,
      createMessage: (result: ClearMemoryResult) => string
    ): Promise<boolean> => {
      setIsMutating(true)
      setError(undefined)
      setNotice(undefined)

      try {
        const result = await operation()
        await loadOverview(query)
        setNotice(createMessage(result))
        return true
      } catch (mutationError: unknown) {
        setError(getErrorMessage(mutationError))
        return false
      } finally {
        setIsMutating(false)
      }
    },
    [loadOverview, query]
  )

  return {
    overview,
    query,
    isLoading,
    isMutating,
    error,
    notice,
    setCategory: (category) => setQuery((current) => ({ ...current, category })),
    setSearch: (search) => setQuery((current) => ({ ...current, search })),
    updateProfile: (key, value) =>
      runMutation(
        () => window.desktopApi.updateMemoryProfile({ key, value }),
        'Profile information updated.'
      ),
    deleteProfile: (key) =>
      runMutation(() => window.desktopApi.deleteMemoryProfile(key), 'Profile field deleted.'),
    updateMemory: (id, content) =>
      runMutation(
        () => window.desktopApi.updateManagedMemory({ id, content }),
        'Memory updated.'
      ),
    deleteMemory: (id) =>
      runMutation(() => window.desktopApi.deleteManagedMemory(id), 'Memory deleted.'),
    setEnabled: (enabled) =>
      runMutation(
        () => window.desktopApi.setLongTermMemoryEnabled(enabled),
        enabled
          ? 'Long-term memory is enabled.'
          : 'Long-term memory is disabled. Existing memories were kept.'
      ),
    clearConversation: () =>
      runClearMutation(
        () => window.desktopApi.clearConversationHistory(),
        ({ conversationMessagesDeleted }) =>
          `Cleared ${conversationMessagesDeleted} conversation message${conversationMessagesDeleted === 1 ? '' : 's'}. Long-term memories were kept.`
      ),
    clearLongTermMemory: () =>
      runClearMutation(
        () => window.desktopApi.clearLongTermMemory(),
        ({ profileEntriesDeleted, memoriesDeleted }) =>
          `Cleared ${profileEntriesDeleted} profile field${profileEntriesDeleted === 1 ? '' : 's'} and ${memoriesDeleted} saved memor${memoriesDeleted === 1 ? 'y' : 'ies'}. Conversation history was kept.`
      ),
    clearAllMemory: () =>
      runClearMutation(
        () => window.desktopApi.clearAllMemory(),
        () => 'All profile information, saved memories, conversation history, and relationship progress were cleared.'
      ),
    refresh
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The memory request could not be completed.'
}
