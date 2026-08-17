import type { PetAction } from '../../../../shared/pet-action'

export const TEMPORARY_ACTION_INDICATORS = {
  idle: '',
  walk_left: '←',
  walk_right: '→',
  sit: 'SIT',
  sleep: 'Z z',
  wake: '!',
  happy: '♥',
  angry: '!',
  jump: '↑',
  wave: 'WAVE',
  talk: '•••',
  dragged: 'DRAG'
} satisfies Record<PetAction, string>
