import type { AIPetAction } from '../../shared/ai-pet-action'
import type { ChatMessage } from '../../shared/chat'
import type { EmotionSnapshot } from '../../shared/companion-state'
import type { AIChatRequest, AIChatResponse, AIProvider } from '../ai/ai-provider'
import { AIProviderError, getSafeAIErrorMessage } from '../ai/ai-provider-error'
import {
  createUnpacedReplyPlan,
  formatCompanionReplyPlanText,
  normalizeReplyPlanForTurn
} from '../ai/companion-reply-plan'
import { DeepSeekProvider } from '../ai/DeepSeekProvider'
import { parsePetActionToolCalls } from '../ai/deepseek-pet-action-tool'
import { createCompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import type {
  LongTermMemoryDiagnostics,
  PreparedMemoryContext
} from '../memory/LongTermMemoryCoordinator'
import type { MemoryManager } from '../memory/MemoryManager'
import {
  ChatController,
  type ChatProviderReplyDiagnostics,
  type ReplyPlanCancellationDiagnostics
} from './ChatController'
import {
  getLocalDesktopTimeContext,
  type LocalDesktopTimeContext
} from './local-time-context'
import { LocalReplyProvider } from './LocalReplyProvider'
import { calculateDynamicReplyDelay } from './reply-pacing'

const PROBE_MODES = ['exercise', 'deepseek'] as const
type ConversationPacingProbeMode = (typeof PROBE_MODES)[number]

export function getConversationPacingProbeMode(): ConversationPacingProbeMode | undefined {
  const value = process.env.DESKTOP_PET_CONVERSATION_PACING_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as ConversationPacingProbeMode)) {
    throw new Error(
      'DESKTOP_PET_CONVERSATION_PACING_PROBE_MODE must be exercise or deepseek.'
    )
  }

  return value as ConversationPacingProbeMode
}

export async function runConversationPacingProbe(
  mode: ConversationPacingProbeMode,
  memoryManager: MemoryManager,
  provider?: AIProvider
): Promise<void> {
  if (mode === 'deepseek') {
    assert(provider?.id === 'deepseek', 'DeepSeek probe requires the real DeepSeek provider')
    await runDeepSeekConversationPacingProbe(memoryManager, provider)
    return
  }

  await runScriptedConversationPacingProbe(memoryManager)
}

