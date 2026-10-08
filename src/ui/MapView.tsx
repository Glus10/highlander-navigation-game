import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { GoalPlan, LatLng } from '../domain/types'
import { ballIcon, goalIcon } from './markers'

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
  ' | <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>' +
  ' | Routing: <a href="https://routing.openstreetmap.de/about.html">OSRM by FOSSGIS</a>'

interface MapViewProps {
  position: LatLng
  start: LatLng
  plan?: GoalPlan
  /** Simulation mode only: move the player to the clicked point. */
  onMapClick?: (point: LatLng) => void
}

/** Frames the start before a goal exists, then the whole route once it does. */
function FitView({ start, plan }: { start: LatLng; plan?: GoalPlan }) {
  const map = useMap()
  useEffect(() => {
    if (plan) {
      map.fitBounds([start, plan.goal, ...plan.route.geometry].map((p) => [p.lat, p.lng]), { padding: [48, 48] })
    } else {
      map.setView([start.lat, start.lng], 16)
    }
  }, [map, start, plan])
  return null
}

function ClickHandler({ onMapClick }: { onMapClick: (point: LatLng) => void }) {
  useMapEvents({ click: (event) => onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng }) })
  return null
}

export function MapView({ position, start, plan, onMapClick }: MapViewProps) {
  return (
    <MapContainer center={[start.lat, start.lng]} zoom={16} className="map" data-testid="map">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={ATTRIBUTION} maxZoom={19} />
      <FitView start={start} plan={plan} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {plan && (
        <>
          {/* Visual guidance only: start position → where the walking route begins. Never part of the route. */}
          <Polyline
            positions={[start, plan.routeStart]}
            className="approach-line"
            pathOptions={{ color: '#555', weight: 3, dashArray: '6 8' }}
          />
          <Polyline
            positions={plan.route.geometry}
            className="route-line"
            pathOptions={{ color: '#1565c0', weight: 6, opacity: 0.85 }}
          />
          {/* Non-interactive so simulation clicks on the goal reach the map. */}
          <Marker position={plan.goal} icon={goalIcon} interactive={false} />
        </>
      )}
      <Marker position={position} icon={ballIcon} interactive={false} zIndexOffset={1000} />
    </MapContainer>
  )
}
