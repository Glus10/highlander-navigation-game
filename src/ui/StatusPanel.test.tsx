import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../domain/game'
import { LONDON, makeFix, makePlan } from '../test/factories'
import { StatusPanel } from './StatusPanel'

const start = makeFix(LONDON, 20)
const plan = makePlan(LONDON, 500)

function renderPanel(state: GameState) {
  const onRetry = vi.fn()
  const onRestart = vi.fn()
  render(<StatusPanel state={state} thresholdM={25} onRetry={onRetry} onRestart={onRestart} />)
  return { onRetry, onRestart }
}

describe('StatusPanel (I-06)', () => {
  it.each([
    ['denied', 'Location permission denied'],
    ['unavailable', 'Location unavailable'],
    ['timeout', 'Location timed out'],
    ['unsupported', 'Location not supported'],
  ] as const)('shows guidance and Retry for location error %s', (error, title) => {
    const { onRetry } = renderPanel({ phase: 'locationError', sessionId: 1, error })
    expect(screen.getByRole('alert')).toHaveTextContent(title)
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows goal-generation failure and routing errors with Retry', () => {
    renderPanel({ phase: 'goalGenerationFailed', sessionId: 1, attempts: 5 })
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't place a goal")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows routing unavailable', () => {
    renderPanel({ phase: 'routingError', sessionId: 1, error: 'timeout' })
    expect(screen.getByRole('alert')).toHaveTextContent('Routing unavailable')
  })

  it('shows distance while playing, and the low-accuracy warning when flagged', () => {
    renderPanel({ phase: 'playing', sessionId: 1, start, lowAccuracy: true, plan, position: start })
    expect(screen.getByRole('status')).toHaveTextContent('500 m to the goal')
    expect(screen.getByRole('status')).toHaveTextContent('Low location accuracy')
  })

  it('shows "Goal reached!" with a restart button when won', () => {
    const { onRestart } = renderPanel({
      phase: 'won',
      sessionId: 1,
      start,
      lowAccuracy: false,
      plan,
      position: start,
      reachedAt: 1,
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Goal reached!')
    screen.getByRole('button', { name: 'Play again' }).click()
    expect(onRestart).toHaveBeenCalledOnce()
  })
})
