export type ConfiguredAIProvider = 'deepseek' | 'local'

export interface AIConfiguration {
  requestedProvider: ConfiguredAIProvider
  deepSeek: {
    apiKey?: string
    baseUrl: string
    model: string
    timeoutMs: number
  }
  warnings: readonly string[]
}

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000

export function loadAIConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): AIConfiguration {
  const warnings: string[] = []
  const requestedProvider = parseProvider(environment.AI_PROVIDER, warnings)
  const baseUrl = parseBaseUrl(environment.DEEPSEEK_BASE_URL, warnings)
  const timeoutMs = parseTimeout(environment.DEEPSEEK_TIMEOUT_MS, warnings)
  const model = environment.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL
  const apiKey = environment.DEEPSEEK_API_KEY?.trim() || undefined

  return {
    requestedProvider,
    deepSeek: { apiKey, baseUrl, model, timeoutMs },
    warnings
  }
}

function parseProvider(value: string | undefined, warnings: string[]): ConfiguredAIProvider {
  const normalizedValue = value?.trim().toLowerCase()

  if (!normalizedValue || normalizedValue === 'deepseek') {
    return 'deepseek'
  }

  if (normalizedValue === 'local') {
    return 'local'
  }

  warnings.push(`Unsupported AI_PROVIDER "${normalizedValue}"; using deepseek.`)
  return 'deepseek'
}

function parseBaseUrl(value: string | undefined, warnings: string[]): string {
  const candidate = value?.trim() || DEFAULT_DEEPSEEK_BASE_URL

  try {
    const url = new URL(candidate)
    const isLocalDevelopmentUrl =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')

    if (url.protocol !== 'https:' && !isLocalDevelopmentUrl) {
      throw new Error('AI provider URLs must use HTTPS')
    }

    return candidate.replace(/\/+$/, '')
  } catch {
    warnings.push('Invalid DEEPSEEK_BASE_URL; using the official DeepSeek API URL.')
    return DEFAULT_DEEPSEEK_BASE_URL
  }
}

function parseTimeout(value: string | undefined, warnings: string[]): number {
  if (!value?.trim()) {
    return DEFAULT_TIMEOUT_MS
  }

  const timeoutMs = Number(value)

  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    warnings.push(
      `Invalid DEEPSEEK_TIMEOUT_MS; using ${DEFAULT_TIMEOUT_MS} milliseconds.`
    )
    return DEFAULT_TIMEOUT_MS
  }

  return timeoutMs
}
