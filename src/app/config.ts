// The only place that reads build-time environment variables (D6b). Everything else receives a typed GameConfig.

import { validateConfig, type ConfigValidation, type RawConfig } from '../domain/config'

/** Environment variable → config field. Keep in sync with .env.example. */
const ENV_KEYS: Record<keyof RawConfig, string> = {
  osrmFootUrl: 'VITE_OSRM_FOOT_URL',
  routingTimeoutMs: 'VITE_ROUTING_TIMEOUT_MS',
  goalMinRadiusM: 'VITE_GOAL_MIN_RADIUS_M',
  goalMaxRadiusM: 'VITE_GOAL_MAX_RADIUS_M',
  maxSnapDistanceM: 'VITE_MAX_SNAP_DISTANCE_M',
  maxRouteLengthM: 'VITE_MAX_ROUTE_LENGTH_M',
  maxGoalAttempts: 'VITE_MAX_GOAL_ATTEMPTS',
  goalThresholdM: 'VITE_GOAL_THRESHOLD_M',
  startFixMaxAccuracyM: 'VITE_START_FIX_MAX_ACCURACY_M',
  startFixWaitMs: 'VITE_START_FIX_WAIT_MS',
  geolocationTimeoutMs: 'VITE_GEOLOCATION_TIMEOUT_MS',
  simStartLat: 'VITE_SIM_START_LAT',
  simStartLng: 'VITE_SIM_START_LNG',
}

export function loadConfig(env: Record<string, string | boolean | undefined> = import.meta.env): ConfigValidation {
  const raw: RawConfig = {}
  for (const [field, envKey] of Object.entries(ENV_KEYS) as Array<[keyof RawConfig, string]>) {
    const value = env[envKey]
    raw[field] = typeof value === 'string' ? value : undefined
  }
  return validateConfig(raw)
}