async function runScriptedConversationPacingProbe(
  memoryManager: MemoryManager
): Promise<void> {
  await verifyLocalFallbackSemanticActions()
  verifyUnknownToolActionRejection()
  await verifyControlledProviderFailure()

  memoryManager.clearConversationHistory()
  memoryManager.deleteRelationshipState()

  const provider = new ScriptedPacingProvider()
  const memoryPreparer = new ProbeMemoryPreparer()
  const companionState = createCompanionStateCoordinator(memoryManager)
  const replyDiagnostics: ChatProviderReplyDiagnostics[] = []
  const cancellations: ReplyPlanCancellationDiagnostics[] = []
  const actionRequests: AIPetAction[][] = []
  let localTime = getLocalDesktopTimeContext(new Date(2026, 7, 20, 14, 5))
  const controller = new ChatController({
    characterName: 'Pacing Test Pet',
    provider,
    providerInfo: {
      requestedProvider: 'local',
      activeProvider: 'local',
      model: null,
      usingFallback: false
    },
    memoryManager,
    longTermMemory: memoryPreparer,
    companionState,
    getLocalTimeContext: () => localTime,
    onProviderReply: (diagnostics) => replyDiagnostics.push(diagnostics),
    onReplyPlanCancelled: (diagnostics) => cancellations.push(diagnostics)
  })
  const stopListeningForActions = controller.subscribeToPetActions((actions) => {
    actionRequests.push([...actions])
  })

  controller.openChat()

  try {
    const achievementStart = countAssistantMessages(controller)
    const achievementResult = await controller.sendMessage('我今天比赛拿奖了。')

    assert(achievementResult.accepted, 'achievement message was rejected')
    assert(
      getNewAssistantMessages(controller, achievementStart).map(({ content }) => content).join('|') ===
        '真的假的？你还真拿下了 😂',
      'achievement first segment was not displayed independently'
    )
    assert(controller.getSnapshot().isWaitingForSegment, 'achievement follow-up was not pending')
    await waitForReplyToSettle(controller)
    assert(
      getNewAssistantMessages(controller, achievementStart).map(({ content }) => content).join('|') ===
        '真的假的？你还真拿下了 😂|最后第几名？',
      'achievement reply did not speak two natural segments'
    )

    const personStart = countAssistantMessages(controller)
    const personResult = await controller.sendMessage('今天认识了一个挺有意思的人。')

    assert(personResult.accepted, 'interesting-person message was rejected')
    await waitForReplyToSettle(controller)
    assert(
      getNewAssistantMessages(controller, personStart).map(({ content }) => content).join('|') ===
        '听着就有故事。|这人有意思在哪儿？',
      'interesting-person reply was not naturally segmented'
    )

    const multiSegmentDiagnostics = replyDiagnostics.slice(0, 2)
    const achievementDelay = multiSegmentDiagnostics[0]?.segmentDelaysMs[1]
    const personDelay = multiSegmentDiagnostics[1]?.segmentDelaysMs[1]

    assert(
      typeof achievementDelay === 'number' && achievementDelay >= 400 && achievementDelay <= 3_500,
      'achievement delay was outside the allowed pacing bounds'
    )
    assert(
      typeof personDelay === 'number' && personDelay >= 400 && personDelay <= 3_500,
      'interesting-person delay was outside the allowed pacing bounds'
    )
    assert(achievementDelay !== personDelay, 'different replies received the same fixed delay')

    const factualStart = countAssistantMessages(controller)
    const factualResult = await controller.sendMessage('2+2是多少？')

    assert(factualResult.accepted, 'factual question was rejected')
    assert(!controller.getSnapshot().isProcessing, 'single factual answer created a pending segment')
    assert(
      getNewAssistantMessages(controller, factualStart).map(({ content }) => content).join('|') === '4。',
      'factual question did not remain one immediate segment'
    )
    assert(
      !getLastAssistantMessage(controller).content.includes('时间'),
      'daytime factual answer mentioned time unnecessarily'
    )

    const interruptedStart = countAssistantMessages(controller)
    const interruptedResult = await controller.sendMessage('中断测试：我也拿奖了。')

    assert(interruptedResult.accepted, 'interruptible turn was rejected')
    assert(controller.getSnapshot().isWaitingForSegment, 'interruptible turn had no pending segment')
    assert(
      getNewAssistantMessages(controller, interruptedStart).map(({ content }) => content).join('|') ===
        '你真拿奖了？',
      'interruptible first segment was not spoken'
    )

    const interruptedDelay = replyDiagnostics.at(-1)?.segmentDelaysMs[1] ?? 2_200
    const interruptionReply = await controller.sendMessage('深圳。')

    assert(interruptionReply.accepted, 'new user turn did not interrupt the pending reply')
    await delay(interruptedDelay + 120)
    assert(
      !controller.getSnapshot().messages.some(({ content }) => content === '在哪比的？'),
      'stale pending segment appeared after interruption'
    )
    assert(
      cancellations.some(
        ({ reason, cancelledSegments }) =>
          reason === 'new-user-turn' && cancelledSegments === 1
      ),
      'interruption did not record ownership-based cancellation'
    )

    localTime = getLocalDesktopTimeContext(new Date(2026, 7, 21, 1, 32))
    const lateReplyStart = countAssistantMessages(controller)
    const lateReplyResult = await controller.sendMessage('我还在工作。')

    assert(lateReplyResult.accepted, 'late-night message was rejected')
    assert(
      getNewAssistantMessages(controller, lateReplyStart)[0]?.content === '这个点还在忙？',
      'late-night context did not influence wording naturally'
    )
    assert(
      provider.seenTimes.at(-1)?.currentLocalTime === '01:32' &&
        provider.seenTimes.at(-1)?.timeOfDay === 'late_night',
      'local operating-system time context did not reach the provider'
    )

    localTime = getLocalDesktopTimeContext(new Date(2026, 7, 21, 15, 10))
    const fallbackStart = countAssistantMessages(controller)
    const fallbackResult = await controller.sendMessage('返回普通文本。')

    assert(fallbackResult.accepted, 'plain-text fallback turn was rejected')
    assert(
      getNewAssistantMessages(controller, fallbackStart).map(({ content }) => content).join('|') ===
        '普通文本也能安全显示。',
      'unstructured provider output did not fall back to one segment'
    )

    const actionResult = await controller.sendMessage('跳一下。')

    assert(actionResult.accepted, 'pet-action request was rejected')
    assert(
      actionRequests.some((actions) => actions.includes('jump')),
      'semantic jump action did not survive reply planning'
    )

    const companionSnapshot = companionState.getSnapshot()

    assert(
      companionSnapshot.emotion.state === 'excited',
      'emotion integration did not receive the jump action'
    )
    assert(
      companionSnapshot.relationship.interactionCount === 8 &&
        companionSnapshot.relationship.familiarity > 0,
      'relationship growth did not remain gradual and conversation-based'
    )
    assert(memoryPreparer.callCount === 8, 'segmented replies duplicated memory preparation')

    const persistedMessages = memoryManager.getRecentConversationMessages(100)
    const visibleMessages = controller.getSnapshot().messages

    assert(
      persistedMessages.length === visibleMessages.length &&
        persistedMessages.every(
          (message, index) =>
            message.role === visibleMessages[index]?.role &&
            message.content === visibleMessages[index]?.content
        ),
      'SQLite history did not match the messages actually spoken'
    )
    assert(
      !persistedMessages.some(({ content }) => content === '在哪比的？'),
      'cancelled assistant text entered SQLite history'
    )
    assert(
      !controller.getSnapshot().isProcessing &&
        !controller.getSnapshot().isWaitingForSegment,
      'reply scheduler left a pending timer after completion'
    )

    const excitedDelay = calculateDynamicReplyDelay({
      previousText: '这场比赛听起来挺激烈的。',
      text: '你最后那场比赛是怎么赢下来的？',
      segmentIndex: 1,
      emotion: emotion('excited', 0.8)
    })
    const sleepyDelay = calculateDynamicReplyDelay({
      previousText: '这场比赛听起来挺激烈的。',
      text: '你最后那场比赛是怎么赢下来的？',
      segmentIndex: 1,
      emotion: emotion('sleepy', 0.8)
    })

    assert(excitedDelay < sleepyDelay, 'emotion did not subtly influence pacing')

    console.info('[ConversationPacingProbe] exercise passed.', {
      segmentedAchievement: true,
      segmentedPersonFollowUp: true,
      factualReplySegments: 1,
      dynamicDelaysMs: [achievementDelay, personDelay],
      interruptionCancelledSegments: 1,
      staleSegmentVisible: false,
      staleSegmentPersisted: false,
      localTimeDetected: provider.seenTimes.at(-3),
      timeUsedOnlyWhenRelevant: true,
      fallbackSingleSegment: true,
      jumpActionPreserved: true,
      localFallbackSemanticActions: true,
      unknownToolActionRejected: true,
      providerFailureControlled: true,
      emotionAndRelationshipPreserved: true,
      memoryPreparationCalls: memoryPreparer.callCount,
      timerLeak: false
    })
  } finally {
    stopListeningForActions()
    controller.dispose()
    companionState.dispose()
    memoryManager.clearConversationHistory()
    memoryManager.deleteRelationshipState()
  }
}

