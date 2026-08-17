import { join } from 'node:path'

import { config } from 'dotenv'

export interface DevelopmentEnvironmentLoadResult {
  loaded: boolean
  warning?: string
}

export function loadDevelopmentEnvironment(
  applicationRoot: string
): DevelopmentEnvironmentLoadResult {
  const result = config({
    path: join(applicationRoot, '.env.local'),
    override: false,
    quiet: true
  })

  if (!result.error) {
    return { loaded: true }
  }

  if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { loaded: false }
  }

  return {
    loaded: false,
    warning: 'Unable to load the local development environment file.'
  }
}
