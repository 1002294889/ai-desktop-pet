import type { InstalledCharacterSummary } from '../../../shared/character-management'

interface CharacterCardProps {
  character: InstalledCharacterSummary
  disabled: boolean
  onActivate: (characterId: string) => void
  onPreview: (character: InstalledCharacterSummary) => void
  onRemove: (character: InstalledCharacterSummary) => void
}

export function CharacterCard({
  character,
  disabled,
  onActivate,
  onPreview,
  onRemove
}: CharacterCardProps): React.JSX.Element {
  return (
    <article
      className="character-card"
      data-active={character.isActive}
      data-character-id={character.id}
    >
      <button
        className="character-card-preview-button"
        type="button"
        aria-label={`Preview ${character.name}`}
        disabled={disabled}
        onClick={() => onPreview(character)}
      >
        <img
          className="character-card-preview"
          src={character.previewUrl}
          alt={`${character.name} preview`}
          draggable={false}
        />
      </button>
      <div className="character-card-body">
        <div className="character-card-heading">
          <div>
            <h2>{character.name}</h2>
            <p>{character.id}</p>
          </div>
          {character.isActive ? (
            <span className="character-active-badge">Active</span>
          ) : null}
        </div>
        <dl className="character-card-meta">
          <div>
            <dt>Renderer</dt>
            <dd>{character.renderer}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{character.version}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{character.origin === 'built-in' ? 'Built-in' : 'Imported'}</dd>
          </div>
        </dl>
        {!character.canActivate ? (
          <p className="character-unavailable-note">
            This renderer is reserved for a future version.
          </p>
        ) : null}
        <div className="character-card-actions">
          <button
            className="character-primary-button"
            type="button"
            disabled={disabled || character.isActive || !character.canActivate}
            onClick={() => onActivate(character.id)}
          >
            {character.isActive ? 'In use' : 'Use'}
          </button>
          <button
            className="character-secondary-button"
            type="button"
            disabled={disabled}
            onClick={() => onPreview(character)}
          >
            Preview
          </button>
          {character.canRemove ? (
            <button
              className="character-remove-button"
              type="button"
              disabled={disabled}
              onClick={() => onRemove(character)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
