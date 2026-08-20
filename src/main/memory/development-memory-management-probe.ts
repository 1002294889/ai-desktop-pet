import type { AIChatRequest, AIChatResponse, AIProvider } from '../ai/ai-provider'
import { createLongTermMemoryCoordinator } from './LongTermMemoryCoordinator'
import type { MemoryManager } from './MemoryManager'
import { MemoryService } from './MemoryService'

const PROBE_MODES = [
  'seed',
  'edit-disable',
  'verify-reenable-isolation',
  'verify-clear-controls',
  'cleanup'
] as const

type MemoryManagementProbeMode = (typeof PROBE_MODES)[number]

const TEST_EVENT = '用户计划参加羽毛球比赛'
const TEST_PREFERENCE = '用户喜欢吃火锅'
const UPDATED_PREFERENCE = '用户喜欢吃麻辣火锅'
const RESUMED_PREFERENCE = '用户喜欢吃拉面'

export function getMemoryManagementProbeMode(): MemoryManagementProbeMode | undefined {
  const value = process.env.DESKTOP_PET_MEMORY_MANAGEMENT_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as MemoryManagementProbeMode)) {
    throw new Error(
      'DESKTOP_PET_MEMORY_MANAGEMENT_PROBE_MODE must be seed, edit-disable, verify-reenable-isolation, verify-clear-controls, or cleanup.'
    )
  }

  return value as MemoryManagementProbeMode
}

export async function runMemoryManagementProbe(
  mode: MemoryManagementProbeMode,
  memoryManager: MemoryManager
): Promise<void> {
  switch (mode) {
    case 'seed':
      seed(memoryManager)
      return
    case 'edit-disable':
      await editAndDisable(memoryManager)
      return
    case 'verify-reenable-isolation':
      await verifyReenableAndIsolation(memoryManager)
      return
    case 'verify-clear-controls':
      verifyClearControls(memoryManager)
      return
    case 'cleanup':
      memoryManager.clearAllMemory()
      memoryManager.setLongTermMemoryEnabled(true)
      logProbe(mode, { isolatedDataCleared: true, memoryEnabled: true })
  }
}

function seed(memoryManager: MemoryManager): void {
  memoryManager.clearAllMemory()
  memoryManager.setLongTermMemoryEnabled(true)
  memoryManager.setProfileValue('preferred_name', '阿达')
  memoryManager.setProfileValue('age', '28')
  memoryManager.setProfileValue('occupation', '跨境电商')
  memoryManager.addMemory({ type: 'event', content: TEST_EVENT, importance: 0.82 })
  memoryManager.addMemory({ type: 'preference', content: TEST_PREFERENCE, importance: 0.74 })
  memoryManager.addConversationMessage({ role: 'user', content: '最近工作很忙。' })
  memoryManager.addConversationMessage({ role: 'assistant', content: '辛苦啦，记得休息。' })

  assert(memoryManager.getProfile().length === 3, 'profile seed failed')
  assert(memoryManager.countMemories() === 2, 'memory seed failed')
  assert(memoryManager.countConversationMessages() === 2, 'conversation seed failed')
  logProbe('seed', {
    profileEntries: 3,
    memories: 2,
    conversationMessages: 2,
    memoryEnabled: true
  })
}

