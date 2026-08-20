export type IconName =
  | 'chat'
  | 'settings'
  | 'memory'
  | 'character'
  | 'close'
  | 'delete'
  | 'edit'
  | 'import'
  | 'search'
  | 'pause'
  | 'play'
  | 'visibility'
  | 'check'
  | 'chevron'
  | 'info'
  | 'refresh'
  | 'send'

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {getIconPaths(name)}
    </svg>
  )
}

function getIconPaths(name: IconName): React.ReactNode {
  switch (name) {
    case 'chat':
      return <><path d="M5 18.5 3.5 21l3.7-1.2a9 9 0 1 0-2.2-1.3Z" /><path d="M8 11h8M8 15h5" /></>
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>
    case 'memory':
      return <><path d="M7 3.5h8a3 3 0 0 1 3 3v14H8a3 3 0 0 1-3-3v-12a2 2 0 0 1 2-2Z" /><path d="M8 3.5v17M11 8h4M11 12h4" /></>
    case 'character':
      return <><path d="M7.5 8 6 3.5 10 6h4l4-2.5L16.5 8a7 7 0 1 1-9 0Z" /><path d="M9 13h.01M15 13h.01M10 16c1.3 1 2.7 1 4 0" /></>
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />
    case 'delete':
      return <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" /></>
    case 'edit':
      return <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>
    case 'import':
      return <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></>
    case 'search':
      return <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>
    case 'pause':
      return <><path d="M9 6v12M15 6v12" /></>
    case 'play':
      return <path d="m8 5 11 7-11 7V5Z" />
    case 'visibility':
      return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>
    case 'check':
      return <path d="m5 12 4 4L19 6" />
    case 'chevron':
      return <path d="m9 6 6 6-6 6" />
    case 'info':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>
    case 'refresh':
      return <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>
    case 'send':
      return <><path d="m3 4 18 8-18 8 3-8-3-8Z" /><path d="M6 12h15" /></>
  }
}
