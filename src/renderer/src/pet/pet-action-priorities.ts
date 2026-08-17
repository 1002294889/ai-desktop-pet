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
  walk_left: { priority: 20, interruptible: true, durationMs: 3_000 },
  walk_right: { priority: 20, interruptible: true, durationMs: 3_000 },
  talk: { priority: 40, interruptible: true, durationMs: 3_000 },
  happy: { priority: 50, interruptible: true, durationMs: 3_000 },
  angry: { priority: 50, interruptible: true, durationMs: 3_000 },
  wave: { priority: 50, interruptible: true, durationMs: 3_000 },
  wake: { priority: 60, interruptible: false, durationMs: 3_000 },
  jump: { priority: 60, interruptible: false, durationMs: 3_000 },
  dragged: { priority: 100, interruptible: false }
}
