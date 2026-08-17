import { useCallback, useEffect, useRef, useState } from 'react'

import type { LoadedCharacter } from '../../shared/character'
import type { PetMovementSnapshot } from '../../shared/pet-movement'
import { autonomousBehaviorController } from './behavior/autonomous-behavior-controller-instance'
import { useAutonomousBehaviorState } from './behavior/useAutonomousBehaviorState'
import { useDeveloperChatShortcuts } from './chat/useDeveloperChatShortcuts'
import { usePetChatBridge } from './chat/usePetChatBridge'
import { aiActionSequenceController } from './chat/ai-action-sequence-controller-instance'
import { useAIActionSequenceState } from './chat/useAIActionSequenceState'
import { CharacterRenderer } from './components/character/CharacterRenderer'
import { petInteractionController } from './interaction/pet-interaction-controller-instance'
import { usePetInteraction } from './interaction/usePetInteraction'
import { usePetInteractionState } from './interaction/usePetInteractionState'
import { petActionController } from './pet/pet-action-controller-instance'
import { useDeveloperActionShortcuts } from './pet/useDeveloperActionShortcuts'
import { usePetActionState } from './pet/usePetActionState'

export function App(): React.JSX.Element {
  const [character, setCharacter] = useState<LoadedCharacter>()
  const [loadError, setLoadError] = useState<string>()
  const [movementState, setMovementState] = useState<PetMovementSnapshot>()
  const actionState = usePetActionState(petActionController)
  const behaviorState = useAutonomousBehaviorState(autonomousBehaviorController)
  const interactionState = usePetInteractionState(petInteractionController)
  const aiActionSequenceState = useAIActionSequenceState(aiActionSequenceController)
  const interactionBindings = usePetInteraction(petInteractionController)
  const chatState = usePetChatBridge()
  const handledInteractionCount = useRef(0)

  useDeveloperActionShortcuts(petActionController, autonomousBehaviorController)
  useDeveloperChatShortcuts(chatState?.mode)

  const handleActionComplete = useCallback((action: typeof actionState.currentAction): void => {
    petActionController.completeCurrentAction(action, 'idle')
  }, [])

  useEffect(() => {
    if (interactionState.interactionCount === handledInteractionCount.current) {
      return
    }

    handledInteractionCount.current = interactionState.interactionCount

    if (
      interactionState.currentInteraction === 'single-click' &&
      chatState?.mode !== 'chat'
    ) {
      window.desktopApi.showSpeechBubble()
    }
  }, [chatState?.mode, interactionState.currentInteraction, interactionState.interactionCount])

  useEffect(() => {
    return window.desktopApi.onPetDragStateChange((isDragging) =>
      petInteractionController.handleSystemDragState(isDragging)
    )
  }, [])

  useEffect(() => {
    const stopListeningForEdges = window.desktopApi.onPetMovementEdge((edge) => {
      autonomousBehaviorController.handleMovementEdge(edge)
    })
    const stopListeningForMovement = window.desktopApi.onPetMovementStateChange(setMovementState)

    return () => {
      stopListeningForEdges()
      stopListeningForMovement()
    }
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

  useEffect(() => {
    if (!character) {
      return
    }

    autonomousBehaviorController.startAutonomousBehavior()

    return () => autonomousBehaviorController.stopAutonomousBehavior()
  }, [character])

  return (
    <main className="desktop-pet-shell">
      <section className="pet-drag-region" aria-label="Desktop pet. Drag to move the window.">
        {character ? (
          <div
            className="pet-interaction-surface"
            role="button"
            aria-label="Interact with or drag the desktop pet"
            data-hovered={interactionState.isHovered}
            data-pressed={interactionState.isPressed}
            data-dragging={interactionState.isDragging}
            data-interaction={interactionState.currentInteraction}
            {...interactionBindings}
          >
            <CharacterRenderer
              character={character}
              currentAction={actionState.currentAction}
              animationKey={actionState.startedAt}
              onActionComplete={handleActionComplete}
            />
          </div>
        ) : null}
        {!character && !loadError ? <p className="character-status">Loading character…</p> : null}
        {loadError ? <p className="character-status">{loadError}</p> : null}
        {character ? (
          <button
            className="chat-launch-button"
            type="button"
            aria-label={`Open chat with ${character.manifest.name}`}
            title={`Chat with ${character.manifest.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => window.desktopApi.openChat()}
          >
            Chat
          </button>
        ) : null}
        {import.meta.env.DEV && character ? (
          <output className="pet-action-debug" aria-live="polite">
            {character.manifest.name} ({character.manifest.id}) · Action:{' '}
            {actionState.currentAction} · Previous: {actionState.previousAction ?? 'none'} · Priority:{' '}
            {actionState.currentActionPriority} · {actionState.lifecycle} · Auto:{' '}
            {behaviorState.status}/{behaviorState.plannedAction ?? 'waiting'} · Timer:{' '}
            {behaviorState.schedulerActive ? 1 : 0} · Drag:{' '}
            {behaviorState.isDragPaused ? 1 : 0} · Move:{' '}
            {movementState?.direction ?? 'unknown'} · X: {movementState?.x ?? '?'} [{movementState?.minimumX ?? '?'}–
            {movementState?.maximumX ?? '?'}] · Transitions: {behaviorState.transitionCount} · Interaction:{' '}
            {interactionState.currentInteraction} · Hover: {interactionState.isHovered ? 1 : 0} · Interaction events:{' '}
            {interactionState.interactionCount} · Chat: {chatState?.mode ?? 'loading'}/
            {chatState?.placement ?? 'unknown'}
            {' · '}AI actions: {aiActionSequenceState.status}/
            {aiActionSequenceState.activeAction ?? 'none'} →{' '}
            {aiActionSequenceState.pendingActions.join(',') || 'none'}
          </output>
        ) : null}
      </section>
    </main>
  )
}
