import type { GameState } from '../domain/game'
import { haversineM } from '../domain/geo'
import type { LocationErrorKind, RoutingErrorKind } from '../domain/ports'

const LOCATION_ERRORS: Record<LocationErrorKind, { title: string; help: string }> = {
  denied: {
    title: 'Location permission denied',
    help: 'Allow location for this site in your browser settings (and for the browser in your OS privacy settings), then press Retry.',
  },
  unavailable: {
    title: 'Location unavailable',
    help: 'Your device could not determine its position. Check that location services are enabled, then press Retry.',
  },
  timeout: {
    title: 'Location timed out',
    help: 'No position was received in time. Move to a spot with better signal or Wi-Fi, then press Retry.',
  },
  unsupported: {
    title: 'Location not supported',
    help: 'This browser cannot provide location here. Open the app on http://localhost or https in a modern browser.',
  },
}

const ROUTING_ERRORS: Record<RoutingErrorKind, string> = {
  noRoute: 'No walking route could be found.',
  invalidInput: 'The routing service rejected the request.',
  unavailable: 'The routing service is unavailable.',
  timeout: 'The routing service did not respond in time.',
  rateLimited: 'The routing service is rate-limiting requests.',
}

interface StatusPanelProps {
  state: GameState
  thresholdM: number
  onRetry: () => void
  onRestart: () => void
}

export function StatusPanel({ state, thresholdM, onRetry, onRestart }: StatusPanelProps) {
  switch (state.phase) {
    case 'idle':
    case 'acquiringLocation':
      return (
        <section className="panel" role="status">
          <h1>Finding your location…</h1>
          <p>Allow location access when your browser asks.</p>
        </section>
      )

    case 'generatingGoal':
      return (
        <section className="panel" role="status">
          <h1>Placing the goal…</h1>
          {state.lowAccuracy && <LowAccuracy accuracyM={state.start.accuracyM} />}
        </section>
      )

    case 'playing': {
      const distanceM = haversineM(state.position.position, state.plan.goal)
      return (
        <section className="panel" role="status">
          <h1>Reach the goal!</h1>
          <p>
            <strong>{Math.round(distanceM)} m</strong> to the goal (straight line) · route{' '}
            {Math.round(state.plan.route.distanceM)} m · reach within {thresholdM} m
          </p>
          {state.lowAccuracy && <LowAccuracy accuracyM={state.start.accuracyM} />}
          <button type="button" onClick={onRestart}>
            Restart
          </button>
        </section>
      )
    }

    case 'won':
      return (
        <section className="panel panel-won" role="alert">
          <h1>Goal reached!</h1>
          <button type="button" onClick={onRestart}>
            Play again
          </button>
        </section>
      )

    case 'locationError': {
      const { title, help } = LOCATION_ERRORS[state.error]
      return <ErrorPanel title={title} help={help} onRetry={onRetry} />
    }

    case 'goalGenerationFailed':
      return (
        <ErrorPanel
          title="Couldn't place a goal"
          help={`No reachable walking goal was found after ${state.attempts} attempts. The area may have too few walkable paths.`}
          onRetry={onRetry}
        />
      )

    case 'routingError':
      return <ErrorPanel title="Routing unavailable" help={ROUTING_ERRORS[state.error]} onRetry={onRetry} />
  }
}

function LowAccuracy({ accuracyM }: { accuracyM: number }) {
  return <p className="warning">Low location accuracy (±{Math.round(accuracyM)} m). The start position may be off.</p>
}

function ErrorPanel({ title, help, onRetry }: { title: string; help: string; onRetry: () => void }) {
  return (
    <section className="panel panel-error" role="alert">
      <h1>{title}</h1>
      <p>{help}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  )
}
