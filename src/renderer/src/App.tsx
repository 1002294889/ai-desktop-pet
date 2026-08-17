import { useEffect, useState } from 'react'

import type { LoadedCharacter } from '../../shared/character'
import { CharacterRenderer } from './components/character/CharacterRenderer'
import { petActionController } from './pet/pet-action-controller-instance'
import { useDeveloperActionShortcuts } from './pet/useDeveloperActionShortcuts'
import { usePetActionState } from './pet/usePetActionState'

export function App(): React.JSX.Element {
  const [character, setCharacter] = useState<LoadedCharacter>()
  const [loadError, setLoadError] = useState<string>()
  const actionState = usePetActionState(petActionController)

  useDeveloperActionShortcuts(petActionController)

  useEffect(() => {
    return window.desktopApi.onPetDragStateChange((isDragging) => {
      if (isDragging) {
        petActionController.playAction('dragged', { force: true })
      } else {
        petActionController.completeCurrentAction('dragged', 'idle')
      }
    })
  }, [])

  useEffect(() => {
    let isActive = true

    void window.desktopApi
      .getActiveCharacter()
      .then((loadedCharacter) => {
        if (isActive) {
          setCharacter(loadedCharacter)
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load character')
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  return (
    <main className="desktop-pet-shell">
      <section className="pet-drag-region" aria-label="Desktop pet. Drag to move the window.">
        {character ? (
          <CharacterRenderer character={character} currentAction={actionState.currentAction} />
        ) : null}
        {!character && !loadError ? <p className="character-status">Loading character…</p> : null}
        {loadError ? <p className="character-status">{loadError}</p> : null}
        {import.meta.env.DEV && character ? (
          <output className="pet-action-debug" aria-live="polite">
            {character.manifest.name} ({character.manifest.id}) · Action:{' '}
            {actionState.currentAction} · Previous: {actionState.previousAction ?? 'none'} · Priority:{' '}
            {actionState.currentActionPriority} · {actionState.lifecycle}
          </output>
        ) : null}
      </section>
    </main>
  )
}