async function editAndDisable(memoryManager: MemoryManager): Promise<void> {
  assert(memoryManager.getProfileValue('age')?.value === '28', 'seeded profile did not persist')
  assert(memoryManager.countMemories() === 2, 'seeded memories did not persist')
  assert(memoryManager.countConversationMessages() === 2, 'seeded conversation did not persist')

  const provider = new MemoryExtractionProbeProvider()
  const coordinator = createLongTermMemoryCoordinator(provider, memoryManager)
  const service = new MemoryService(memoryManager, coordinator)
  const event = memoryManager
    .listMemories({ type: 'event', limit: 100 })
    .find(({ content }) => content === TEST_EVENT)
  const preference = memoryManager
    .listMemories({ type: 'preference', limit: 100 })
    .find(({ content }) => content === TEST_PREFERENCE)

  assert(event, 'seeded event is missing')
  assert(preference, 'seeded preference is missing')
  service.updateProfile({ key: 'age', value: '29' })
  const updatedMemory = service.updateMemory({ id: preference.id, content: UPDATED_PREFERENCE })
  assert(updatedMemory?.content === UPDATED_PREFERENCE, 'memory edit failed')
  assert(service.deleteMemory(event.id), 'individual memory deletion failed')
  service.setLongTermMemoryEnabled(false)

  const beforeDisabledMessages = memoryManager.countMemories()
  const memorableMessages = ['我喜欢吃拉面。', '我每周跑步三次。', '我下个月要去旅行。']

  for (const currentMessage of memorableMessages) {
    const prepared = await coordinator.prepare({ currentMessage, recentMessages: [] })

    assert(!prepared.context.longTermMemoryEnabled, 'disabled context was marked enabled')
    assert(prepared.context.profile.length === 0, 'disabled memory exposed profile context')
    assert(prepared.context.memories.length === 0, 'disabled memory exposed saved context')
  }

  assert(provider.callCount === 0, 'MemoryExtractor ran while memory was disabled')
  assert(
    memoryManager.countMemories() === beforeDisabledMessages,
    'disabled messages created long-term memories'
  )
  logProbe('edit-disable', {
    editedProfileAge: 29,
    editedMemory: true,
    deletedIndividualMemory: true,
    memoryEnabled: false,
    disabledMessagesTested: memorableMessages.length,
    extractorCallsWhileDisabled: provider.callCount
  })
}

async function verifyReenableAndIsolation(memoryManager: MemoryManager): Promise<void> {
  assert(memoryManager.getProfileValue('age')?.value === '29', 'profile edit did not persist')
  assert(
    !memoryManager.listMemories({ type: 'event', limit: 100 }).some(({ content }) => content === TEST_EVENT),
    'deleted memory returned after restart'
  )
  assert(
    memoryManager
      .listMemories({ type: 'preference', limit: 100 })
      .some(({ content }) => content === UPDATED_PREFERENCE),
    'memory edit did not persist'
  )
  assert(!memoryManager.getLongTermMemoryEnabled(), 'disabled setting did not persist')

  const provider = new MemoryExtractionProbeProvider()
  const coordinator = createLongTermMemoryCoordinator(provider, memoryManager)
  const service = new MemoryService(memoryManager, coordinator)
  await coordinator.prepare({ currentMessage: '记住我叫小明。', recentMessages: [] })

  assert(provider.callCount === 0, 'explicit remember request bypassed the disabled setting')
  assert(memoryManager.getProfileValue('preferred_name')?.value === '阿达', 'disabled explicit request was stored')

  service.setLongTermMemoryEnabled(true)
  const resumed = await coordinator.prepare({ currentMessage: '我喜欢吃拉面。', recentMessages: [] })

  assert(resumed.diagnostics.memoriesCreated === 1, 'memory extraction did not resume')
  assert(Number(provider.callCount) === 1, 're-enabled extraction did not call the provider exactly once')
  assert(
    memoryManager
      .listMemories({ type: 'preference', limit: 100 })
      .some(({ content }) => content === RESUMED_PREFERENCE),
    're-enabled extraction did not store the candidate'
  )

  const longTermCountBeforeConversationClear = memoryManager.countMemories()
  const profileCountBeforeConversationClear = memoryManager.getProfile().length
  const conversationClear = service.clearConversationHistory()

  assert(conversationClear.conversationMessagesDeleted === 2, 'conversation clear count was wrong')
  assert(memoryManager.countConversationMessages() === 0, 'conversation history was not cleared')
  assert(
    memoryManager.countMemories() === longTermCountBeforeConversationClear &&
      memoryManager.getProfile().length === profileCountBeforeConversationClear,
    'clearing conversation history changed long-term memory'
  )

  memoryManager.addConversationMessage({ role: 'user', content: 'Keep this conversation row.' })
  const updatedPreference = memoryManager
    .listMemories({ type: 'preference', limit: 100 })
    .find(({ content }) => content === UPDATED_PREFERENCE)

  assert(updatedPreference, 'updated preference was missing before individual delete')
  assert(service.deleteMemory(updatedPreference.id), 'individual long-term memory delete failed')
  assert(
    memoryManager.countConversationMessages() === 1,
    'individual long-term memory delete changed conversation history'
  )
  logProbe('verify-reenable-isolation', {
    editedProfilePersisted: true,
    deletedMemoryPersisted: true,
    memoryEditPersisted: true,
    disabledSettingPersisted: true,
    explicitRequestBlockedWhileDisabled: true,
    extractionResumed: true,
    conversationClearKeptLongTermMemory: true,
    individualMemoryDeleteKeptConversation: true
  })
}

