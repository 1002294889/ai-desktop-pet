import { screen, type BrowserWindow, type Rectangle } from 'electron'

import type { PetPointerPosition } from '../../shared/pet-pointer-drag'
import type { DesktopMovementController } from './DesktopMovementController'
import { clampWindowToWorkArea } from './window-bounds'

export class PetPointerDragController {
  private startPointer: PetPointerPosition | undefined
  private startWindowBounds: Rectangle | undefined

  constructor(
    private readonly window: BrowserWindow,
    private readonly movementController: DesktopMovementController
  ) {}

  start(position: PetPointerPosition): void {
    if (this.window.isDestroyed()) {
      return
    }

    this.movementController.stop()
    this.startPointer = position
    this.startWindowBounds = this.window.getBounds()
  }

  move(position: PetPointerPosition): void {
    if (this.window.isDestroyed() || !this.startPointer || !this.startWindowBounds) {
      return
    }

    const targetBounds: Rectangle = {
      ...this.startWindowBounds,
      x: Math.round(
        this.startWindowBounds.x + position.screenX - this.startPointer.screenX
      ),
      y: Math.round(
        this.startWindowBounds.y + position.screenY - this.startPointer.screenY
      )
    }
    const display = screen.getDisplayMatching(targetBounds)
    const positionWithinWorkArea = clampWindowToWorkArea(targetBounds, display.workArea)

    this.window.setPosition(positionWithinWorkArea.x, positionWithinWorkArea.y, false)
  }

  end(): void {
    this.startPointer = undefined
    this.startWindowBounds = undefined
  }

  dispose(): void {
    this.end()
  }
}
