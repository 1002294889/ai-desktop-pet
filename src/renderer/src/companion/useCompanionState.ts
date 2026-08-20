import { useEffect, useState } from 'react'

import type { CompanionStateSnapshot } from '../../../shared/companion-state'

export interface CompanionStateHookResult {
  state: CompanionStateSnapshot | undefined
  error: string | undefined
  status: 'loading' | 'ready' | 'error'
}

export function useCompanionState(): CompanionStateHookResult {
  const [state, setState] = useState<CompanionStateSnapshot>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let isActive = true
    const applyState = (snapshot: CompanionStateSnapshot): void => {
      if (isActive) {
        setState(snapshot)
        setError(undefined)
        setStatus('ready')
      }
    }
    const stopListening = window.desktopApi.onCompanionStateChange(applyState)

    void window.desktopApi.getCompanionState().then(applyState).catch((error: unknown) => {
      if (isActive) {
        setError(error instanceof Error ? error.message : 'Unable to load companion state')
        setStatus('error')
      }

      if (import.meta.env.DEV) {
        console.warn('[CompanionState] Unable to load state.', {
          name: error instanceof Error ? error.name : typeof error
        })
      }
    })

    return () => {
      isActive = false
      stopListening()
    }
  }, [])

  return { state, error, status }
}
