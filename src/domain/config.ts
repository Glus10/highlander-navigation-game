import type { LatLng } from './types'

export interface GameConfig {
  osrmFootUrl: string
  routingTimeoutMs: number
  goalMinRadiusM: number
  goalMaxRadiusM: number
  maxSnapDistanceM: number
  maxRouteLengthM: number
  maxGoalAttempts: number
  goalThresholdM: number
  startFixMaxAccuracyM: number
  startFixWaitMs: number
  geolocationTimeoutMs: number
  simStart: LatLng
}

/** Approved defaults (DECISIONS.md D3d / D4a). Mirrored in .env.example. */
export const DEFAULT_CONFIG: GameConfig = {
  osrmFootUrl: 'https://routing.openstreetmap.de/routed-foot',
  routingTimeoutMs: 8_000,
  goalMinRadiusM: 300,
  goalMaxRadiusM: 800,
  maxSnapDistanceM: 150,
  maxRouteLengthM: 1_600,
  maxGoalAttempts: 5,
  goalThresholdM: 25,
  startFixMaxAccuracyM: 100,
  startFixWaitMs: 10_000,
  geolocationTimeoutMs: 15_000,
  simStart: { lat: 51.508, lng: -0.1281 },
}

type NumericKey = {
  [K in keyof GameConfig]: GameConfig[K] extends number ? K : never
}[keyof GameConfig]

/** Unparsed values (e.g. from environment variables). Missing/empty values fall back to DEFAULT_CONFIG. */
export type RawConfig = Partial<
  Record<NumericKey | 'osrmFootUrl' | 'simStartLat' | 'simStartLng', string | number | undefined>
>

export interface ConfigError {
  field: string
  message: string
}

export type ConfigValidation = { ok: true; config: GameConfig } | { ok: false; errors: ConfigError[] }

const POSITIVE_NUMBERS: readonly NumericKey[] = [
  'routingTimeoutMs',
  'goalMinRadiusM',
  'goalMaxRadiusM',
  'maxSnapDistanceM',
  'maxRouteLengthM',
  'maxGoalAttempts',
  'goalThresholdM',
  'startFixMaxAccuracyM',
  'startFixWaitMs',
  'geolocationTimeoutMs',
]

const isMissing = (value: unknown) => value === undefined || (typeof value === 'string' && value.trim() === '')

function parseNumber(value: string | number | undefined, fallback: number): number {
  if (isMissing(value)) return fallback
  return typeof value === 'number' ? value : Number(String(value).trim())
}

export function validateConfig(raw: RawConfig): ConfigValidation {
  const errors: ConfigError[] = []
  const numbers = {} as Record<NumericKey, number>

  for (const key of POSITIVE_NUMBERS) {
    const value = parseNumber(raw[key], DEFAULT_CONFIG[key])
    if (!Number.isFinite(value)) errors.push({ field: key, message: 'must be a number' })
    else if (value <= 0) errors.push({ field: key, message: 'must be greater than 0' })
    numbers[key] = value
  }
  if (Number.isFinite(numbers.maxGoalAttempts) && !Number.isInteger(numbers.maxGoalAttempts)) {
    errors.push({ field: 'maxGoalAttempts', message: 'must be an integer' })
  }

  const osrmFootUrl = isMissing(raw.osrmFootUrl) ? DEFAULT_CONFIG.osrmFootUrl : String(raw.osrmFootUrl).trim()
  if (!/^https?:\/\/\S+$/.test(osrmFootUrl)) {
    errors.push({ field: 'osrmFootUrl', message: 'must be an http(s) URL' })
  }

  const lat = parseNumber(raw.simStartLat, DEFAULT_CONFIG.simStart.lat)
  const lng = parseNumber(raw.simStartLng, DEFAULT_CONFIG.simStart.lng)
  if (!(Number.isFinite(lat) && lat >= -90 && lat <= 90)) {
    errors.push({ field: 'simStartLat', message: 'must be between -90 and 90' })
  }
  if (!(Number.isFinite(lng) && lng >= -180 && lng <= 180)) {
    errors.push({ field: 'simStartLng', message: 'must be between -180 and 180' })
  }

  // Cross-field rules only make sense once the individual values are valid.
  if (errors.length === 0) {
    if (numbers.goalThresholdM >= numbers.goalMinRadiusM) {
      errors.push({ field: 'goalThresholdM', message: 'must be smaller than goalMinRadiusM' })
    }
    if (numbers.goalMinRadiusM >= numbers.goalMaxRadiusM) {
      errors.push({ field: 'goalMinRadiusM', message: 'must be smaller than goalMaxRadiusM' })
    }
    if (numbers.maxRouteLengthM < numbers.goalMaxRadiusM) {
      errors.push({ field: 'maxRouteLengthM', message: 'must be at least goalMaxRadiusM' })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, config: { ...numbers, osrmFootUrl, simStart: { lat, lng } } }
}
