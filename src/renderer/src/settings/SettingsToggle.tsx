import type { AppSettingKey } from '../../../shared/app-settings'
import { Switch } from '../ui/Switch'

interface SettingsToggleProps {
  settingKey: AppSettingKey
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: (key: AppSettingKey, value: boolean) => void
}

export function SettingsToggle({ settingKey, onChange, ...props }: SettingsToggleProps): React.JSX.Element {
  return <Switch {...props} onChange={(value) => onChange(settingKey, value)} />
}
