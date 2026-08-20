import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

import type { CharacterManager } from './character-manager'
import { CharacterPackError } from './character-pack-error'

const PROBE_MODES = [
  'exercise',
  'seed-persistence',
  'verify-persistence',
  'seed-installed',
  'cleanup'
] as const

type CharacterManagementProbeMode = (typeof PROBE_MODES)[number]

const PROBE_CHARACTER_ID = 'probe-orange'
const PROBE_3D_CHARACTER_ID = 'probe-future-3d'

export interface CharacterManagementProbeOptions {
  characterManager: CharacterManager
  repositoryRoot: string
  userCharactersDirectory: string
}

export function getCharacterManagementProbeMode():
  | CharacterManagementProbeMode
  | undefined {
  const value = process.env.DESKTOP_PET_CHARACTER_MANAGEMENT_PROBE_MODE

  if (value === undefined) {
    return undefined
  }

  if (!PROBE_MODES.includes(value as CharacterManagementProbeMode)) {
    throw new Error(
      'DESKTOP_PET_CHARACTER_MANAGEMENT_PROBE_MODE must be exercise, seed-persistence, verify-persistence, seed-installed, or cleanup.'
    )
  }

  return value as CharacterManagementProbeMode
}

export async function runCharacterManagementProbe(
  mode: CharacterManagementProbeMode,
  options: CharacterManagementProbeOptions
): Promise<void> {
  switch (mode) {
    case 'exercise':
      await exerciseCharacterManagement(options)
      return
    case 'seed-persistence':
      await ensureProbeCharacterRemoved(options.characterManager)
      await importProbeCharacter(options.characterManager)
      await options.characterManager.setActiveCharacter(PROBE_CHARACTER_ID)
      console.info('[CharacterManagementProbe] seed-persistence passed.', {
        activeCharacterId: PROBE_CHARACTER_ID
      })
      return
    case 'verify-persistence':
      assert(
        options.characterManager.getOverview().activeCharacterId ===
          PROBE_CHARACTER_ID,
        'selected character did not survive application restart'
      )
      await options.characterManager.removeCharacter(PROBE_CHARACTER_ID)
      console.info('[CharacterManagementProbe] verify-persistence passed.', {
        selectedCharacterSurvivedRestart: true,
        activeCharacterRemovedSafely: true,
        activeCharacterId: options.characterManager.getOverview().activeCharacterId
      })
      return
    case 'seed-installed':
      await ensureProbeCharacterRemoved(options.characterManager)
      await importProbeCharacter(options.characterManager)
      await options.characterManager.setActiveCharacter(
        options.characterManager.getOverview().defaultCharacterId
      )
      console.info('[CharacterManagementProbe] seed-installed passed.', {
        installedCharacterId: PROBE_CHARACTER_ID,
        activeCharacterId: options.characterManager.getOverview().activeCharacterId
      })
      return
    case 'cleanup':
      await ensureProbeCharacterRemoved(options.characterManager)
      console.info('[CharacterManagementProbe] cleanup passed.', {
        activeCharacterId: options.characterManager.getOverview().activeCharacterId
      })
  }
}

