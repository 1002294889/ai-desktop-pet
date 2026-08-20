export const USER_PET_ACTIONS = ['wave', 'jump', 'sit', 'sleep-toggle'] as const

export type UserPetAction = (typeof USER_PET_ACTIONS)[number]

export function isUserPetAction(value: unknown): value is UserPetAction {
  return USER_PET_ACTIONS.includes(value as UserPetAction)
}
