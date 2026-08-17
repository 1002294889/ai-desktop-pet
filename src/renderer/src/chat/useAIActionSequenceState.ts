import { useSyncExternalStore } from 'react'

import type {
  AIActionSequenceController,
  AIActionSequenceSnapshot
} from './AIActionSequenceController'

export function useAIActionSequenceState(
  controller: AIActionSequenceController
): AIActionSequenceSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
