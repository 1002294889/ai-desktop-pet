import { CharacterRenderer } from './components/character/CharacterRenderer'

export function App(): React.JSX.Element {
  return (
    <main className="desktop-pet-shell">
      <section className="pet-drag-region" aria-label="Desktop pet. Drag to move the window.">
        <CharacterRenderer />
      </section>
    </main>
  )
}
