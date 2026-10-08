import { describe, expect, it } from 'vitest'
import { BrowserLocationProvider } from '../adapters/browserLocationProvider'
import { OsrmRoutingProvider } from '../adapters/osrmRoutingProvider'
import { SimulatedLocationProvider } from '../adapters/simulatedLocationProvider'
import { DEFAULT_CONFIG } from '../domain/config'
import { createServices, parseSimulation } from './services'

const DEFAULT_START = DEFAULT_CONFIG.simStart

describe('parseSimulation', () => {
  it.each(['', '?simulate=0', '?simulate=yes', '?lat=1&lng=2'])('is disabled for "%s"', (search) => {
    expect(parseSimulation(search, DEFAULT_START)).toEqual({ enabled: false })
  })

  it.each(['?simulate=1', '?simulate=true'])('is enabled for "%s" with the default start', (search) => {
    expect(parseSimulation(search, DEFAULT_START)).toEqual({ enabled: true, start: DEFAULT_START })
  })

  it('uses lat/lng URL parameters when valid', () => {
    expect(parseSimulation('?simulate=1&lat=32.08&lng=34.78', DEFAULT_START)).toEqual({
      enabled: true,
      start: { lat: 32.08, lng: 34.78 },
    })
  })

  it.each(['?simulate=1&lat=95&lng=0', '?simulate=1&lat=abc&lng=1', '?simulate=1&lat=10'])(
    'falls back to the default start for invalid coordinates "%s"',
    (search) => {
      expect(parseSimulation(search, DEFAULT_START)).toEqual({ enabled: true, start: DEFAULT_START })
    },
  )
})

describe('createServices', () => {
  it('uses the browser location provider by default', () => {
    const services = createServices(DEFAULT_CONFIG, '')
    expect(services.location).toBeInstanceOf(BrowserLocationProvider)
    expect(services.routing).toBeInstanceOf(OsrmRoutingProvider)
    expect(services.simulator).toBeUndefined()
  })

  it('uses the simulator as the location provider when simulation is enabled', () => {
    const services = createServices(DEFAULT_CONFIG, '?simulate=1&lat=10&lng=20')
    expect(services.location).toBeInstanceOf(SimulatedLocationProvider)
    expect(services.simulator).toBe(services.location)
    expect(services.simulator?.getPosition()).toEqual({ lat: 10, lng: 20 })
  })
})
