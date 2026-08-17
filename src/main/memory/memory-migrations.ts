import type { DatabaseSync } from 'node:sqlite'

import { MemoryManagerError } from './memory-manager-error'

interface MemoryMigration {
  version: number
  apply: (database: DatabaseSync) => void
}

const MIGRATIONS: readonly MemoryMigration[] = [
  {
    version: 1,
    apply: (database) => {
      database.exec(`
        CREATE TABLE user_profile (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;

        CREATE TABLE memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
        ) STRICT;

        CREATE INDEX memories_type_created_at_idx
          ON memories (type, created_at DESC);

        CREATE TABLE conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        ) STRICT;

        CREATE INDEX conversations_created_at_idx
          ON conversations (created_at DESC, id DESC);
      `)
    }
  }
]

export const LATEST_MEMORY_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0

export function applyMemoryMigrations(database: DatabaseSync): void {
  const currentVersion = readSchemaVersion(database)

  if (currentVersion > LATEST_MEMORY_SCHEMA_VERSION) {
    throw new MemoryManagerError('unsupported-schema')
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue
    }

    database.exec('BEGIN IMMEDIATE')

    try {
      migration.apply(database)
      database.exec(`PRAGMA user_version = ${migration.version}`)
      database.exec('COMMIT')
    } catch (error: unknown) {
      try {
        database.exec('ROLLBACK')
      } catch {
        // Preserve the migration error; closing the connection is handled by the caller.
      }

      throw error
    }
  }
}

function readSchemaVersion(database: DatabaseSync): number {
  const row: unknown = database.prepare('PRAGMA user_version').get()

  if (typeof row !== 'object' || row === null) {
    throw new MemoryManagerError('unsupported-schema')
  }

  const version = (row as { user_version?: unknown }).user_version

  if (!Number.isInteger(version) || (version as number) < 0) {
    throw new MemoryManagerError('unsupported-schema')
  }

  return version as number
}