async function verifyLocalFallbackSemanticActions(): Promise<void> {
  const provider = new LocalReplyProvider()
  const cases = [
    ['跳一下', 'jump'],
    ['挥挥手', 'wave'],
    ['坐下', 'sit'],
    ['睡觉吧', 'sleep'],
    ['醒醒', 'wake']
  ] as const

  for (const [message, expectedAction] of cases) {
    const response = await provider.generateReply({
      characterName: 'Fallback Test Pet',
      messages: [{ role: 'user', content: message }],
      responseFormat: 'companion-reply-plan',
      petActionToolChoice: 'required'
    })

    assert(
      response.actions?.includes(expectedAction),
      `local fallback did not map "${message}" to "${expectedAction}"`
    )
  }

  const championResponse = await provider.generateReply({
    characterName: 'Fallback Test Pet',
    messages: [{ role: 'user', content: '我今天拿冠军了。' }],
    responseFormat: 'companion-reply-plan'
  })

  assert(
    championResponse.actions?.includes('happy') &&
      championResponse.actions.includes('jump'),
    'local fallback champion response did not select a natural positive action'
  )
}

function verifyUnknownToolActionRejection(): void {
  const parsed = parsePetActionToolCalls([
    {
      id: 'unknown-action-probe',
      type: 'function',
      function: {
        name: 'play_pet_action',
        arguments: JSON.stringify({ action: 'run_arbitrary_code' })
      }
    }
  ])

  assert(
    parsed.actions.length === 0 && parsed.rejected.length === 1,
    'unknown AI pet action was not rejected'
  )
}

