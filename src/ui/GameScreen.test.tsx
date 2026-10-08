import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SimulatedLocationProvider } from '../adapters/simulatedLocationProvider'
import { DEFAULT_CONFIG } from '../domain/config'
import { createSeededRng } from '../domain/random'
import { DeferredRoutingProvider, FakeLocationProvider } from '../test/fakes'
import { LONDON } from '../test/factories'
import { GameScreen } from './GameScreen'

describe('GameScreen simulation badge (I-07)', () => {
  it('shows the SIMULATED LOCATION badge in simulation mode', () => {
    const simulator = new SimulatedLocationProvider(LONDON)
    render(
      <GameScreen
        config={DEFAULT_CONFIG}
        services={{ location: simulator, simulator, routing: new DeferredRoutingProvider(), rng: createSeededRng(1) }}
      />,
    )
    expect(screen.getByRole('note')).toHaveTextContent('SIMULATED LOCATION')
  })

  it('has no badge without the simulator', () => {
    render(
      <GameScreen
        config={DEFAULT_CONFIG}
        services={{ location: new FakeLocationProvider(), routing: new DeferredRoutingProvider(), rng: createSeededRng(1) }}
      />,
    )
    expect(screen.queryByText(/SIMULATED LOCATION/)).not.toBeInTheDocument()
  })
})
