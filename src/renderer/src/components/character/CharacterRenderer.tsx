export function CharacterRenderer(): React.JSX.Element {
  return (
    <div className="character-renderer" aria-label="Temporary character placeholder">
      <div className="placeholder-shadow" aria-hidden="true" />
      <div className="placeholder-character" aria-hidden="true">
        <span className="placeholder-ear placeholder-ear-left" />
        <span className="placeholder-ear placeholder-ear-right" />
        <span className="placeholder-face">
          <span className="placeholder-eye placeholder-eye-left" />
          <span className="placeholder-eye placeholder-eye-right" />
          <span className="placeholder-smile" />
        </span>
      </div>
      <div className="placeholder-caption">
        <strong>Character placeholder</strong>
        <span>Drag to move</span>
      </div>
    </div>
  )
}