function verifyClearControls(memoryManager: MemoryManager): void {
  assert(memoryManager.getLongTermMemoryEnabled(), 're-enabled setting did not persist')
  assert(memoryManager.getProfileValue('age')?.value === '29', 'profile edit was lost')
  assert(
    !memoryManager
      .listMemories({ type: 'preference', limit: 100 })
      .some(({ content }) => content === UPDATED_PREFERENCE),
    'individually deleted memory returned after restart'
  )
  assert(memoryManager.countConversationMessages() === 1, 'conversation isolation did not persist')

  const coordinator = createLongTermMemoryCoordinator(
    new MemoryExtractionProbeProvider(),
    memoryManager
  )
  const service = new MemoryService(memoryManager, coordinator)
  const longTermClear = service.clearLongTermMemory()

  assert(longTermClear.profileEntriesDeleted === 3, 'long-term clear profile count was wrong')
  assert(longTermClear.memoriesDeleted === 1, 'long-term clear memory count was wrong')
  assert(memoryManager.getProfile().length === 0, 'long-term clear left profile information')
  assert(memoryManager.countMemories() === 0, 'long-term clear left memories')
  assert(memoryManager.countConversationMessages() === 1, 'long-term clear changed conversation history')

  memoryManager.setProfileValue('preferred_name', 'Clear All Test')
  memoryManager.addMemory({ type: 'other', content: 'Clear all test memory', importance: 0.9 })
  const clearAll = service.clearAllMemory()

  assert(clearAll.profileEntriesDeleted === 1, 'clear all profile count was wrong')
  assert(clearAll.memoriesDeleted === 1, 'clear all memory count was wrong')
  assert(clearAll.conversationMessagesDeleted === 1, 'clear all conversation count was wrong')
  assert(memoryManager.getProfile().length === 0, 'clear all left profile information')
  assert(memoryManager.countMemories() === 0, 'clear all left memories')
  assert(memoryManager.countConversationMessages() === 0, 'clear all left conversation history')
  logProbe('verify-clear-controls', {
    individualDeletePersisted: true,
    longTermClearKeptConversation: true,
    clearAllSeparatedAndComplete: true,
    memoryEnabledSettingPreserved: true
  })
}

class MemoryExtractionProbeProvider implements AIProvider {
  readonly id = 'local' as const
  callCount = 0

  async generateReply(request: AIChatRequest): Promise<AIChatResponse> {
    this.callCount += 1
    const payload = readExtractionPayload(request)
    const isExplicitName = payload.currentMessage.includes('小明')
    const candidate = isExplicitName
      ? {
          shouldRemember: true,
          category: 'profile',
          key: 'preferred_name',
          value: '小明',
          confidence: 0.99,
          importance: 0.9,
          explicitRequest: true,
          sensitivity: 'none',
          sourceQuote: payload.currentMessage
        }
      : {
          shouldRemember: true,
          category: 'preference',
          content: RESUMED_PREFERENCE,
          confidence: 0.99,
          importance: 0.8,
          explicitRequest: false,
          sensitivity: 'none',
          sourceQuote: payload.currentMessage
        }

    return { text: JSON.stringify({ candidates: [candidate] }) }
  }
}

function readExtractionPayload(request: AIChatRequest): { currentMessage: string } {
  const content = request.messages.at(-1)?.content
  const parsed: unknown = content ? JSON.parse(content) : undefined

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { currentMessage?: unknown }).currentMessage !== 'string'
  ) {
    throw new Error('[MemoryManagementProbe] Invalid extraction request payload.')
  }

  return { currentMessage: (parsed as { currentMessage: string }).currentMessage }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[MemoryManagementProbe] ${message}`)
  }
}

function logProbe(mode: MemoryManagementProbeMode, result: Record<string, unknown>): void {
  console.info(`[MemoryManagementProbe] ${mode} passed.`, result)
}
