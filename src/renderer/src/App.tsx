import { useCallback, useEffect, useRef, useState } from 'react'

import type { LoadedCharacter } from '../../shared/character'
import type { AppSettingsOverview } from '../../shared/app-settings'
import {
  isCompanionAutonomousAction,
  isCompanionInteraction
} from '../../shared/companion-state'
import type { PetMovementSnapshot } from '../../shared/pet-movement'
import { autonomousBehaviorController } from './behavior/autonomous-behavior-controller-instance'
import { useAutonomousBehaviorState } from './behavior/useAutonomousBehaviorState'
import { useDeveloperChatShortcuts } from './chat/useDeveloperChatShortcuts'
import { usePetChatBridge } from './chat/usePetChatBridge'
import { aiActionSequenceController } from './chat/ai-action-sequence-controller-instance'
import { useAIActionSequenceState } from './chat/useAIActionSequenceState'
import { CharacterRenderer } from './components/character/CharacterRenderer'
import { useCompanionState } from './companion/useCompanionState'
import { petInteractionController } from './interaction/pet-interaction-controller-instance'
import { usePetInteraction } from './interaction/usePetInteraction'
import { usePetInteractionState } from './interaction/usePetInteractionState'
import { petActionController } from './pet/pet-action-controller-instance'
import { PetQuickActions } from './pet/PetQuickActions'
import { useDeveloperActionShortcuts } from './pet/useDeveloperActionShortcuts'
import { usePetActionState } from './pet/usePetActionState'

export function App(): React.JSX.Element {
  const [character, setCharacter] = useState<LoadedCharacter>()
  const [loadError, setLoadError] = useState<string>()
  const [movementState, setMovementState] = useState<PetMovementSnapshot>()
  const [settings, setSettings] = useState<AppSettingsOverview>()
  const actionState = usePetActionState(petActionController)
  const behaviorState = useAutonomousBehaviorState(autonomousBehaviorController)
  const interactionState = usePetInteractionState(petInteractionController)
  const aiActionSequenceState = useAIActionSequenceState(aiActionSequenceController)
  const companion = useCompanionState()
  const companionState = companion.state
  const interactionBindings = usePetInteraction(petInteractionController)
  const chatState = usePetChatBridge()
  const handledInteractionCount = useRef(0)
  const reportedAutonomousTransitionCount = useRef(0)

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

    if (isCompanionInteraction(interactionState.currentInteraction)) {
      window.desktopApi.reportCompanionInteraction(interactionState.currentInteraction)
    }

    if (
      interactionState.currentInteraction === 'single-click' &&
      chatState?.mode !== 'chat'
    ) {
      window.desktopApi.showSpeechBubble()
    }
  }, [chatState?.mode, interactionState.currentInteraction, interactionState.interactionCount])

  useEffect(() => {
    if (companionState) {
      autonomousBehaviorController.setEmotion(companionState.emotion)
    }
  }, [companionState])

  useEffect(() => {
    if (
      behaviorState.transitionCount === reportedAutonomousTransitionCount.current ||
      !isCompanionAutonomousAction(behaviorState.plannedAction)
    ) {
      return
    }

    reportedAutonomousTransitionCount.current = behaviorState.transitionCount
    window.desktopApi.reportCompanionAutonomousAction(behaviorState.plannedAction)
  }, [behaviorState.plannedAction, behaviorState.transitionCount])

  useEffect(() => {
    return window.desktopApi.onPetDragStateChange((isDragging) =>
      petInteractionController.handleSystemDragState(isDragging)
    )
  }, [])

  useEffect(() => {
    return window.desktopApi.onPetUserAction((action) => {
      if (action === 'sleep-toggle') {
        aiActionSequenceController.playActions([
          petActionController.getSnapshot().currentAction === 'sleep' ? 'wake' : 'sleep'
        ])
        return
      }

      aiActionSequenceController.playActions([action])
    })
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
    const applyCharacter = (loadedCharacter: LoadedCharacter): void => {
      if (!isActive) {
        return
      }

      petActionController.playAction('idle', { force: true })
      setCharacter(loadedCharacter)
      setLoadError(undefined)
    }
    const stopListening = window.desktopApi.onActiveCharacterChange(applyCharacter)

    void window.desktopApi
      .getActiveCharacter()
      .then(applyCharacter)
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load character')
        }
      })

    return () => {
      isActive = false
      stopListening()
    }
  }, [])

  useEffect(() => {
    let isActive = true
    const applySettings = (overview: AppSettingsOverview): void => {
      if (isActive) {
        setSettings(overview)
      }
    }
    const stopListening = window.desktopApi.onAppSettingsChange(applySettings)

    void window.desktopApi
      .getAppSettings()
      .then(applySettings)
      .catch(() => undefined)

    return () => {
      isActive = false
      stopListening()
    }
  }, [])

  useEffect(() => {
    if (!character) {
      return
    }

    const shouldRun =
      settings?.settings.autonomousBehaviorEnabled === true &&
      settings.settings.petVisible

    if (shouldRun) {
      if (autonomousBehaviorController.getSnapshot().status === 'stopped') {
        autonomousBehaviorController.startAutonomousBehavior()
      } else {
        autonomousBehaviorController.resumeAutonomousBehavior()
      }
    } else {
      autonomousBehaviorController.pauseAutonomousBehavior()
    }
  }, [character, settings?.settings.autonomousBehaviorEnabled, settings?.settings.petVisible])

  useEffect(() => {
    return () => autonomousBehaviorController.stopAutonomousBehavior()
  }, [])

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
              emotion={companionState?.emotion}
            />
          </div>
        ) : null}
        {!character && !loadError ? <p className="character-status">Loading character…</p> : null}
        {loadError ? <p className="character-status">{loadError}</p> : null}
        {character ? (
          <PetQuickActions
            characterName={character.manifest.name}
            active={
              interactionState.isHovered &&
              !interactionState.isDragging &&
              (actionState.currentAction === 'idle' || actionState.currentAction === 'sit') &&
              chatState?.mode === 'hidden'
            }
          />
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
            {' · '}Mood: {companionState?.emotion.state ?? companion.status}@{companionState?.emotion.intensity.toFixed(2) ?? '?'}
            {' · '}Relationship: F{companionState?.relationship.familiarity.toFixed(3) ?? '?'}/T
            {companionState?.relationship.trust.toFixed(3) ?? '?'} · Interactions:{' '}
            {companionState?.relationship.interactionCount ?? '?'}
            {companion.error ? ` · Companion error: ${companion.error}` : ''}
          </output>
        ) : null}
      </section>
    </main>
  )
}
