import { screen, type BrowserWindow, type Point, type Rectangle, type Size } from 'electron'

const INITIAL_EDGE_MARGIN = 24
const MOVE_SETTLE_DELAY_MS = 120

export function getInitialWindowPosition(windowSize: Size): Point {
  const { workArea } = screen.getPrimaryDisplay()

  return {
    x: Math.max(
      workArea.x,
      workArea.x + workArea.width - windowSize.width - INITIAL_EDGE_MARGIN
    ),
    y: Math.max(
      workArea.y,
      workArea.y + workArea.height - windowSize.height - INITIAL_EDGE_MARGIN
    )
  }
}

export function clampWindowToWorkArea(bounds: Rectangle, workArea: Rectangle): Point {
  const maximumX = Math.max(workArea.x, workArea.x + workArea.width - bounds.width)
  const maximumY = Math.max(workArea.y, workArea.y + workArea.height - bounds.height)

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), maximumX),
    y: Math.min(Math.max(bounds.y, workArea.y), maximumY)
  }
}

export function attachWindowBoundsGuard(window: BrowserWindow): void {
  let moveTimer: NodeJS.Timeout | undefined

  const keepWindowVisible = (): void => {
    if (window.isDestroyed()) {
      return
    }

    const bounds = window.getBounds()
    const { workArea } = screen.getDisplayMatching(bounds)
    const position = clampWindowToWorkArea(bounds, workArea)

    if (position.x !== bounds.x || position.y !== bounds.y) {
      window.setPosition(position.x, position.y, false)
    }
  }

  const scheduleVisibilityCheck = (): void => {
    if (moveTimer) {
      clearTimeout(moveTimer)
    }

    moveTimer = setTimeout(keepWindowVisible, MOVE_SETTLE_DELAY_MS)
  }

  window.on('move', scheduleVisibilityCheck)
  screen.on('display-removed', scheduleVisibilityCheck)
  screen.on('display-metrics-changed', scheduleVisibilityCheck)

  window.once('closed', () => {
    if (moveTimer) {
      clearTimeout(moveTimer)
    }

    screen.off('display-removed', scheduleVisibilityCheck)
    screen.off('display-metrics-changed', scheduleVisibilityCheck)
  })
}
