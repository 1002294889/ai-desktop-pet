import type { AIChatMessage } from './ai-provider'

export type ReplySegmentationMode =
  | 'single'
  | 'reaction_follow_up'
  | 'adaptive'

export function createReplyPlanInstructionMessage(
  currentUserMessage: string
): AIChatMessage {
  const mode = getReplySegmentationMode(currentUserMessage)
  const modeInstruction =
    mode === 'single'
      ? 'Return exactly one segment. Do not add a follow-up segment.'
      : mode === 'reaction_follow_up'
        ? 'Return exactly two segments. Segment 1 is a brief reaction with no information request. Segment 2 asks exactly one specific follow-up question.'
        : 'Return one segment by default. Use two only when a separate short reaction and one follow-up clearly improve this turn.'

  return {
    role: 'system',
    content: [
      '## Current-turn reply-plan requirement',
      modeInstruction,
      `Planning mode: ${mode}`,
      'The visible response must still be JSON only: {"segments":[{"text":"..."}]}.'
    ].join('\n')
  }
}

export function getReplySegmentationMode(
  currentUserMessage: string
): ReplySegmentationMode {
  const normalized = currentUserMessage.trim().normalize('NFKC').toLocaleLowerCase()

  if (requiresSingleSegment(normalized)) {
    return 'single'
  }

  if (describesAchievement(normalized) || describesInterestingPerson(normalized)) {
    return 'reaction_follow_up'
  }

  return 'adaptive'
}

function requiresSingleSegment(message: string): boolean {
  return (
    /[?？]\s*$/u.test(message) ||
    /(简短|一句话|只回答|不要展开)/u.test(message) ||
    isDirectPetActionCommand(message)
  )
}

export function isDirectPetActionCommand(message: string): boolean {
  const normalized = message.trim().normalize('NFKC').toLocaleLowerCase()

  return (
    /^(?:请|麻烦)?(?:你)?(?:给我)?(?:开心一下|高兴一下|生气一下|跳一下|跳起来|挥手|招手|坐下|睡觉|醒来|说句话)(?:吧|啦|呀|啊)?[。.!！]*$/u.test(
      normalized.replace(/\s+/gu, '')
    ) ||
    /^(?:please\s+)?(?:be happy|get angry|jump|wave|sit down|go to sleep|wake up|say something)(?:\s+(?:please|now))?[.!]*$/u.test(
      normalized
    )
  )
}

function describesAchievement(message: string): boolean {
  return (
    /(拿奖|获奖|拿第一|第一名|冠军|比赛赢了|赢了比赛|升职|通过了)/u.test(message) ||
    /\b(i won|won the|got an award|won an award|made first place|champion)\b/u.test(message)
  )
}

function describesInterestingPerson(message: string): boolean {
  return (
    /(认识|遇到|碰到).{0,8}(有意思|有趣|特别).{0,3}(人|朋友|家伙)/u.test(message) ||
    /\b(met|meet).{0,24}\b(interesting|funny|fascinating)\b.{0,12}\b(person|someone|guy|girl)\b/u.test(message)
  )
}
