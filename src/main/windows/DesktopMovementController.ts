import { screen, type BrowserWindow, type Rectangle } from 'electron'

import type {
  PetMovementDirection,
  PetMovementEdge,
  PetMovementSnapshot
} from '../../shared/pet-movement'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { clampWindowToWorkArea } from './window-bounds'

const DEFAULT_WALK_SPEED = 96
const MOVEMENT_TICK_MS = 16
const MAX_TICK_ELAPSED_MS = 100
const MOVEMENT_SNAPSHOT_INTERVAL_MS = 200
// macOS may coalesce the final `move` event until after a setPosition sequence stops.
// `will-move` still identifies a real user drag immediately during this grace period.
const PROGRAMMATIC_MOVE_GRACE_MS = 1_000

export interface DesktopMovementControllerOptions {
  walkSpeed?: number
}

export class DesktopMovementController {
  private direction: PetMovementDirection = 'stopped'
  private movementTimer: NodeJS.Timeout | undefined
  private lastTickAt = 0
  private preciseX = 0
  private lastSnapshotAt = 0
  private lastProgrammaticMoveAt = 0
  private readonly walkSpeed: number

  constructor(
    private readonly window: BrowserWindow,
    options: DesktopMovementControllerOptions = {}
  ) {
    this.walkSpeed = options.walkSpeed ?? DEFAULT_WALK_SPEED
  }

  setDirection(direction: PetMovementDirection): void {
    if (direction === 'stopped') {
      this.stop()
      return
    }

    if (this.direction === direction && this.movementTimer) {
      return
    }

    this.clearMovementTimer()
    this.direction = direction
    this.preciseX = this.window.getBounds().x
    this.lastTickAt = performance.now()
    this.notifyMovementState(true)
    this.movementTimer = setInterval(() => this.moveWindow(), MOVEMENT_TICK_MS)
  }

  stop(): void {
    this.clearMovementTimer()
    this.direction = 'stopped'
    this.notifyMovementState(true)
  }

  dispose(): void {
    this.stop()
  }

  wasRecentProgrammaticMove(): boolean {
    return Date.now() - this.lastProgrammaticMoveAt <= PROGRAMMATIC_MOVE_GRACE_MS
  }

  private moveWindow(): void {
    if (this.window.isDestroyed() || this.direction === 'stopped') {
      this.stop()
      return
    }

    const now = performance.now()
    const elapsedMs = Math.min(now - this.lastTickAt, MAX_TICK_ELAPSED_MS)
    const bounds = this.window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const clampedPosition = clampWindowToWorkArea(bounds, display.workArea)
    const minimumX = display.workArea.x
    const maximumX = Math.max(
      minimumX,
      display.workArea.x + display.workArea.width - bounds.width
    )

    if (Math.abs(bounds.x - this.preciseX) > 2) {
      this.preciseX = bounds.x
    }

    const directionMultiplier = this.direction === 'left' ? -1 : 1
    const nextPreciseX = this.preciseX + directionMultiplier * this.walkSpeed * (elapsedMs / 1_000)
    const boundedPreciseX = Math.min(Math.max(nextPreciseX, minimumX), maximumX)
    const nextX = Math.round(boundedPreciseX)
    const nextY = clampedPosition.y
    const reachedEdge = nextPreciseX <= minimumX || nextPreciseX >= maximumX

    this.lastTickAt = now
    this.preciseX = boundedPreciseX

    if (nextX !== bounds.x || nextY !== bounds.y) {
      this.lastProgrammaticMoveAt = Date.now()
      this.window.setPosition(nextX, nextY, false)
    }

    this.notifyMovementState(false)

    if (reachedEdge) {
      const reachedDirection = this.direction

      this.stop()
      this.notifyEdge(reachedDirection)
    }
  }

  private notifyEdge(edge: PetMovementEdge): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.petMovementEdgeReached, edge)
    }
  }

  private notifyMovementState(force: boolean): void {
    const now = Date.now()

    if (!force && now - this.lastSnapshotAt < MOVEMENT_SNAPSHOT_INTERVAL_MS) {
      return
    }

    if (this.window.isDestroyed()) {
      return
    }

    const bounds = this.window.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const snapshot = createMovementSnapshot(this.direction, bounds, display.workArea, display.id)

    this.lastSnapshotAt = now
    this.window.webContents.send(IPC_CHANNELS.petMovementStateChanged, snapshot)
  }

  private clearMovementTimer(): void {
    if (this.movementTimer) {
      clearInterval(this.movementTimer)
      this.movementTimer = undefined
    }
  }
}

function createMovementSnapshot(
  direction: PetMovementDirection,
  bounds: Rectangle,
  workArea: Rectangle,
  displayId: number
): PetMovementSnapshot {
  return {
    direction,
    x: bounds.x,
    y: bounds.y,
    minimumX: workArea.x,
    maximumX: Math.max(workArea.x, workArea.x + workArea.width - bounds.width),
    displayId
  }
}
