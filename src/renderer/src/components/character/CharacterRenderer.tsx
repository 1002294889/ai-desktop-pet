import { useEffect } from 'react'

import type {
  LoadedCharacter,
  LoadedCharacterAction,
  LoadedSpriteCharacterAction,
  LoadedStaticCharacterAction
} from '../../../../shared/character'
import type { PetAction } from '../../../../shared/pet-action'
import { SpriteRenderer } from './renderers/SpriteRenderer'
import { StaticImageRenderer } from './renderers/StaticImageRenderer'
import { TEMPORARY_ACTION_INDICATORS } from './temporary-action-visuals'

interface CharacterRendererProps {
  character: LoadedCharacter
  currentAction: PetAction
  animationKey: number
  onActionComplete: (action: PetAction) => void
}

export function CharacterRenderer({
  character,
  currentAction,
  animationKey,
  onActionComplete
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

  const fallbackDescription = isFallback ? `, using ${renderedActionName} fallback` : ''
  const indicator = isFallback ? TEMPORARY_ACTION_INDICATORS[currentAction] : undefined

  return (
    <div
      className="character-renderer"
      data-character-id={character.manifest.id}
      data-action={currentAction}
      data-rendered-action={renderedActionName}
      aria-label={`${character.manifest.name} character renderer, action ${currentAction}${fallbackDescription}`}
    >
      {isStaticAction(action) ? (
        <StaticImageRenderer
          character={character}
          action={action}
          requestedActionName={currentAction}
          renderedActionName={renderedActionName}
        />
      ) : null}
      {isSpriteAction(action) ? (
        <SpriteRenderer
          character={character}
          action={action}
          requestedActionName={currentAction}
          renderedActionName={renderedActionName}
          restartKey={animationKey}
          onComplete={() => onActionComplete(currentAction)}
        />
      ) : null}
      {action.definition.type === 'animated-image' || action.definition.type === 'live2d' ? (
        <p className="character-status">Renderer “{action.definition.type}” is not implemented yet.</p>
      ) : null}
      {import.meta.env.DEV && indicator ? (
        <span className="temporary-action-indicator" aria-hidden="true">
          {indicator}
        </span>
      ) : null}
    </div>
  )
}

function isStaticAction(action: LoadedCharacterAction): action is LoadedStaticCharacterAction {
  return action.definition.type === 'static'
}

function isSpriteAction(action: LoadedCharacterAction): action is LoadedSpriteCharacterAction {
  return action.definition.type === 'sprite'
}
