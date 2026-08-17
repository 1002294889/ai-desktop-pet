import { petActionController } from '../pet/pet-action-controller-instance'
import { AIActionSequenceController } from './AIActionSequenceController'

export const aiActionSequenceController = new AIActionSequenceController(petActionController)