async function verifyControlledProviderFailure(): Promise<void> {
  const provider = new DeepSeekProvider({
    apiKey: 'development-probe-key',
    baseUrl: 'https://provider.invalid',
    model: 'probe-model',
    timeoutMs: 1_000,
    fetchImplementation: async () => new Response('{}', { status: 401 })
  })

  try {
    await provider.generateReply({
      characterName: 'Failure Test Pet',
      messages: [{ role: 'user', content: 'hello' }]
    })
  } catch (error: unknown) {
    const safeMessage = getSafeAIErrorMessage(error)

    assert(
      error instanceof AIProviderError && error.code === 'authentication',
      'provider authentication failure was not classified safely'
    )
    assert(
      !safeMessage.includes('development-probe-key') && safeMessage.length > 0,
      'controlled provider failure exposed a credential or had no user-facing message'
    )
    return
  }

  throw new Error('[ConversationPacingProbe] provider failure unexpectedly succeeded')
}

async function runDeepSeekConversationPacingProbe(
  memoryManager: MemoryManager,
  deepSeekProvider: AIProvider
): Promise<void> {
  memoryManager.clearConversationHistory()
  memoryManager.deleteRelationshipState()

  const provider = new RecordingProvider(deepSeekProvider)
  const memoryPreparer = new ProbeMemoryPreparer()
  const companionState = createCompanionStateCoordinator(memoryManager)
  const replyDiagnostics: ChatProviderReplyDiagnostics[] = []
  const cancellations: ReplyPlanCancellationDiagnostics[] = []
  const actionRequests: AIPetAction[][] = []
  let localTime = getLocalDesktopTimeContext(new Date(2026, 7, 21, 15, 10))
  const controller = new ChatController({
    characterName: 'Default Pet',
    provider,
    providerInfo: {
      requestedProvider: 'deepseek',
      activeProvider: 'deepseek',
      model: 'development-probe',
      usingFallback: false
    },
    memoryManager,
    longTermMemory: memoryPreparer,
    companionState,
    getLocalTimeContext: () => localTime,
    onProviderReply: (diagnostics) => replyDiagnostics.push(diagnostics),
    onReplyPlanCancelled: (diagnostics) => cancellations.push(diagnostics)
  })
  const stopListeningForActions = controller.subscribeToPetActions((actions) => {
    actionRequests.push([...actions])
  })

  controller.openChat()

  try {
    const achievementStart = countAssistantMessages(controller)

    assert(
      (await controller.sendMessage('我今天比赛拿奖了。')).accepted,
      'DeepSeek achievement message was rejected'
    )
    assert(
      replyDiagnostics.at(-1)?.usedStructuredReplyPlan &&
        replyDiagnostics.at(-1)?.segmentCount === 2,
      'DeepSeek did not return a two-segment achievement plan'
    )
    assert(
      getNewAssistantMessages(controller, achievementStart).length === 1,
      'DeepSeek achievement segments appeared at the same time'
    )
    await waitForReplyToSettle(controller)
    const achievementMessages = getNewAssistantMessages(controller, achievementStart)

    assert(
      achievementMessages.length === 2 &&
        /[?？]/u.test(achievementMessages[1]?.content ?? '') &&
        countInformationSeekingQuestions(achievementMessages) === 1,
      'DeepSeek achievement plan did not finish with one follow-up'
    )

    const personStart = countAssistantMessages(controller)

    assert(
      (await controller.sendMessage('今天认识了一个挺有意思的人。')).accepted,
      'DeepSeek interesting-person message was rejected'
    )
    assert(
      replyDiagnostics.at(-1)?.usedStructuredReplyPlan &&
        replyDiagnostics.at(-1)?.segmentCount === 2,
      'DeepSeek did not return a two-segment interesting-person plan'
    )
    await waitForReplyToSettle(controller)
    const personMessages = getNewAssistantMessages(controller, personStart)

    assert(
      personMessages.length === 2 &&
        countInformationSeekingQuestions(personMessages) === 1,
      'DeepSeek interesting-person segments were not displayed separately'
    )

    const factualStart = countAssistantMessages(controller)

    assert(
      (await controller.sendMessage('2+2是多少？')).accepted,
      'DeepSeek factual message was rejected'
    )
    assert(
      getNewAssistantMessages(controller, factualStart).length === 1 &&
        getNewAssistantMessages(controller, factualStart)[0]?.content.includes('4'),
      'DeepSeek factual response was not one concise message'
    )
    assert(
      !/时间|下午|这个点/u.test(getNewAssistantMessages(controller, factualStart)[0]?.content ?? ''),
      'DeepSeek daytime factual response mentioned time unnecessarily'
    )

    const interruptionStart = countAssistantMessages(controller)

    assert(
      (await controller.sendMessage('我今天又在比赛里拿奖了。')).accepted,
      'DeepSeek interruption setup message was rejected'
    )
    const interruptionPlan = provider.responses.at(-1)?.replyPlan
    const normalizedInterruptionPlan = interruptionPlan
      ? normalizeReplyPlanForTurn(
          interruptionPlan,
          '我今天又在比赛里拿奖了。'
        )
      : undefined
    const pendingText = normalizedInterruptionPlan?.segments[1]?.text
    const pendingDelay = replyDiagnostics.at(-1)?.segmentDelaysMs[1] ?? 2_200

    assert(
      replyDiagnostics.at(-1)?.segmentCount === 2 &&
        getNewAssistantMessages(controller, interruptionStart).length === 1 &&
        typeof pendingText === 'string',
      'DeepSeek interruption setup did not leave one owned pending segment'
    )
    assert(
      (await controller.sendMessage('深圳。')).accepted,
      'DeepSeek follow-up did not interrupt the pending segment'
    )
    await waitForReplyToSettle(controller)
    await delay(pendingDelay + 120)
    assert(
      !controller.getSnapshot().messages.some(({ content }) => content === pendingText),
      'DeepSeek stale segment appeared after a newer user turn'
    )
    assert(
      cancellations.some(
        ({ reason, cancelledSegments }) =>
          reason === 'new-user-turn' && cancelledSegments === 1
      ),
      'DeepSeek pending segment was not cancelled by turn ownership'
    )

    localTime = getLocalDesktopTimeContext(new Date(2026, 7, 21, 1, 32))
    const lateStart = countAssistantMessages(controller)

    assert(
      (await controller.sendMessage('我还在工作。')).accepted,
      'DeepSeek late-night message was rejected'
    )
    await waitForReplyToSettle(controller)
    const lateText = getNewAssistantMessages(controller, lateStart)
      .map(({ content }) => content)
      .join(' ')

    assert(
      /这个点|这么晚|还没睡|凌晨|夜里|大半夜/u.test(lateText),
      `DeepSeek did not use late-night time context naturally: ${lateText}`
    )
    assert(!/01:32|1:32/u.test(lateText), 'DeepSeek recited the exact clock time unnecessarily')

    localTime = getLocalDesktopTimeContext(new Date(2026, 7, 21, 15, 10))

    assert(
      (await controller.sendMessage('跳一下。')).accepted,
      'DeepSeek semantic action message was rejected'
    )
    assert(
      actionRequests.some((actions) => actions.includes('jump')),
      'DeepSeek jump tool action did not survive reply planning'
    )
    assert(
      companionState.getSnapshot().emotion.state === 'excited' &&
        companionState.getSnapshot().relationship.interactionCount === 7,
      'DeepSeek pacing regressed emotion or relationship integration'
    )
    assert(memoryPreparer.callCount === 7, 'DeepSeek segmentation duplicated memory preparation')

    const persistedMessages = memoryManager.getRecentConversationMessages(100)

    assert(
      !persistedMessages.some(({ content }) => content === pendingText),
      'DeepSeek cancelled segment entered SQLite history'
    )
    assert(
      persistedMessages.length === controller.getSnapshot().messages.length,
      'DeepSeek visible and persisted conversation histories diverged'
    )
    assert(
      !controller.getSnapshot().isProcessing &&
        !controller.getSnapshot().isWaitingForSegment,
      'DeepSeek pacing left a pending timer'
    )

    console.info('[ConversationPacingProbe] deepseek passed.', {
      provider: provider.id,
      achievementSegments: 2,
      interestingPersonSegments: 2,
      factualSegments: 1,
      interruptionCancelledSegments: 1,
      staleSegmentVisible: false,
      staleSegmentPersisted: false,
      lateNightContextUsedNaturally: true,
      exactClockTimeRecited: false,
      jumpActionPreserved: true,
      emotionAndRelationshipPreserved: true,
      memoryPreparationCalls: memoryPreparer.callCount,
      timerLeak: false
    })
  } finally {
    stopListeningForActions()
    controller.dispose()
    companionState.dispose()
    memoryManager.clearConversationHistory()
    memoryManager.deleteRelationshipState()
  }
}

