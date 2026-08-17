import { petActionController } from '../pet/pet-action-controller-instance'
import { AutonomousBehaviorController } from './AutonomousBehaviorController'

export const autonomousBehaviorController = new AutonomousBehaviorController(petActionController, {
  setMovement: (direction) => window.desktopApi.setPetMovement(direction)
})
