export const PET_MOVEMENT_DIRECTIONS = ['left', 'right', 'stopped'] as const

export type PetMovementDirection = (typeof PET_MOVEMENT_DIRECTIONS)[number]

export const PET_MOVEMENT_EDGES = ['left', 'right'] as const

export type PetMovementEdge = (typeof PET_MOVEMENT_EDGES)[number]

export interface PetMovementSnapshot {
  direction: PetMovementDirection
  x: number
  y: number
  minimumX: number
  maximumX: number
  displayId: number
}

export function isPetMovementDirection(value: unknown): value is PetMovementDirection {
  return PET_MOVEMENT_DIRECTIONS.includes(value as PetMovementDirection)
}

export function isPetMovementEdge(value: unknown): value is PetMovementEdge {
  return PET_MOVEMENT_EDGES.includes(value as PetMovementEdge)
}

export function isPetMovementSnapshot(value: unknown): value is PetMovementSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const snapshot = value as Partial<PetMovementSnapshot>

  return (
    isPetMovementDirection(snapshot.direction) &&
    typeof snapshot.x === 'number' &&
    typeof snapshot.y === 'number' &&
    typeof snapshot.minimumX === 'number' &&
    typeof snapshot.maximumX === 'number' &&
    typeof snapshot.displayId === 'number'
  )
}
