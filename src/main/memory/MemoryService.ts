import type {
  ClearMemoryResult,
  ManagedMemory,
  ManagedProfileEntry,
  MemoryOverview,
  MemoryOverviewQuery,
  MemorySettings,
  UpdateManagedMemoryInput,
  UpdateManagedProfileInput
} from '../../shared/memory-management'
import type { LongTermMemoryCoordinator } from './LongTermMemoryCoordinator'
import type { CompanionStateCoordinator } from '../companion/CompanionStateCoordinator'
import type { MemoryManager } from './MemoryManager'
import { MemoryManagerError } from './memory-manager-error'
import type { MemoryRecord, UserProfileEntry } from './memory-types'

const MEMORY_SCAN_LIMIT = 500
const MEMORY_DISPLAY_LIMIT = 200
const MAX_SEARCH_LENGTH = 200

export class MemoryService {
  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly longTermMemory: LongTermMemoryCoordinator,
    private readonly companionState?: CompanionStateCoordinator
  ) {
    longTermMemory.setEnabled(memoryManager.getLongTermMemoryEnabled())
  }

  getOverview(query: MemoryOverviewQuery): MemoryOverview {
    const search = normalizeSearch(query.search)
    const allProfile = this.memoryManager.getProfile()
    const scannedMemories = this.memoryManager.listMemories({ limit: MEMORY_SCAN_LIMIT })
    const profile =
      query.category === 'all' || query.category === 'profile'
        ? allProfile.filter((entry) => matchesProfileSearch(entry, search)).map(toManagedProfile)
        : []
    const matchingMemories =
      query.category === 'profile'
        ? []
        : scannedMemories.filter(
            (memory) =>
              (query.category === 'all' || memory.type === query.category) &&
              matchesMemorySearch(memory, search)
          )
    const memoryCount = this.memoryManager.countMemories()

    return {
      profile,
      memories: matchingMemories.slice(0, MEMORY_DISPLAY_LIMIT).map(toManagedMemory),
      profileEntryCount: allProfile.length,
      memoryCount,
      conversationMessageCount: this.memoryManager.countConversationMessages(),
      hasMoreMemories:
        matchingMemories.length > MEMORY_DISPLAY_LIMIT || memoryCount > scannedMemories.length,
      settings: this.getSettings()
    }
  }

  updateProfile(input: UpdateManagedProfileInput): ManagedProfileEntry {
    if (!this.memoryManager.getProfileValue(input.key)) {
      throw new MemoryManagerError('invalid-input')
    }

    return toManagedProfile(this.memoryManager.setProfileValue(input.key, input.value))
  }

  deleteProfile(key: string): boolean {
    const deleted = this.memoryManager.deleteProfileValue(key)

    if (!deleted) {
      throw new MemoryManagerError('invalid-input')
    }

    return true
  }

  updateMemory(input: UpdateManagedMemoryInput): ManagedMemory {
    const memory = this.memoryManager.updateMemory(input.id, { content: input.content })

    if (!memory) {
      throw new MemoryManagerError('invalid-input')
    }

    return toManagedMemory(memory)
  }

  deleteMemory(id: number): boolean {
    const deleted = this.memoryManager.deleteMemory(id)

    if (!deleted) {
      throw new MemoryManagerError('invalid-input')
    }

    return true
  }

  getSettings(): MemorySettings {
    return {
      longTermMemoryEnabled: this.memoryManager.getLongTermMemoryEnabled()
    }
  }

  setLongTermMemoryEnabled(enabled: boolean): MemorySettings {
    const persistedValue = this.memoryManager.setLongTermMemoryEnabled(enabled)

    this.longTermMemory.setEnabled(persistedValue)

    return { longTermMemoryEnabled: persistedValue }
  }

  clearConversationHistory(): ClearMemoryResult {
    return {
      profileEntriesDeleted: 0,
      memoriesDeleted: 0,
      conversationMessagesDeleted: this.memoryManager.clearConversationHistory()
    }
  }

  clearLongTermMemory(): ClearMemoryResult {
    return this.memoryManager.clearLongTermMemory()
  }

  clearAllMemory(): ClearMemoryResult {
    const result = this.memoryManager.clearAllMemory()

    this.companionState?.resetRelationship()
    this.companionState?.resetEmotion()

    return result
  }
}

function toManagedProfile(entry: UserProfileEntry): ManagedProfileEntry {
  return {
    key: entry.key,
    value: entry.value,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }
}

function toManagedMemory(memory: MemoryRecord): ManagedMemory {
  return {
    id: memory.id,
    category: memory.type,
    content: memory.content,
    importance: memory.importance,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt
  }
}

function normalizeSearch(value: string): string {
  if (value.length > MAX_SEARCH_LENGTH) {
    throw new MemoryManagerError('invalid-input')
  }

  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

function matchesProfileSearch(entry: UserProfileEntry, search: string): boolean {
  if (!search) {
    return true
  }

  return normalizeComparable(`${entry.key} ${entry.value}`).includes(search)
}

function matchesMemorySearch(memory: MemoryRecord, search: string): boolean {
  if (!search) {
    return true
  }

  return normalizeComparable(`${memory.type} ${memory.content}`).includes(search)
}

function normalizeComparable(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}
