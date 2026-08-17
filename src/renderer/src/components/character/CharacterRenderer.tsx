import type { LoadedCharacter } from '../../../../shared/character'
import { StaticImageRenderer } from './renderers/StaticImageRenderer'

interface CharacterRendererProps {
  character: LoadedCharacter
  actionName?: string
}

export function CharacterRenderer({
  character,
  actionName = 'idle'
}: CharacterRendererProps): React.JSX.Element {
  const action = character.actions[actionName]

  if (!action) {
    return <p className="character-status">Action “{actionName}” is unavailable.</p>
  }

  if (character.manifest.renderer !== 'static-image' || action.definition.type !== 'static') {
    return (
      <p className="character-status">
        Renderer “{character.manifest.renderer}” is not implemented yet.
      </p>
    )
  }

  return (
    <div
      className="character-renderer"
      data-character-id={character.manifest.id}
      aria-label={`${character.manifest.name} character renderer`}
    >
      <StaticImageRenderer character={character} action={action} actionName={actionName} />
      {import.meta.env.DEV ? (
        <output className="character-debug-label">
          Loaded: {character.manifest.name} ({character.manifest.id})
        </output>
      ) : null}
    </div>
  )
}
