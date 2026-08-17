export interface PetPointerPosition {
  screenX: number
  screenY: number
}

export function isPetPointerPosition(value: unknown): value is PetPointerPosition {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const position = value as Partial<PetPointerPosition>

  return (
    typeof position.screenX === 'number' &&
    Number.isFinite(position.screenX) &&
    typeof position.screenY === 'number' &&
    Number.isFinite(position.screenY)
  )
}
