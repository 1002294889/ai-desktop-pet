import { SettingsToggle } from './SettingsToggle'
import { useApplicationSettings } from './useApplicationSettings'
import './settings.css'

export function SettingsApp(): React.JSX.Element {
  const state = useApplicationSettings()
  const overview = state.overview

  return (
    <main className="app-settings-shell">
      <header className="app-settings-header">
        <div>
          <p className="app-settings-eyebrow">AI Desktop Pet</p>
          <h1>Settings</h1>
          <p>Control how your companion behaves on this device.</p>
        </div>
        <button
          className="settings-secondary-button"
          type="button"
          disabled={state.isLoading || state.isMutating}
          onClick={() => void state.refresh()}
        >
          Refresh
        </button>
      </header>

      {state.error ? <p className="settings-alert settings-alert-error">{state.error}</p> : null}
      {state.notice ? <p className="settings-alert settings-alert-success">{state.notice}</p> : null}

      {state.isLoading && !overview ? (
        <p className="settings-loading">Loading settings…</p>
      ) : overview ? (
        <div className="settings-section-list" aria-busy={state.isMutating}>
          <section className="settings-section">
            <h2>General</h2>
            <SettingsToggle
              settingKey="launchAtLogin"
              label="Launch AI Desktop Pet when I log in"
              description={
                overview.capabilities.launchAtLogin
                  ? 'Uses the operating system login-item setting.'
                  : 'Not available on this platform.'
              }
              checked={overview.settings.launchAtLogin}
              disabled={state.isMutating || !overview.capabilities.launchAtLogin}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <SettingsToggle
              settingKey="alwaysOnTop"
              label="Always on top"
              description="Keep the pet above normal windows."
              checked={overview.settings.alwaysOnTop}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <SettingsToggle
              settingKey="petVisible"
              label="Show desktop pet"
              description="Hiding the pet keeps the application and menu-bar controls running."
              checked={overview.settings.petVisible}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
          </section>

          <section className="settings-section">
            <h2>Pet</h2>
            <SettingsToggle
              settingKey="autonomousBehaviorEnabled"
              label="Autonomous behavior"
              description="Allow idle behavior and desktop wandering. Chat, dragging, and manual actions still work when paused."
              checked={overview.settings.autonomousBehaviorEnabled}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <div className="settings-link-row">
              <span>
                <strong>{overview.activeCharacter.name}</strong>
                <small>Active character · {overview.activeCharacter.id}</small>
              </span>
              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => window.desktopApi.openSettingsDestination('characters')}
              >
                Characters…
              </button>
            </div>
          </section>

          <section className="settings-section">
            <h2>AI</h2>
            <dl className="settings-status-grid">
              <div><dt>AI Provider</dt><dd>{overview.ai.requestedProvider}</dd></div>
              <div><dt>API status</dt><dd>{formatApiStatus(overview.ai.apiStatus)}</dd></div>
              <div><dt>Active provider</dt><dd>{overview.ai.activeProvider}</dd></div>
              <div><dt>Model</dt><dd>{overview.ai.model ?? 'Local built-in reply'}</dd></div>
            </dl>
            <p className="settings-security-note">API keys are never displayed or sent to this window.</p>
          </section>

          <section className="settings-section">
            <h2>Memory</h2>
            <SettingsToggle
              settingKey="longTermMemoryEnabled"
              label="Long-term memory"
              description="Use the same private on-device memory switch shown in Memory & Privacy."
              checked={overview.settings.longTermMemoryEnabled}
              disabled={state.isMutating}
              onChange={(key, value) => void state.setSetting(key, value)}
            />
            <button
              className="settings-secondary-button"
              type="button"
              onClick={() => window.desktopApi.openSettingsDestination('memory')}
            >
              Open Memory &amp; Privacy…
            </button>
          </section>

          <section className="settings-section settings-about-section">
            <h2>About</h2>
            <strong>{overview.application.name}</strong>
            <p>Version {overview.application.version}</p>
            <p>{overview.application.description}</p>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function formatApiStatus(status: 'configured' | 'not-configured' | 'not-required'): string {
  switch (status) {
    case 'configured':
      return 'Configured'
    case 'not-configured':
      return 'Not configured'
    case 'not-required':
      return 'Not required'
  }
}
