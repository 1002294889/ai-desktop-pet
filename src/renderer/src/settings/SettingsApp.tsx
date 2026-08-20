import type { AIProviderSettingsStatus } from '../../../shared/app-settings'
import { Button, IconButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Badge, ManagementPage, Section, StatusMessage } from '../ui/ManagementPage'
import { SettingsToggle } from './SettingsToggle'
import { useApplicationSettings } from './useApplicationSettings'
import './settings.css'

export function SettingsApp(): React.JSX.Element {
  const state = useApplicationSettings()
  const overview = state.overview

  return (
    <ManagementPage
      title="Settings"
      description="Choose how your companion behaves on this device."
      className="app-settings-shell"
      actions={import.meta.env.DEV ? (
        <IconButton
          icon="refresh"
          label="Refresh settings"
          disabled={state.isLoading || state.isMutating}
          onClick={() => void state.refresh()}
        />
      ) : undefined}
    >
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      {state.notice ? <StatusMessage tone="success">{state.notice}</StatusMessage> : null}

      {state.isLoading && !overview ? (
        <StatusMessage>Loading settings…</StatusMessage>
      ) : overview ? (
        <div className="ui-section-list" aria-busy={state.isMutating}>
          <Section title="General">
            <SettingsToggle
              settingKey="launchAtLogin"
              label="Launch at Login"
              description={overview.capabilities.launchAtLogin ? 'Start your companion automatically after you sign in.' : 'Not available on this device.'}
              checked={overview.settings.launchAtLogin}
              disabled={state.isMutating || !overview.capabilities.launchAtLogin}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <SettingsToggle
              settingKey="alwaysOnTop"
              label="Always on Top"
              description="Keep the pet above normal windows."
              checked={overview.settings.alwaysOnTop}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <SettingsToggle
              settingKey="petVisible"
              label="Show Pet"
              description="The menu-bar icon stays available while the pet is hidden."
              checked={overview.settings.petVisible}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
          </Section>

          <Section title="Pet">
            <SettingsToggle
              settingKey="autonomousBehaviorEnabled"
              label="Autonomous Movement"
              description="Let your companion idle, rest, and wander naturally."
              checked={overview.settings.autonomousBehaviorEnabled}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <div className="ui-link-row">
              <span className="ui-setting-copy">
                <strong>Active Character</strong>
                <small>{overview.activeCharacter.name}</small>
              </span>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => window.desktopApi.openSettingsDestination('characters')}
              >
                Characters <Icon name="chevron" size={15} />
              </Button>
            </div>
          </Section>

          <Section title="AI">
            <div className="settings-status-row">
              <span className="ui-setting-copy">
                <strong>Provider</strong>
                <small>{overview.ai.requestedProvider}</small>
              </span>
              <Badge tone={getAIStatusTone(overview.ai)}>{getAIStatusLabel(overview.ai)}</Badge>
            </div>
            <div className="settings-status-row">
              <span className="ui-setting-copy">
                <strong>Model</strong>
                <small>{overview.ai.model ?? 'Built-in offline replies'}</small>
              </span>
            </div>
            {overview.ai.apiStatus === 'not-configured' ? (
              <p className="settings-inline-note">
                Add your local API key to use DeepSeek. Offline replies remain available.
              </p>
            ) : null}
          </Section>

          <Section title="Memory">
            <SettingsToggle
              settingKey="longTermMemoryEnabled"
              label="Long-term Memory"
              description="Remember useful details on this device for future conversations."
              checked={overview.settings.longTermMemoryEnabled}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <div className="settings-section-action">
              <Button
                type="button"
                icon="memory"
                onClick={() => window.desktopApi.openSettingsDestination('memory')}
              >
                Open Memory Manager
              </Button>
            </div>
          </Section>

          <Section title="Application">
            <div className="ui-link-row">
              <span className="ui-setting-copy">
                <strong>Hide Desktop Pet</strong>
                <small>You can show it again from the menu-bar icon.</small>
              </span>
              <Button
                type="button"
                variant="tertiary"
                icon="visibility"
                disabled={state.isMutating || !overview.settings.petVisible}
                onClick={() => void state.setSetting('petVisible', false)}
              >
                Hide Pet
              </Button>
            </div>
          </Section>

          <Section title="About" className="settings-about-section">
            <div className="settings-about-product">
              <span className="settings-about-mark"><Icon name="character" size={22} /></span>
              <div>
                <strong>{overview.application.name}</strong>
                <p>Version {overview.application.version}</p>
              </div>
            </div>
            <p>An AI desktop companion with conversation, memory, characters, and autonomous behavior.</p>
          </Section>
        </div>
      ) : null}
    </ManagementPage>
  )
}

function getAIStatusLabel(ai: AIProviderSettingsStatus): string {
  if (ai.apiStatus === 'not-configured') return 'Not configured'
  if (ai.usingFallback && ai.requestedProvider === 'DeepSeek') return 'Offline'
  return ai.requestedProvider === 'Local' ? 'Ready' : 'Configured'
}

function getAIStatusTone(ai: AIProviderSettingsStatus): 'success' | 'warning' | 'neutral' {
  if (ai.apiStatus === 'not-configured' || ai.usingFallback) return 'warning'
  return ai.requestedProvider === 'Local' ? 'neutral' : 'success'
}
