import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import { CHAT_ROLES, type ChatRole } from '../../shared/chat'
import { MemoryManagerError } from './memory-manager-error'
import { applyMemoryMigrations } from './memory-migrations'
import {
  MEMORY_TYPES,
  type AddConversationMessageInput,
  type AddMemoryInput,
  type ConversationRecord,
  type ListMemoriesOptions,
  type MemoryRecord,
  type MemoryType,
  type UpdateMemoryInput,
  type UserProfileEntry
} from './memory-types'

interface MemoryManagerOptions {
  databasePath: string
}

interface ProfileRow {
  id: unknown
  key: unknown
  value: unknown
  created_at: unknown
  updated_at: unknown
}

interface MemoryRow {
  id: unknown
  type: unknown
  content: unknown
  importance: unknown
  created_at: unknown
  updated_at: unknown
  last_accessed_at: unknown
}

interface ConversationRow {
  id: unknown
  role: unknown
  content: unknown
  created_at: unknown
}

interface CountRow {
  count: unknown
}

export interface ClearMemoryCounts {
  profileEntriesDeleted: number
  memoriesDeleted: number
  conversationMessagesDeleted: number
}

const DEFAULT_MEMORY_IMPORTANCE = 0.5
const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 500
const MAX_PROFILE_KEY_LENGTH = 120
const MAX_PROFILE_VALUE_LENGTH = 20_000
const MAX_MEMORY_CONTENT_LENGTH = 50_000
const MAX_CONVERSATION_CONTENT_LENGTH = 20_000
const LONG_TERM_MEMORY_ENABLED_SETTING = 'long_term_memory_enabled'

export class MemoryManager {
  private database: DatabaseSync | undefined

  constructor(private readonly options: MemoryManagerOptions) {}

