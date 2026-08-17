import { useMemo } from 'react'
import type { PointerEventHandler } from 'react'

import type { PetInteractionController, PetPointerInput } from './PetInteractionController'

export interface PetInteractionBindings {
  onPointerEnter: PointerEventHandler<HTMLDivElement>
  onPointerLeave: PointerEventHandler<HTMLDivElement>
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerUp: PointerEventHandler<HTMLDivElement>
  onPointerCancel: PointerEventHandler<HTMLDivElement>
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>
}

export function usePetInteraction(
  controller: PetInteractionController
): PetInteractionBindings {
  return useMemo(
    () => ({
      onPointerEnter: () => controller.pointerEnter(),
      onPointerLeave: () => controller.pointerLeave(),
      onPointerDown: (event) => {
        if (controller.pointerDown(toPointerInput(event))) {
          event.currentTarget.setPointerCapture(event.pointerId)
          event.preventDefault()
        }
      },
      onPointerMove: (event) => {
        if (controller.pointerMove(toPointerInput(event))) {
          event.preventDefault()
        }
      },
      onPointerUp: (event) => {
        controller.pointerUp(toPointerInput(event))

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }

        event.preventDefault()
      },
      onPointerCancel: (event) => controller.pointerCancel(event.pointerId),
      onLostPointerCapture: (event) => controller.pointerCancel(event.pointerId)
    }),
    [controller]
  )
}

function toPointerInput(event: React.PointerEvent<HTMLDivElement>): PetPointerInput {
  return {
    pointerId: event.pointerId,
    button: event.button,
    screenX: event.screenX,
    screenY: event.screenY
  }
}
