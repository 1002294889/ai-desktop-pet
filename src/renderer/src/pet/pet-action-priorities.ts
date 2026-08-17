import type { PetAction } from '../../../shared/pet-action'

export interface PetActionPolicy {
  priority: number
  interruptible: boolean
  durationMs?: number
}

export const PET_ACTION_POLICIES: Record<PetAction, PetActionPolicy> = {
  idle: { priority: 10, interruptible: true },
  sit: { priority: 10, interruptible: true },
  sleep: { priority: 10, interruptible: true },
  walk_left: { priority: 20, interruptible: true },
  walk_right: { priority: 20, interruptible: true },
  talk: { priority: 40, interruptible: true },
  happy: { priority: 50, interruptible: true },
  angry: { priority: 50, interruptible: true },
  wave: { priority: 50, interruptible: true },
  wake: { priority: 60, interruptible: false },
  jump: { priority: 60, interruptible: false },
  dragged: { priority: 100, interruptible: false }
}
