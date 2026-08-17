import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { App } from 'electron'

import type { MemoryManager } from './MemoryManager'

const TEST_MODES = ['write', 'verify', 'cleanup'] as const
type DevelopmentMemoryTestMode = (typeof TEST_MODES)[number]

const TEST_PROFILE_KEY = 'preferred_name'
const TEST_PROFILE_VALUE = 'Test User'
const TEST_MEMORY_CONTENT = 'Development persistence test memory'
const TEST_CONVERSATION_MESSAGES = [
  { role: 'user' as const, content: 'Development persistence test question' },
  { role: 'assistant' as const, content: 'Development persistence test response' }
] as const

export function configureDevelopmentMemoryTest(
  electronApp: App
): DevelopmentMemoryTestMode | undefined {
  if (electronApp.isPackaged) {
    return undefined
  }

  const value = process.env.DESKTOP_PET_MEMORY_TEST_MODE

  if (value === undefined) {
    return undefined
  }

  if (!TEST_MODES.includes(value as DevelopmentMemoryTestMode)) {
    throw new Error('DESKTOP_PET_MEMORY_TEST_MODE must be write, verify, or cleanup.')
  }

  const testUserDataDirectory = join(
    electronApp.getPath('temp'),
    'ai-desktop-pet-memory-test-user-data'
  )

  mkdirSync(testUserDataDirectory, { recursive: true })
  electronApp.setPath('userData', testUserDataDirectory)

  return value as DevelopmentMemoryTestMode
}

export function runDevelopmentMemoryProbe(
  memoryManager: MemoryManager,
  mode: DevelopmentMemoryTestMode
): void {
  switch (mode) {
    case 'write':
      writeTestData(memoryManager)
      return
    case 'verify':
      verifyAndRemoveTestData(memoryManager)
      return
    case 'cleanup':
      removeTestData(memoryManager)
  }
}

function writeTestData(memoryManager: MemoryManager): void {
  removeTestData(memoryManager)

  const profile = memoryManager.setProfileValue(TEST_PROFILE_KEY, TEST_PROFILE_VALUE)
  const memory = memoryManager.addMemory({
    type: 'event',
    content: TEST_MEMORY_CONTENT,
    importance: 0.6
  })

  for (const message of TEST_CONVERSATION_MESSAGES) {
    memoryManager.addConversationMessage(message)
  }

  console.info('[MemoryDevelopmentProbe] Persistence test data written.', {
    profileWritten: profile.value === TEST_PROFILE_VALUE,
    memoryId: memory.id,
    conversationMessagesWritten: TEST_CONVERSATION_MESSAGES.length
  })
}

function verifyAndRemoveTestData(memoryManager: MemoryManager): void {
  const profile = memoryManager.getProfileValue(TEST_PROFILE_KEY)
  const storedMemory = memoryManager
    .listMemories({ type: 'event', limit: 100 })
    .find(({ content }) => content === TEST_MEMORY_CONTENT)
  const retrievedMemory = storedMemory ? memoryManager.getMemory(storedMemory.id) : null
  const updatedMemory = retrievedMemory
    ? memoryManager.updateMemory(retrievedMemory.id, { importance: 0.75 })
    : null
  const conversations = memoryManager.getRecentConversationMessages(10)
  const conversationPersisted = TEST_CONVERSATION_MESSAGES.every((expected, index) => {
    const actual = conversations.at(-TEST_CONVERSATION_MESSAGES.length + index)

    return actual?.role === expected.role && actual.content === expected.content
  })

  if (
    profile?.value !== TEST_PROFILE_VALUE ||
    !retrievedMemory ||
    updatedMemory?.importance !== 0.75 ||
    !conversationPersisted
  ) {
    throw new Error('The local memory persistence verification failed.')
  }

  const memoryDeleted = memoryManager.deleteMemory(retrievedMemory.id)
  const deletedMemoryMissing = memoryManager.getMemory(retrievedMemory.id) === null

  if (!memoryDeleted || !deletedMemoryMissing) {
    throw new Error('The local memory deletion verification failed.')
  }

  memoryManager.clearConversationHistory()
  memoryManager.deleteProfileValue(TEST_PROFILE_KEY)

  console.info('[MemoryDevelopmentProbe] Persistence test verified after restart.', {
    profilePersisted: true,
    memoryRetrieved: true,
    memoryUpdated: true,
    memoryDeleted: true,
    conversationMessagesPersisted: TEST_CONVERSATION_MESSAGES.length
  })
}

function removeTestData(memoryManager: MemoryManager): void {
  memoryManager.clearMemories()
  memoryManager.clearConversationHistory()

  const profile = memoryManager.getProfileValue(TEST_PROFILE_KEY)

  if (profile?.value === TEST_PROFILE_VALUE) {
    memoryManager.deleteProfileValue(TEST_PROFILE_KEY)
  }

  console.info('[MemoryDevelopmentProbe] Isolated persistence test data cleared.')
}