async function exerciseCharacterManagement(
  options: CharacterManagementProbeOptions
): Promise<void> {
  const { characterManager } = options

  await ensureProbeCharacterRemoved(characterManager)

  const initialOverview = characterManager.getOverview()
  const defaultCharacter = initialOverview.characters.find(
    ({ id }) => id === initialOverview.defaultCharacterId
  )

  assert(defaultCharacter, 'default character was not listed')
  assert(defaultCharacter.isActive, 'default character was not initially active')
  assert(!defaultCharacter.canRemove, 'built-in default was marked removable')

  const imported = await importProbeCharacter(characterManager)
  const installedDirectory = join(
    options.userCharactersDirectory,
    PROBE_CHARACTER_ID
  )
  const repositoryRelativePath = relative(
    resolve(options.repositoryRoot),
    resolve(installedDirectory)
  )

  assert(imported.id === PROBE_CHARACTER_ID, 'valid character import returned wrong ID')
  assert(
    repositoryRelativePath.startsWith('..') || isAbsolute(repositoryRelativePath),
    'imported character was stored inside the Git repository'
  )
  assert(
    characterManager.getOverview().characters.some(
      ({ id }) => id === PROBE_CHARACTER_ID
    ),
    'imported character was not listed'
  )

  const switchedCharacter = await characterManager.setActiveCharacter(
    PROBE_CHARACTER_ID
  )

  assert(
    switchedCharacter.manifest.id === PROBE_CHARACTER_ID,
    'runtime switch returned the wrong character'
  )
  assert(switchedCharacter.actions.idle, 'imported character had no idle action')
  assert(
    switchedCharacter.actions.jump === undefined,
    'probe pack unexpectedly defined an optional jump action'
  )

  await expectRejectedImport('malformed manifest', async (directory) => {
    await writeFile(join(directory, 'character.json'), '{not-json', 'utf8')
  }, characterManager, 'invalid-pack')

  await expectRejectedImport('unsafe asset path', async (directory) => {
    await writeManifest(directory, {
      ...createManifest('unsafe-path'),
      actions: {
        idle: { type: 'static', asset: '../outside.svg' }
      }
    })
  }, characterManager, 'invalid-pack')

  await expectRejectedImport('unsafe 3D model path', async (directory) => {
    await writeManifest(directory, {
      id: 'unsafe-3d-path',
      name: 'Unsafe 3D Path',
      renderer: '3d',
      version: 1,
      defaultWidth: 220,
      defaultHeight: 260,
      scale: 1,
      model: '../outside.glb',
      actions: { idle: { type: '3d', loop: true } }
    })
  }, characterManager, 'invalid-pack')

  await expectRejectedImport('remote GLTF dependency', async (directory) => {
    await createUnsafeGltfPack(directory)
  }, characterManager, 'invalid-pack')

  await expectRejectedImport('script-containing pack', async (directory) => {
    await createStaticPack(directory, 'scripted-pack', 'Scripted Test Pet')
    await writeFile(join(directory, 'behavior.js'), 'throw new Error("unsafe")\n', 'utf8')
  }, characterManager, 'invalid-pack')

  await withTemporaryPack(async (directory) => {
    await createValidPack(directory)
    await assertRejectsWithCode(
      () => characterManager.importCharacterPack(directory),
      'duplicate-id',
      'duplicate character ID was not rejected predictably'
    )
  })

  await characterManager.setActiveCharacter(initialOverview.defaultCharacterId)
  const nonActiveRemoval = await characterManager.removeCharacter(
    PROBE_CHARACTER_ID
  )

  assert(!nonActiveRemoval.switchedToDefault, 'non-active removal reported a switch')
  assert(
    !characterManager.getOverview().characters.some(
      ({ id }) => id === PROBE_CHARACTER_ID
    ),
    'non-active character remained installed after removal'
  )

  await importProbeCharacter(characterManager)
  await characterManager.setActiveCharacter(PROBE_CHARACTER_ID)
  const activeRemoval = await characterManager.removeCharacter(PROBE_CHARACTER_ID)

  assert(activeRemoval.switchedToDefault, 'active removal did not switch to default')
  assert(
    characterManager.getOverview().activeCharacterId ===
      initialOverview.defaultCharacterId,
    'default was not active after active character removal'
  )

  await assertRejectsWithCode(
    () => characterManager.removeCharacter(initialOverview.defaultCharacterId),
    'built-in-character',
    'built-in default character could be removed'
  )

  const threeDCharacter = await withTemporaryPack(async (directory) => {
    await createThreeDProbePack(directory)
    return characterManager.importCharacterPack(directory)
  })

  assert(
    threeDCharacter.renderer === '3d' && threeDCharacter.canActivate,
    '3D manifest was not discoverable as an available renderer'
  )
  const loadedThreeDCharacter = await characterManager.setActiveCharacter(
    PROBE_3D_CHARACTER_ID
  )

  assert(
    loadedThreeDCharacter.manifest['3d']?.source === 'procedural' &&
      loadedThreeDCharacter.modelUrl === undefined,
    'procedural 3D character did not load through the typed renderer configuration'
  )

  for (let switchIndex = 0; switchIndex < 2; switchIndex += 1) {
    await characterManager.setActiveCharacter(initialOverview.defaultCharacterId)
    await characterManager.setActiveCharacter(PROBE_3D_CHARACTER_ID)
  }

  await characterManager.setActiveCharacter(initialOverview.defaultCharacterId)
  await characterManager.removeCharacter(PROBE_3D_CHARACTER_ID)

  console.info('[CharacterManagementProbe] exercise passed.', {
    defaultListed: true,
    validPackImported: true,
    runtimeSwitchSucceeded: true,
    missingOptionalActionUsesIdleFallback: true,
    malformedManifestRejected: true,
    unsafeTraversalRejected: true,
    scriptFilesRejected: true,
    duplicateIdRejected: true,
    nonActiveRemovalSucceeded: true,
    activeRemovalSwitchedToDefault: true,
    builtInDefaultProtected: true,
    importedAssetsOutsideRepository: true,
    unsafe3dTraversalRejected: true,
    remoteGltfDependencyRejected: true,
    threeDRendererAvailable: true,
    repeated2d3dSwitching: true
  })
}

