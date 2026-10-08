import { useState } from 'react'
import { GameScreen } from '../ui/GameScreen'
import { loadConfig } from './config'
import { createServices } from './services'

export default function App() {
  const [configResult] = useState(() => loadConfig())

  if (!configResult.ok) {
    return (
      <main className="panel panel-error" role="alert">
        <h1>Invalid configuration</h1>
        <ul>
          {configResult.errors.map((error) => (
            <li key={error.field}>
              {error.field}: {error.message}
            </li>
          ))}
        </ul>
      </main>
    )
  }

  return <ConfiguredApp config={configResult.config} />
}

function ConfiguredApp({ config }: { config: Parameters<typeof createServices>[0] }) {
  // Created once per page load; ?simulate=1 is read here.
  const [services] = useState(() => createServices(config, window.location.search))
  return <GameScreen config={config} services={services} />
}
