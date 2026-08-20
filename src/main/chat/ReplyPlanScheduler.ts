import type { CompanionReplySegment } from '../ai/companion-reply-plan'

interface ReplyPlanScheduleHandlers {
  onSegment: (segment: CompanionReplySegment, isLast: boolean) => void
  onComplete: () => void
}

interface ActiveSchedule {
  turnId: number
  segments: readonly CompanionReplySegment[]
  nextIndex: number
  handlers: ReplyPlanScheduleHandlers
}

export interface CancelledReplySchedule {
  turnId: number
  cancelledSegments: number
}

export class ReplyPlanScheduler {
  private activeSchedule: ActiveSchedule | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  start(
    turnId: number,
    segments: readonly CompanionReplySegment[],
    handlers: ReplyPlanScheduleHandlers
  ): void {
    this.cancel()

    if (segments.length === 0) {
      handlers.onComplete()
      return
    }

    this.activeSchedule = { turnId, segments, nextIndex: 0, handlers }
    this.scheduleNext()
  }

  hasPendingTurn(): boolean {
    return this.activeSchedule !== undefined
  }

  cancel(): CancelledReplySchedule | undefined {
    const schedule = this.activeSchedule

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }

    this.activeSchedule = undefined

    if (!schedule) {
      return undefined
    }

    return {
      turnId: schedule.turnId,
      cancelledSegments: schedule.segments.length - schedule.nextIndex
    }
  }

  dispose(): void {
    this.cancel()
  }

  private scheduleNext(): void {
    const schedule = this.activeSchedule

    if (!schedule) {
      return
    }

    const segment = schedule.segments[schedule.nextIndex]

    if (!segment) {
      this.activeSchedule = undefined
      schedule.handlers.onComplete()
      return
    }

    this.timer = setTimeout(() => {
      this.timer = undefined

      if (this.activeSchedule !== schedule) {
        return
      }

      const isLast = schedule.nextIndex === schedule.segments.length - 1

      schedule.nextIndex += 1
      schedule.handlers.onSegment(segment, isLast)

      if (this.activeSchedule !== schedule) {
        return
      }

      if (isLast) {
        this.activeSchedule = undefined
        schedule.handlers.onComplete()
      } else {
        this.scheduleNext()
      }
    }, segment.delayBeforeMs)
  }
}
