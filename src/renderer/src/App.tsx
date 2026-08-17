import { useEffect, useState } from 'react'

import type { LoadedCharacter } from '../../shared/character'
import { CharacterRenderer } from './components/character/CharacterRenderer'

export function App(): React.JSX.Element {
  const [character, setCharacter] = useState<LoadedCharacter>()
  const [loadError, setLoadError] = useState<string>()

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
        {character ? <CharacterRenderer character={character} /> : null}
        {!character && !loadError ? <p className="character-status">Loading character…</p> : null}
        {loadError ? <p className="character-status">{loadError}</p> : null}
      </section>
    </main>
  )
}
