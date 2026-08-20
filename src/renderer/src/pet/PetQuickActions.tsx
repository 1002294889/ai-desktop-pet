import { useCallback, useEffect, useRef, useState } from 'react'

import type { IconName } from '../ui/Icon'
import { IconButton } from '../ui/Button'

interface PetQuickActionsProps {
  active: boolean
  characterName: string
}

const SHOW_DELAY_MS = 460
const HIDE_DELAY_MS = 190

const ACTIONS: readonly { icon: IconName; label: string; open: () => void }[] = [
  { icon: 'chat', label: 'Chat', open: () => window.desktopApi.openChat() },
  { icon: 'character', label: 'Characters', open: () => window.desktopApi.openCharacterManager() },
  { icon: 'memory', label: 'Memory', open: () => window.desktopApi.openMemorySettings() },
  { icon: 'settings', label: 'Settings', open: () => window.desktopApi.openAppSettings() }
]

export function PetQuickActions({ active, characterName }: PetQuickActionsProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  const clearTimers = useCallback((): void => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current)
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    showTimer.current = undefined
    hideTimer.current = undefined
  }, [])

  const hideSoon = useCallback((): void => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current)
    showTimer.current = undefined
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined
      setVisible(false)
    }, HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    if (active) {
      if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
      if (!visible && showTimer.current === undefined) {
        showTimer.current = window.setTimeout(() => {
          showTimer.current = undefined
          setVisible(true)
        }, SHOW_DELAY_MS)
      }
    } else {
      hideSoon()
    }

    return clearTimers
  }, [active, clearTimers, hideSoon, visible])

  const keepOpen = (): void => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
  }

  const open = (action: () => void): void => {
    clearTimers()
    setVisible(false)
    action()
  }

  return (
    <nav
      className="pet-quick-actions"
      data-visible={visible}
      aria-label={`Quick actions for ${characterName}`}
      aria-hidden={!visible}
      inert={!visible}
      onPointerEnter={keepOpen}
      onPointerLeave={hideSoon}
    >
      {ACTIONS.map((action) => (
        <IconButton
          key={action.label}
          className="pet-quick-action"
          icon={action.icon}
          label={action.label}
          size="small"
          tabIndex={visible ? 0 : -1}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => open(action.open)}
        />
      ))}
    </nav>
  )
}
