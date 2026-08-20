import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Icon, type IconName } from './Icon'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: IconName
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  icon,
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={`ui-button ui-button-${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      <span>{loading ? 'Working…' : children}</span>
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  size?: 'small' | 'regular'
}

export function IconButton({
  icon,
  label,
  size = 'regular',
  className = '',
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      className={`ui-icon-button ui-icon-button-${size} ${className}`.trim()}
      type="button"
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} size={size === 'small' ? 16 : 18} />
    </button>
  )
}