async function importProbeCharacter(characterManager: CharacterManager) {
  return withTemporaryPack(async (directory) => {
    await createValidPack(directory)
    return characterManager.importCharacterPack(directory)
  })
}

async function ensureProbeCharacterRemoved(
  characterManager: CharacterManager
): Promise<void> {
  for (const characterId of [PROBE_CHARACTER_ID, PROBE_3D_CHARACTER_ID]) {
    if (
      characterManager
        .getOverview()
        .characters.some(({ id }) => id === characterId)
    ) {
      await characterManager.removeCharacter(characterId)
    }
  }
}

async function expectRejectedImport(
  label: string,
  prepare: (directory: string) => Promise<void>,
  characterManager: CharacterManager,
  code: CharacterPackError['code']
): Promise<void> {
  await withTemporaryPack(async (directory) => {
    await prepare(directory)
    await assertRejectsWithCode(
      () => characterManager.importCharacterPack(directory),
      code,
      `${label} was not rejected safely`
    )
  })
}

async function assertRejectsWithCode(
  operation: () => Promise<unknown>,
  code: CharacterPackError['code'],
  message: string
): Promise<void> {
  try {
    await operation()
  } catch (error: unknown) {
    assert(error instanceof CharacterPackError, `${message}: unexpected error type`)
    assert(error.code === code, `${message}: expected ${code}, received ${error.code}`)
    return
  }

  throw new Error(`[CharacterManagementProbe] ${message}`)
}

async function createValidPack(directory: string): Promise<void> {
  await createStaticPack(directory, PROBE_CHARACTER_ID, 'Orange Test Pet')
}

async function createStaticPack(
  directory: string,
  id: string,
  name: string
): Promise<void> {
  await mkdir(join(directory, 'assets'), { recursive: true })
  await writeManifest(directory, createManifest(id, name))
  await writeFile(
    join(directory, 'assets', 'idle.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 260"><rect x="30" y="34" width="160" height="194" rx="74" fill="#fb923c"/><circle cx="82" cy="112" r="9" fill="#431407"/><circle cx="138" cy="112" r="9" fill="#431407"/><path d="M78 157q32 27 64 0" fill="none" stroke="#431407" stroke-width="9" stroke-linecap="round"/></svg>',
    'utf8'
  )
}

async function createThreeDProbePack(directory: string): Promise<void> {
  await mkdir(join(directory, 'assets'), { recursive: true })
  await writeManifest(directory, {
    id: PROBE_3D_CHARACTER_ID,
    name: 'Future 3D Test Pet',
    renderer: '3d',
    version: 1,
    defaultWidth: 220,
    defaultHeight: 260,
    scale: 1,
    preview: 'assets/preview.svg',
    '3d': {
      source: 'procedural',
      cameraPosition: [0, 0.4, 4.5],
      modelPosition: [0, -0.8, 0],
      modelRotation: [0, 0, 0]
    },
    actions: {
      idle: { type: '3d', loop: true },
      jump: { type: '3d', loop: false, durationMs: 900 }
    }
  })
  await writeFile(
    join(directory, 'assets', 'preview.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#c4b5fd"/></svg>',
    'utf8'
  )
}

async function createUnsafeGltfPack(directory: string): Promise<void> {
  await mkdir(join(directory, 'assets'), { recursive: true })
  await writeManifest(directory, {
    id: 'unsafe-gltf-dependency',
    name: 'Unsafe GLTF Dependency',
    renderer: '3d',
    version: 1,
    defaultWidth: 220,
    defaultHeight: 260,
    scale: 1,
    model: 'assets/model.gltf',
    actions: { idle: { type: '3d', loop: true } }
  })
  await writeFile(
    join(directory, 'assets', 'model.gltf'),
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'https://example.com/remote.bin', byteLength: 4 }]
    }),
    'utf8'
  )
}

function createManifest(
  id: string,
  name = id === PROBE_CHARACTER_ID ? 'Orange Test Pet' : 'Unsafe Test Pet'
): Record<string, unknown> {
  return {
    id,
    name,
    renderer: 'static',
    version: 1,
    defaultWidth: 220,
    defaultHeight: 260,
    scale: 1,
    actions: {
      idle: { type: 'static', asset: 'assets/idle.svg' }
    }
  }
}

async function writeManifest(
  directory: string,
  manifest: Record<string, unknown>
): Promise<void> {
  await writeFile(
    join(directory, 'character.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )
}

async function withTemporaryPack<T>(
  operation: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'ai-desktop-pet-character-pack-'))

  try {
    return await operation(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[CharacterManagementProbe] ${message}`)
  }
}
