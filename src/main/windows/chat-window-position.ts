import type { Point, Rectangle, Size } from 'electron'

import type { ChatPlacement } from '../../shared/chat'
import { clampWindowToWorkArea } from './window-bounds'

const WINDOW_GAP = 12
const EDGE_MARGIN = 8

export interface ChatWindowPosition {
  placement: ChatPlacement
  point: Point
}

export function calculateChatWindowPosition(
  petBounds: Rectangle,
  chatSize: Size,
  workArea: Rectangle
): ChatWindowPosition {
  const spaces: Record<ChatPlacement, number> = {
    left: petBounds.x - workArea.x,
    right: workArea.x + workArea.width - (petBounds.x + petBounds.width),
    above: petBounds.y - workArea.y,
    below: workArea.y + workArea.height - (petBounds.y + petBounds.height)
  }
  const horizontalProgress =
    (petBounds.x + petBounds.width / 2 - workArea.x) / Math.max(1, workArea.width)
  const preferredPlacements: ChatPlacement[] =
    horizontalProgress <= 0.34
      ? ['right', 'above', 'below', 'left']
      : horizontalProgress >= 0.66
        ? ['left', 'above', 'below', 'right']
        : ['above', 'right', 'left', 'below']
  const bestAvailablePlacement = [...preferredPlacements].sort(
    (left, right) => spaces[right] - spaces[left]
  )[0]
  const placement =
    preferredPlacements.find((candidate) =>
      candidate === 'left' || candidate === 'right'
        ? spaces[candidate] >= chatSize.width + WINDOW_GAP
        : spaces[candidate] >= chatSize.height + WINDOW_GAP
    ) ?? bestAvailablePlacement ?? 'right'

  const centeredX = Math.round(petBounds.x + (petBounds.width - chatSize.width) / 2)
  const centeredY = Math.round(petBounds.y + (petBounds.height - chatSize.height) / 2)
  const targetBounds: Rectangle = {
    width: chatSize.width,
    height: chatSize.height,
    x:
      placement === 'left'
        ? petBounds.x - chatSize.width - WINDOW_GAP
        : placement === 'right'
          ? petBounds.x + petBounds.width + WINDOW_GAP
          : centeredX,
    y:
      placement === 'above'
        ? petBounds.y - chatSize.height - WINDOW_GAP
        : placement === 'below'
          ? petBounds.y + petBounds.height + WINDOW_GAP
          : centeredY
  }
  const insetWorkArea: Rectangle = {
    x: workArea.x + EDGE_MARGIN,
    y: workArea.y + EDGE_MARGIN,
    width: Math.max(chatSize.width, workArea.width - EDGE_MARGIN * 2),
    height: Math.max(chatSize.height, workArea.height - EDGE_MARGIN * 2)
  }

  return {
    placement,
    point: clampWindowToWorkArea(targetBounds, insetWorkArea)
  }
}