class RecordingProvider implements AIProvider {
  readonly id: AIProvider['id']
  readonly responses: AIChatResponse[] = []

  constructor(private readonly delegate: AIProvider) {
    this.id = delegate.id
  }

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    const response = await this.delegate.generateReply(request)

    this.responses.push(response)
    return response
  }
}

class ProbeMemoryPreparer {
  callCount = 0

  async prepare(): Promise<PreparedMemoryContext> {
    this.callCount += 1

    return {
      context: { longTermMemoryEnabled: true, profile: [], memories: [] },
      diagnostics: EMPTY_MEMORY_DIAGNOSTICS
    }
  }
}

class ScriptedPacingProvider implements AIProvider {
  readonly id = 'local' as const
  readonly seenTimes: LocalDesktopTimeContext[] = []

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    const time = readLocalTime(request)

    if (time) {
      this.seenTimes.push(time)
    }

    const message = request.messages.filter(({ role }) => role === 'user').at(-1)?.content ?? ''

    if (message === '我今天比赛拿奖了。') {
      return planned(['真的假的？你还真拿下了 😂', '最后第几名？'], ['happy'])
    }

    if (message === '今天认识了一个挺有意思的人。') {
      return planned(['听着就有故事。', '这人有意思在哪儿？'])
    }

    if (message === '2+2是多少？') {
      return planned(['4。', '这一句不应该显示。'])
    }

