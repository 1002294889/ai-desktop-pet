import type { ChatMode } from '../../../shared/chat'
import type { AutonomousBehaviorController } from '../behavior/AutonomousBehaviorController'
import type { PetActionController } from '../pet/PetActionController'
import type { AIActionSequenceController } from './AIActionSequenceController'

const CHAT_CLOSE_RESUME_DELAY_MS = 750

export class ChatSessionCoordinator {
  private isChatOpen = false
  private shouldResumeAutonomy = false
  private isEnforcingPause = false
  private isWaitingForAISequence = false
  private resumeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly actionController: PetActionController,
    private readonly behaviorController: AutonomousBehaviorController,
    private readonly aiActionSequenceController: AIActionSequenceController
  ) {
    behaviorController.subscribe(this.handleBehaviorStateChange)
    aiActionSequenceController.subscribe(this.handleAIActionSequenceStateChange)
  }

  handleMode(mode: ChatMode): void {
    const nextIsChatOpen = mode === 'chat'

    if (nextIsChatOpen === this.isChatOpen) {
      if (nextIsChatOpen) {
        this.enforcePause()
      }

      return
    }

    this.clearResumeTimer()
    this.isChatOpen = nextIsChatOpen

    if (nextIsChatOpen) {
      this.isWaitingForAISequence = false
      this.enforcePause()
      return
    }

    if (this.aiActionSequenceController.isEngaged()) {
      this.isWaitingForAISequence = true
      this.aiActionSequenceController.releaseForAutonomy()

      if (this.isWaitingForAISequence && !this.aiActionSequenceController.isEngaged()) {
        this.isWaitingForAISequence = false
        this.completeChatClose()
      }

      return
    }

    this.completeChatClose()
  }

  private completeChatClose(): void {
    if (this.isChatOpen) {
      return
    }

    this.actionController.playAction('idle', { force: true })

    if (this.shouldResumeAutonomy) {
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = undefined
        this.shouldResumeAutonomy = false
        this.behaviorController.resumeAutonomousBehavior()
      }, CHAT_CLOSE_RESUME_DELAY_MS)
    } else {
      this.shouldResumeAutonomy = false
    }
  }

  private readonly handleBehaviorStateChange = (): void => {
    if (this.isChatOpen) {
      this.enforcePause()
    }
  }

  private readonly handleAIActionSequenceStateChange = (): void => {
    if (this.isChatOpen) {
      this.enforcePause()
      return
    }

    if (this.isWaitingForAISequence && !this.aiActionSequenceController.isEngaged()) {
      this.isWaitingForAISequence = false
      this.completeChatClose()
    }
  }

  private enforcePause(): void {
    if (
      this.isEnforcingPause ||
      this.behaviorController.getSnapshot().status !== 'running'
    ) {
      return
    }

    this.shouldResumeAutonomy = true
    this.isEnforcingPause = true
    this.behaviorController.pauseAutonomousBehavior()
    this.isEnforcingPause = false
  }

  private clearResumeTimer(): void {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer)
      this.resumeTimer = undefined
    }
  }
}
