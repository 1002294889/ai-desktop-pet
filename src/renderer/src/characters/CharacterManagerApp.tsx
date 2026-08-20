import { useState } from 'react'

import type { InstalledCharacterSummary } from '../../../shared/character-management'
import { Button, IconButton } from '../ui/Button'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { EmptyState, ManagementPage, StatusMessage } from '../ui/ManagementPage'
import { CharacterCard } from './CharacterCard'
import { formatRenderer } from './character-labels'
import { useCharacterManagement } from './useCharacterManagement'
import './character-manager.css'

export function CharacterManagerApp(): React.JSX.Element {
  const characters = useCharacterManagement()
  const [preview, setPreview] = useState<InstalledCharacterSummary>()
  const [removing, setRemoving] = useState<InstalledCharacterSummary>()

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return
    await characters.remove(removing.id)
    setRemoving(undefined)
  }

  return (
    <ManagementPage
      title="Characters"
      description="Choose your companion’s appearance without changing conversations or memories."
      className="ui-page-wide character-manager-shell"
      actions={(
        <>
          {import.meta.env.DEV ? (
            <IconButton icon="refresh" label="Refresh characters" disabled={characters.isLoading || characters.isMutating} onClick={() => void characters.refresh()} />
          ) : null}
          <Button type="button" variant="primary" icon="import" loading={characters.isMutating} disabled={characters.isLoading} onClick={() => void characters.importPack()}>
            Import Character
          </Button>
        </>
      )}
    >
      {characters.error ? <StatusMessage tone="error">{characters.error}</StatusMessage> : null}
      {characters.notice ? <StatusMessage tone="success">{characters.notice}</StatusMessage> : null}

      {characters.isLoading && !characters.overview ? (
        <StatusMessage>Loading installed characters…</StatusMessage>
      ) : characters.overview?.characters.length ? (
        <section className="character-card-grid" aria-label="Installed characters" aria-busy={characters.isMutating}>
          {characters.overview.characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              disabled={characters.isMutating}
              onActivate={(characterId) => void characters.activate(characterId)}
              onPreview={setPreview}
              onRemove={setRemoving}
            />
          ))}
        </section>
      ) : (
        <EmptyState icon="character" title="No characters found" description="Import a compatible character pack to add a companion." />
      )}

      {preview ? (
        <Dialog title={preview.name} description={`${formatRenderer(preview.renderer)} · Version ${preview.version}`} onClose={() => setPreview(undefined)}>
          <div className="character-preview-content">
            <img src={preview.previewUrl} alt={`${preview.name} large preview`} />
            <Button type="button" autoFocus onClick={() => setPreview(undefined)}>Close Preview</Button>
          </div>
        </Dialog>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          description="This imported character and its copied files will be permanently removed from this device. Your memories and conversations will not be affected."
          confirmLabel="Remove Character"
          busy={characters.isMutating}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(undefined)}
        />
      ) : null}
    </ManagementPage>
  )
}
