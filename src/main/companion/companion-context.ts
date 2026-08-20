import type { CompanionStateSnapshot } from '../../shared/companion-state'
import type { AIChatMessage } from '../ai/ai-provider'

export function createCompanionStateContextMessage(
  snapshot: CompanionStateSnapshot
): AIChatMessage {
  const payload = {
    currentMood: {
      state: snapshot.emotion.state,
      intensity: Math.round(snapshot.emotion.intensity * 10) / 10
    },
    relationship: {
      familiarity: getFamiliarityBand(snapshot.relationship.familiarity),
      trust: getTrustBand(snapshot.relationship.trust)
    }
  }

  return {
    role: 'system',
    content: [
      '## Bounded companion state',
      'Use this state only as subtle style guidance. Never quote scores, announce an internal mood, or repeatedly discuss the relationship state.',
      'A stronger happy or excited mood may make the wording a little more energetic. Calm or sleepy should make it gentler and lower-key. Annoyed must remain light and never hostile.',
      'Familiarity may make tone gradually more casual, but it never changes factual accuracy, safety, or what history is available.',
      'Never invent shared history. Only mention user facts supplied in recent conversation or the separate persisted-memory context.',
      'Never guilt, shame, pressure, threaten, or punish the user for inactivity. Do not imply abandonment or dependency.',
      JSON.stringify(payload)
    ].join('\n')
  }
}

function getFamiliarityBand(value: number): 'new' | 'developing' | 'familiar' {
  return value < 0.15 ? 'new' : value < 0.5 ? 'developing' : 'familiar'
}

function getTrustBand(value: number): 'forming' | 'comfortable' | 'established' {
  return value < 0.12 ? 'forming' : value < 0.45 ? 'comfortable' : 'established'
}
