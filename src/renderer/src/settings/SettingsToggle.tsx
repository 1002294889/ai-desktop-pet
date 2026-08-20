import type { AppSettingKey } from '../../../shared/app-settings'

interface SettingsToggleProps {
  settingKey: AppSettingKey
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (key: AppSettingKey, value: boolean) => void
}

export function SettingsToggle({
  settingKey,
  label,
  description,
  checked,
  disabled,
  onChange
}: SettingsToggleProps): React.JSX.Element {
  return (
    <label className="settings-toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(settingKey, event.currentTarget.checked)}
      />
    </label>
  )
}
