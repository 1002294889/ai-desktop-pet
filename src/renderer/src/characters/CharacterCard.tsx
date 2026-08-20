import type { InstalledCharacterSummary } from '../../../shared/character-management'
import { Button } from '../ui/Button'
import { Badge } from '../ui/ManagementPage'
import { formatRenderer } from './character-labels'

interface CharacterCardProps {
  character: InstalledCharacterSummary
  disabled: boolean
  onActivate: (characterId: string) => void
  onPreview: (character: InstalledCharacterSummary) => void
  onRemove: (character: InstalledCharacterSummary) => void
}

export function CharacterCard({ character, disabled, onActivate, onPreview, onRemove }: CharacterCardProps): React.JSX.Element {
  return (
    <article className="character-card" data-active={character.isActive} data-character-id={character.id}>
      <button className="character-card-preview-button" type="button" aria-label={`Preview ${character.name}`} disabled={disabled} onClick={() => onPreview(character)}>
        <img className="character-card-preview" src={character.previewUrl} alt={`${character.name} preview`} draggable={false} />
      </button>
      <div className="character-card-body">
        <div className="character-card-heading">
          <h2>{character.name}</h2>
          <div className="character-card-badges">
            {character.origin === 'built-in' ? <Badge>Built-in</Badge> : null}
            {character.isActive ? <Badge tone="success">Active</Badge> : null}
          </div>
        </div>
        <p className="character-card-description">{formatRenderer(character.renderer)} · Version {character.version}</p>
        {!character.canActivate ? <p className="character-unavailable-note">This character uses a renderer planned for a future version.</p> : null}
        {character.origin === 'built-in' ? <p className="character-built-in-note">Included with the app · Cannot be removed</p> : null}
        <div className="character-card-actions">
          <Button type="button" variant="primary" disabled={disabled || character.isActive || !character.canActivate} onClick={() => onActivate(character.id)}>
            {character.isActive ? 'Active' : 'Use'}
          </Button>
          <Button type="button" onClick={() => onPreview(character)} disabled={disabled}>Preview</Button>
          {character.canRemove ? <Button type="button" variant="tertiary" disabled={disabled} onClick={() => onRemove(character)}>Remove</Button> : null}
        </div>
      </div>
    </article>
  )
}
