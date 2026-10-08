import { useEffect } from 'react'
import { useGameController } from '../app/useGameController'
import type { GameServices } from '../app/services'
import type { GameConfig } from '../domain/config'
import { MapView } from './MapView'
import { StatusPanel } from './StatusPanel'

const NUDGE_M = 10
const ARROW_BEARINGS: Record<string, number> = { ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 }

export function GameScreen({ config, services }: { config: GameConfig; services: GameServices }) {
  const { state, retry, restart } = useGameController(config, services)
  const { simulator } = services

  // Simulation mode: arrow keys nudge the player.
  useEffect(() => {
    if (!simulator) return
    const onKeyDown = (event: KeyboardEvent) => {
      const bearing = ARROW_BEARINGS[event.key]
      if (bearing === undefined) return
      event.preventDefault()
      simulator.nudge(bearing, NUDGE_M)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [simulator])

  const hasMap = state.phase === 'generatingGoal' || state.phase === 'playing' || state.phase === 'won'

  return (
    <div className="game">
      {simulator && (
        <div className="sim-badge" role="note">
          SIMULATED LOCATION — click the map or use arrow keys to move
        </div>
      )}
      {hasMap && (
        <MapView
          start={state.start.position}
          position={state.phase === 'generatingGoal' ? state.start.position : state.position.position}
          plan={state.phase === 'generatingGoal' ? undefined : state.plan}
          onMapClick={simulator ? (point) => simulator.setPosition(point) : undefined}
        />
      )}
      <StatusPanel state={state} thresholdM={config.goalThresholdM} onRetry={retry} onRestart={restart} />
    </div>
  )
}
