import type { ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

interface ManagementPageProps {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function ManagementPage({ title, description, actions, children, className = '' }: ManagementPageProps): React.JSX.Element {
  return (
    <main className={`ui-page ${className}`.trim()}>
      <header className="ui-page-header">
        <div>
          <p className="ui-eyebrow">AI Desktop Pet</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="ui-page-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  )
}

interface SectionProps {
  title: string
  description?: string
  eyebrow?: string
  aside?: ReactNode
  children: ReactNode
  tone?: 'default' | 'danger'
  className?: string
}

export function Section({ title, description, eyebrow, aside, children, tone = 'default', className = '' }: SectionProps): React.JSX.Element {
  return (
    <section className={`ui-section ui-section-${tone} ${className}`.trim()}>
      <header className="ui-section-header">
        <div>
          {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warning' }): React.JSX.Element {
  return <span className="ui-badge" data-tone={tone}>{children}</span>
}

export function StatusMessage({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'error' }): React.JSX.Element {
  return <div className="ui-status-message" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ icon, title, description }: { icon: IconName; title: string; description: string }): React.JSX.Element {
  return (
    <div className="ui-empty-state">
      <span><Icon name={icon} size={21} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}