  initialize(): void {
    if (this.database) {
      return
    }

    let database: DatabaseSync | undefined

    try {
      mkdirSync(dirname(this.options.databasePath), { recursive: true })
      database = new DatabaseSync(this.options.databasePath, {
        allowExtension: false,
        defensive: true,
        enableForeignKeyConstraints: true,
        timeout: 5_000
      })
      database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
      `)
      applyMemoryMigrations(database)
      this.database = database
    } catch (error: unknown) {
      try {
        database?.close()
      } catch {
        // The initialization error remains the most useful failure to report.
      }

      if (error instanceof MemoryManagerError && error.code === 'unsupported-schema') {
        throw error
      }

      throw new MemoryManagerError('initialization-failed', { cause: error })
    }
  }

  close(): void {
    const database = this.database

    if (!database) {
      return
    }

    this.database = undefined

    try {
      database.close()
    } catch (error: unknown) {
      throw new MemoryManagerError('close-failed', { cause: error })
    }
  }

  setProfileValue(key: string, value: string): UserProfileEntry {
    const normalizedKey = normalizeRequiredText(key, MAX_PROFILE_KEY_LENGTH)
    const normalizedValue = normalizeText(value, MAX_PROFILE_VALUE_LENGTH)

    return this.executeWrite((database) => {
      const now = Date.now()

      database
        .prepare(`
          INSERT INTO user_profile (key, value, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `)
        .run(normalizedKey, normalizedValue, now, now)

      return requireProfileEntry(this.readProfileValue(database, normalizedKey))
    })
  }

  getProfileValue(key: string): UserProfileEntry | null {
    const normalizedKey = normalizeRequiredText(key, MAX_PROFILE_KEY_LENGTH)

    return this.executeRead((database) => this.readProfileValue(database, normalizedKey))
  }

  getProfile(): UserProfileEntry[] {
    return this.executeRead((database) => {
      const rows = database
        .prepare(`
          SELECT id, key, value, created_at, updated_at
          FROM user_profile
          ORDER BY key ASC
        `)
        .all()

      return rows.map((row) => mapProfileRow(row))
    })
  }

  deleteProfileValue(key: string): boolean {
    const normalizedKey = normalizeRequiredText(key, MAX_PROFILE_KEY_LENGTH)

    return this.executeWrite((database) => {
      const result = database
        .prepare('DELETE FROM user_profile WHERE key = ?')
        .run(normalizedKey)

      return toSafeInteger(result.changes) > 0
    })
  }

  addMemory(input: AddMemoryInput): MemoryRecord {
    const type = requireMemoryType(input.type)
    const content = normalizeRequiredText(input.content, MAX_MEMORY_CONTENT_LENGTH)
    const importance = normalizeImportance(input.importance ?? DEFAULT_MEMORY_IMPORTANCE)

    return this.executeWrite((database) => {
      const now = Date.now()
      const result = database
        .prepare(`
          INSERT INTO memories (
            type,
            content,
            importance,
            created_at,
            updated_at,
            last_accessed_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(type, content, importance, now, now, now)
      const id = toSafeInteger(result.lastInsertRowid)

      return requireMemoryRecord(this.readMemory(database, id))
    })
  }

  getMemory(id: number): MemoryRecord | null {
    const normalizedId = normalizeId(id)

    return this.executeWrite((database) => {
      const result = database
        .prepare('UPDATE memories SET last_accessed_at = ? WHERE id = ?')
        .run(Date.now(), normalizedId)

      return toSafeInteger(result.changes) === 0
        ? null
        : this.readMemory(database, normalizedId)
    })
  }

  listMemories(options: ListMemoriesOptions = {}): MemoryRecord[] {
    const limit = normalizeLimit(options.limit)
    const type = options.type === undefined ? undefined : requireMemoryType(options.type)

    return this.executeRead((database) => {
      const rows = type
        ? database
            .prepare(`
              SELECT id, type, content, importance, created_at, updated_at, last_accessed_at
              FROM memories
              WHERE type = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `)
            .all(type, limit)
        : database
            .prepare(`
              SELECT id, type, content, importance, created_at, updated_at, last_accessed_at
              FROM memories
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            `)
            .all(limit)

      return rows.map((row) => mapMemoryRow(row))
    })
  }

  countMemories(type?: MemoryType): number {
    const normalizedType = type === undefined ? undefined : requireMemoryType(type)

    return this.executeRead((database) => {
      const row = normalizedType
        ? database
            .prepare('SELECT COUNT(*) AS count FROM memories WHERE type = ?')
            .get(normalizedType)
        : database.prepare('SELECT COUNT(*) AS count FROM memories').get()

      return requireCount(row)
    })
  }

  updateMemory(id: number, input: UpdateMemoryInput): MemoryRecord | null {
    const normalizedId = normalizeId(id)

    if (input.type === undefined && input.content === undefined && input.importance === undefined) {
      throw new MemoryManagerError('invalid-input')
    }

    return this.executeWrite((database) => {
      const existing = this.readMemory(database, normalizedId)

      if (!existing) {
        return null
      }

      const type = input.type === undefined ? existing.type : requireMemoryType(input.type)
      const content =
        input.content === undefined
          ? existing.content
          : normalizeRequiredText(input.content, MAX_MEMORY_CONTENT_LENGTH)
      const importance =
        input.importance === undefined
          ? existing.importance
          : normalizeImportance(input.importance)

      database
        .prepare(`
          UPDATE memories
          SET type = ?, content = ?, importance = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(type, content, importance, Date.now(), normalizedId)

      return requireMemoryRecord(this.readMemory(database, normalizedId))
    })
  }

  deleteMemory(id: number): boolean {
    const normalizedId = normalizeId(id)

    return this.executeWrite((database) => {
      const result = database.prepare('DELETE FROM memories WHERE id = ?').run(normalizedId)

      return toSafeInteger(result.changes) > 0
    })
  }

  clearMemories(): number {
    return this.executeWrite((database) => {
      const result = database.prepare('DELETE FROM memories').run()

      return toSafeInteger(result.changes)
    })
  }

  clearProfile(): number {
    return this.executeWrite((database) => {
      const result = database.prepare('DELETE FROM user_profile').run()

      return toSafeInteger(result.changes)
    })
  }

  clearLongTermMemory(): ClearMemoryCounts {
    return this.executeWrite((database) => {
      database.exec('BEGIN IMMEDIATE')

      try {
        const profileEntriesDeleted = toSafeInteger(
          database.prepare('DELETE FROM user_profile').run().changes
        )
        const memoriesDeleted = toSafeInteger(
          database.prepare('DELETE FROM memories').run().changes
        )

        database.exec('COMMIT')

        return {
          profileEntriesDeleted,
          memoriesDeleted,
          conversationMessagesDeleted: 0
        }
      } catch (error: unknown) {
        rollbackQuietly(database)
        throw error
      }
    })
  }

  addConversationMessage(input: AddConversationMessageInput): ConversationRecord {
    const role = requireChatRole(input.role)
    const content = normalizeRequiredText(input.content, MAX_CONVERSATION_CONTENT_LENGTH)
    const createdAt = normalizeTimestamp(input.createdAt ?? Date.now())

    return this.executeWrite((database) => {
      const result = database
        .prepare(`
          INSERT INTO conversations (role, content, created_at)
          VALUES (?, ?, ?)
        `)
        .run(role, content, createdAt)
      const id = toSafeInteger(result.lastInsertRowid)

      return requireConversationRecord(this.readConversation(database, id))
    })
  }

  getRecentConversationMessages(limit = 40): ConversationRecord[] {
    const normalizedLimit = normalizeLimit(limit)

    return this.executeRead((database) => {
      const rows = database
        .prepare(`
          SELECT id, role, content, created_at
          FROM conversations
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `)
        .all(normalizedLimit)

      return rows.map((row) => mapConversationRow(row)).reverse()
    })
  }

  clearConversationHistory(): number {
    return this.executeWrite((database) => {
      const result = database.prepare('DELETE FROM conversations').run()

      return toSafeInteger(result.changes)
    })
  }

  countConversationMessages(): number {
    return this.executeRead((database) => {
      const row = database.prepare('SELECT COUNT(*) AS count FROM conversations').get()

      return requireCount(row)
    })
  }

  getLongTermMemoryEnabled(): boolean {
    return this.executeRead((database) => {
      const row = database
        .prepare('SELECT value FROM memory_settings WHERE key = ?')
        .get(LONG_TERM_MEMORY_ENABLED_SETTING)

      if (row === undefined) {
        return true
      }

      if (typeof row !== 'object' || row === null) {
        throw new MemoryManagerError('read-failed')
      }

      const value = (row as { value?: unknown }).value

      if (value !== 'true' && value !== 'false') {
        throw new MemoryManagerError('read-failed')
      }

      return value === 'true'
    })
  }

  setLongTermMemoryEnabled(enabled: boolean): boolean {
    if (typeof enabled !== 'boolean') {
      throw new MemoryManagerError('invalid-input')
    }

    return this.executeWrite((database) => {
      database
        .prepare(`
          INSERT INTO memory_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `)
        .run(LONG_TERM_MEMORY_ENABLED_SETTING, enabled ? 'true' : 'false', Date.now())

      return enabled
    })
  }

  clearAllMemory(): ClearMemoryCounts {
    return this.executeWrite((database) => {
      database.exec('BEGIN IMMEDIATE')

      try {
        const profileEntriesDeleted = toSafeInteger(
          database.prepare('DELETE FROM user_profile').run().changes
        )
        const memoriesDeleted = toSafeInteger(
          database.prepare('DELETE FROM memories').run().changes
        )
        const conversationMessagesDeleted = toSafeInteger(
          database.prepare('DELETE FROM conversations').run().changes
        )

        database.exec('COMMIT')

        return {
          profileEntriesDeleted,
          memoriesDeleted,
          conversationMessagesDeleted
        }
      } catch (error: unknown) {
        rollbackQuietly(database)
        throw error
      }
    })
  }

  private readProfileValue(database: DatabaseSync, key: string): UserProfileEntry | null {
    const row = database
      .prepare(`
        SELECT id, key, value, created_at, updated_at
        FROM user_profile
        WHERE key = ?
      `)
      .get(key)

    return row === undefined ? null : mapProfileRow(row)
  }

  private readMemory(database: DatabaseSync, id: number): MemoryRecord | null {
    const row = database
      .prepare(`
        SELECT id, type, content, importance, created_at, updated_at, last_accessed_at
        FROM memories
        WHERE id = ?
      `)
      .get(id)

    return row === undefined ? null : mapMemoryRow(row)
  }

  private readConversation(database: DatabaseSync, id: number): ConversationRecord | null {
    const row = database
      .prepare(`
        SELECT id, role, content, created_at
        FROM conversations
        WHERE id = ?
      `)
      .get(id)

    return row === undefined ? null : mapConversationRow(row)
  }

  private executeRead<T>(operation: (database: DatabaseSync) => T): T {
    const database = this.requireDatabase()

    try {
      return operation(database)
    } catch (error: unknown) {
      if (error instanceof MemoryManagerError) {
        throw error
      }

      throw new MemoryManagerError('read-failed', { cause: error })
    }
  }

  private executeWrite<T>(operation: (database: DatabaseSync) => T): T {
    const database = this.requireDatabase()

    try {
      return operation(database)
    } catch (error: unknown) {
      if (error instanceof MemoryManagerError) {
        throw error
      }

      throw new MemoryManagerError('write-failed', { cause: error })
    }
  }

  private requireDatabase(): DatabaseSync {
    if (!this.database) {
      throw new MemoryManagerError('not-initialized')
    }

    return this.database
  }
}

function mapProfileRow(row: unknown): UserProfileEntry {
  const record = requireRow<ProfileRow>(row)

  return {
    id: requireInteger(record.id),
    key: requireString(record.key),
    value: requireString(record.value),
    createdAt: requireInteger(record.created_at),
    updatedAt: requireInteger(record.updated_at)
  }
}

function mapMemoryRow(row: unknown): MemoryRecord {
  const record = requireRow<MemoryRow>(row)

  return {
    id: requireInteger(record.id),
    type: requireMemoryType(record.type),
    content: requireString(record.content),
    importance: requireNumber(record.importance),
    createdAt: requireInteger(record.created_at),
    updatedAt: requireInteger(record.updated_at),
    lastAccessedAt: requireInteger(record.last_accessed_at)
  }
}

function mapConversationRow(row: unknown): ConversationRecord {
  const record = requireRow<ConversationRow>(row)

  return {
    id: requireInteger(record.id),
    role: requireChatRole(record.role),
    content: requireString(record.content),
    createdAt: requireInteger(record.created_at)
  }
}

function requireProfileEntry(entry: UserProfileEntry | null): UserProfileEntry {
  if (!entry) {
    throw new MemoryManagerError('write-failed')
  }

  return entry
}

function requireMemoryRecord(memory: MemoryRecord | null): MemoryRecord {
  if (!memory) {
    throw new MemoryManagerError('write-failed')
  }

  return memory
}

function requireConversationRecord(
  conversation: ConversationRecord | null
): ConversationRecord {
  if (!conversation) {
    throw new MemoryManagerError('write-failed')
  }

  return conversation
}

function normalizeRequiredText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') {
    throw new MemoryManagerError('invalid-input')
  }

  const normalized = value.trim()

  if (!normalized || normalized.length > maximumLength) {
    throw new MemoryManagerError('invalid-input')
  }

  return normalized
}

function normalizeText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new MemoryManagerError('invalid-input')
  }

  return value
}

function normalizeImportance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new MemoryManagerError('invalid-input')
  }

  return value
}

function normalizeId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new MemoryManagerError('invalid-input')
  }

  return value as number
}

function normalizeTimestamp(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new MemoryManagerError('invalid-input')
  }

  return value as number
}

function normalizeLimit(value: unknown): number {
  const limit = value ?? DEFAULT_LIST_LIMIT

  if (!Number.isSafeInteger(limit) || (limit as number) <= 0 || (limit as number) > MAX_LIST_LIMIT) {
    throw new MemoryManagerError('invalid-input')
  }

  return limit as number
}

function requireMemoryType(value: unknown): MemoryType {
  if (!MEMORY_TYPES.includes(value as MemoryType)) {
    throw new MemoryManagerError('invalid-input')
  }

  return value as MemoryType
}

function requireChatRole(value: unknown): ChatRole {
  if (!CHAT_ROLES.includes(value as ChatRole)) {
    throw new MemoryManagerError('invalid-input')
  }

  return value as ChatRole
}

function requireRow<T>(value: unknown): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MemoryManagerError('read-failed')
  }

  return value as T
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MemoryManagerError('read-failed')
  }

  return value
}

function requireNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MemoryManagerError('read-failed')
  }

  return value
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw new MemoryManagerError('read-failed')
  }

  return value as number
}

function toSafeInteger(value: SQLInputValue): number {
  if (typeof value === 'bigint') {
    const converted = Number(value)

    if (Number.isSafeInteger(converted)) {
      return converted
    }
  }

  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value
  }

  throw new MemoryManagerError('write-failed')
}

function requireCount(row: unknown): number {
  if (typeof row !== 'object' || row === null) {
    throw new MemoryManagerError('read-failed')
  }

  return requireInteger((row as CountRow).count)
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK')
  } catch {
    // Preserve the original write error.
  }
}
