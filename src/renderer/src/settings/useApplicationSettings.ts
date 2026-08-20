import { useCallback, useEffect, useState } from 'react'

import type {
  AppSettingKey,
  AppSettingsOverview
} from '../../../shared/app-settings'

export interface ApplicationSettingsState {
  overview: AppSettingsOverview | undefined
  isLoading: boolean
  isMutating: boolean
  error: string | undefined
  notice: string | undefined
  setSetting: (key: AppSettingKey, value: boolean) => Promise<void>
  refresh: () => Promise<void>
}

export function useApplicationSettings(): ApplicationSettingsState {
  const [overview, setOverview] = useState<AppSettingsOverview>()
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true)

    try {
      setOverview(await window.desktopApi.getAppSettings())
      setError(undefined)
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const stopListening = window.desktopApi.onAppSettingsChange(setOverview)

    void refresh()
    return stopListening
  }, [refresh])

  const setSetting = useCallback(
    async (key: AppSettingKey, value: boolean): Promise<void> => {
      setIsMutating(true)
      setError(undefined)
      setNotice(undefined)

      try {
        setOverview(await window.desktopApi.updateAppSetting({ key, value }))
        setNotice('Setting updated.')
      } catch (updateError: unknown) {
        setError(getErrorMessage(updateError))
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
    setSetting,
    refresh
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The application setting could not be updated.'
}
