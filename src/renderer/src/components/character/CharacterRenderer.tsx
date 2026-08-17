import { useEffect } from 'react'

import type { LoadedCharacter } from '../../../../shared/character'
import type { PetAction } from '../../../../shared/pet-action'
import { StaticImageRenderer } from './renderers/StaticImageRenderer'
import { TEMPORARY_ACTION_INDICATORS } from './temporary-action-visuals'

interface CharacterRendererProps {
  character: LoadedCharacter
  currentAction: PetAction
}

export function CharacterRenderer({
  character,
  currentAction
}: CharacterRendererProps): React.JSX.Element {
  const requestedAction = character.actions[currentAction]
  const renderedActionName = requestedAction ? currentAction : 'idle'
  const action = requestedAction ?? character.actions.idle
  const isFallback = !requestedAction && currentAction !== 'idle'

  useEffect(() => {
    if (import.meta.env.DEV && isFallback) {
      console.info(
        `[CharacterRenderer] Character "${character.manifest.id}" does not provide "${currentAction}"; using idle fallback.`
      )
    }
  }, [character.manifest.id, currentAction, isFallback])

  if (!action) {
    return <p className="character-status">This character does not provide an idle action.</p>
  }

  if (character.manifest.renderer !== 'static-image' || action.definition.type !== 'static') {
    return (
      <p className="character-status">
        Renderer “{character.manifest.renderer}” is not implemented yet.
      </p>
    )
  }

  const fallbackDescription = isFallback ? `, using ${renderedActionName} fallback` : ''
  const indicator = TEMPORARY_ACTION_INDICATORS[currentAction]

  return (
    <div
      className="character-renderer"
      data-character-id={character.manifest.id}
      data-action={currentAction}
      data-rendered-action={renderedActionName}
      aria-label={`${character.manifest.name} character renderer, action ${currentAction}${fallbackDescription}`}
    >
      <StaticImageRenderer
        character={character}
        action={action}
        requestedActionName={currentAction}
        renderedActionName={renderedActionName}
      />
      {import.meta.env.DEV && indicator ? (
        <span className="temporary-action-indicator" aria-hidden="true">
          {indicator}
        </span>
      ) : null}
    </div>
  )
}
