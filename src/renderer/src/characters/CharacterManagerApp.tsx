import { useState } from 'react'

import type { InstalledCharacterSummary } from '../../../shared/character-management'
import { CharacterCard } from './CharacterCard'
import { useCharacterManagement } from './useCharacterManagement'
import './character-manager.css'

export function CharacterManagerApp(): React.JSX.Element {
  const characters = useCharacterManagement()
  const [preview, setPreview] = useState<InstalledCharacterSummary>()

  const handleRemove = (character: InstalledCharacterSummary): void => {
    const activeWarning = character.isActive
      ? ' The default character will be activated first.'
      : ''

    if (
      window.confirm(
        `Remove ${character.name}?${activeWarning} This deletes its copied files from this device.`
      )
    ) {
      void characters.remove(character.id)
    }
  }

  return (
    <main className="character-manager-shell">
      <header className="character-manager-header">
        <div>
          <p className="character-manager-eyebrow">AI Desktop Pet</p>
          <h1>Characters</h1>
          <p>Switch appearance packs without changing your conversations or memories.</p>
        </div>
        <div className="character-manager-header-actions">
          <button
            className="character-secondary-button"
            type="button"
            disabled={characters.isLoading || characters.isMutating}
            onClick={() => void characters.refresh()}
          >
            Refresh
          </button>
          <button
            className="character-primary-button"
            type="button"
            disabled={characters.isLoading || characters.isMutating}
            onClick={() => void characters.importPack()}
          >
            Import folder…
          </button>
        </div>
      </header>

      {characters.error ? (
        <p className="character-manager-alert character-manager-alert-error">
          {characters.error}
        </p>
      ) : null}
      {characters.notice ? (
        <p className="character-manager-alert character-manager-alert-success">
          {characters.notice}
        </p>
      ) : null}

      {characters.isLoading && !characters.overview ? (
        <p className="character-manager-loading">Loading installed characters…</p>
      ) : (
        <section
          className="character-card-grid"
          aria-label="Installed characters"
          aria-busy={characters.isMutating}
        >
          {characters.overview?.characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              disabled={characters.isMutating}
              onActivate={(characterId) => void characters.activate(characterId)}
              onPreview={setPreview}
              onRemove={handleRemove}
            />
          ))}
        </section>
      )}

      {preview ? (
        <div
          className="character-preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.name} preview`}
          onClick={() => setPreview(undefined)}
        >
          <div
            className="character-preview-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={preview.previewUrl} alt={`${preview.name} large preview`} />
            <div>
              <h2>{preview.name}</h2>
              <p>{preview.renderer} renderer · version {preview.version}</p>
            </div>
            <button
              className="character-secondary-button"
              type="button"
              autoFocus
              onClick={() => setPreview(undefined)}
            >
              Close preview
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
