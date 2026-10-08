/// <reference types="node" />
// Vite's dev server refuses to serve .env* files, so this sync check reads .env.example from disk.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../domain/config'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('uses the approved defaults when no variables are set', () => {
    expect(loadConfig({})).toEqual({ ok: true, config: DEFAULT_CONFIG })
  })

  it('maps VITE_* variables onto config fields', () => {
    const result = loadConfig({
      VITE_OSRM_FOOT_URL: 'http://localhost:5000',
      VITE_GOAL_THRESHOLD_M: '30',
      VITE_SIM_START_LAT: '32.08',
      VITE_SIM_START_LNG: '34.78',
    })
    expect(result.ok && result.config).toMatchObject({
      osrmFootUrl: 'http://localhost:5000',
      goalThresholdM: 30,
      simStart: { lat: 32.08, lng: 34.78 },
    })
  })

  it('surfaces validation errors', () => {
    expect(loadConfig({ VITE_GOAL_THRESHOLD_M: '400' })).toMatchObject({
      ok: false,
      errors: [{ field: 'goalThresholdM' }],
    })
  })

  it('accepts .env.example as-is and it matches the defaults', () => {
    const env = Object.fromEntries(
      readFileSync('.env.example', 'utf8')
        .split('\n')
        .filter((line) => /^VITE_\w+=/.test(line))
        .map((line) => line.split('=', 2) as [string, string]),
    )
    expect(Object.keys(env)).toHaveLength(13)
    expect(loadConfig(env)).toEqual({ ok: true, config: DEFAULT_CONFIG })
  })
})