    if (message === '中断测试：我也拿奖了。') {
      return planned(['你真拿奖了？', '在哪比的？'])
    }

    if (message === '深圳。') {
      return planned(['深圳那场啊。'])
    }

    if (message === '我还在工作。') {
      return planned([time?.timeOfDay === 'late_night' ? '这个点还在忙？' : '还在忙啊？'])
    }

    if (message === '返回普通文本。') {
      return { text: '普通文本也能安全显示。' }
    }

    if (message === '跳一下。') {
      return planned(['好，跳一下。'], ['jump'])
    }

    return planned(['我听着。'])
  }
}

function planned(
  segmentTexts: readonly string[],
  actions: readonly AIPetAction[] = []
): AIChatResponse {
  const replyPlan = createUnpacedReplyPlan(segmentTexts)

  return {
    text: formatCompanionReplyPlanText(replyPlan),
    replyPlan,
    ...(actions.length > 0 ? { actions } : {})
  }
}

function readLocalTime(request: AIChatRequest): LocalDesktopTimeContext | undefined {
  const message = request.messages.find(
    ({ role, content }) => role === 'system' && content.includes('## Local desktop time')
  )
  const json = message?.content.split('\n').at(-1)

  if (!json) {
    return undefined
  }

  try {
    return JSON.parse(json) as LocalDesktopTimeContext
  } catch {
    return undefined
  }
}

function countAssistantMessages(controller: ChatController): number {
  return controller.getSnapshot().messages.filter(({ role }) => role === 'assistant').length
}

function getNewAssistantMessages(
  controller: ChatController,
  previousCount: number
): ChatMessage[] {
  return controller
    .getSnapshot()
    .messages.filter(({ role }) => role === 'assistant')
    .slice(previousCount)
}

function getLastAssistantMessage(controller: ChatController): ChatMessage {
  const message = controller
    .getSnapshot()
    .messages.filter(({ role }) => role === 'assistant')
    .at(-1)

  assert(message, 'assistant message was missing')
  return message
}

function countInformationSeekingQuestions(messages: readonly ChatMessage[]): number {
  return messages.filter(
    ({ content }) =>
      /[?？]/u.test(content) &&
      /(什么|哪个|哪儿|哪里|怎么|为何|为什么|谁|多少|几名|第几|何时|吗)/u.test(
        content
      )
  ).length
}

async function waitForReplyToSettle(controller: ChatController): Promise<void> {
  const deadline = Date.now() + 5_000

  while (controller.getSnapshot().isProcessing && Date.now() < deadline) {
    await delay(20)
  }

  assert(!controller.getSnapshot().isProcessing, 'reply did not settle before the probe deadline')
}

function emotion(
  state: EmotionSnapshot['state'],
  intensity: number
): Pick<EmotionSnapshot, 'state' | 'intensity'> {
  return { state, intensity }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[ConversationPacingProbe] ${message}`)
  }
}

const EMPTY_MEMORY_DIAGNOSTICS: LongTermMemoryDiagnostics = {
  candidateCount: 0,
  acceptedCategories: [],
  rejectedCandidateCount: 0,
  rejectedReasons: [],
  profileValuesWritten: 0,
  memoriesCreated: 0,
  memoriesDeduplicated: 0,
  retrievedProfileCount: 0,
  retrievedMemoryCount: 0,
  unexpectedExtractorActionRequests: 0,
  extractionFailed: false
}
