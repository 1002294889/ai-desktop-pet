import { autonomousBehaviorController } from '../behavior/autonomous-behavior-controller-instance'
import { petActionController } from '../pet/pet-action-controller-instance'
import { aiActionSequenceController } from './ai-action-sequence-controller-instance'
import { ChatSessionCoordinator } from './ChatSessionCoordinator'

export const chatSessionCoordinator = new ChatSessionCoordinator(
  petActionController,
  autonomousBehaviorController,
  aiActionSequenceController
)
