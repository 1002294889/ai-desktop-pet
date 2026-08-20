interface SwitchProps {
  checked: boolean
  disabled?: boolean
  label: string
  description?: string
  onChange: (checked: boolean) => void
}

export function Switch({ checked, disabled, label, description, onChange }: SwitchProps): React.JSX.Element {
  return (
    <label className="ui-setting-row">
      <span className="ui-setting-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="ui-switch-control">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="ui-switch-track" aria-hidden="true" />
      </span>
    </label>
  )
}
