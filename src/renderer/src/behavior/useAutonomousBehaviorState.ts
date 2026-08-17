import { useSyncExternalStore } from 'react'

import type {
  AutonomousBehaviorController,
  AutonomousBehaviorSnapshot
} from './AutonomousBehaviorController'

export function useAutonomousBehaviorState(
  controller: AutonomousBehaviorController
): AutonomousBehaviorSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
}
