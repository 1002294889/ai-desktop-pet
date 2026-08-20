import { useEffect, type ReactNode } from 'react'

import { Button, IconButton } from './Button'

interface DialogProps {
  title: string
  description?: string
  children?: ReactNode
  onClose: () => void
}

export function Dialog({ title, description, children, onClose }: DialogProps): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="ui-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-dialog-title"
        aria-describedby={description ? 'ui-dialog-description' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <IconButton className="ui-dialog-close" icon="close" label="Close" onClick={onClose} />
        <h2 id="ui-dialog-title">{title}</h2>
        {description ? <p id="ui-dialog-description">{description}</p> : null}
        {children}
      </section>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  busy?: boolean
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = true,
  busy = false
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Dialog title={title} description={description} onClose={onCancel}>
      <div className="ui-dialog-actions">
        <Button type="button" autoFocus disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'primary'}
          loading={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
