// Core domain types. Pure data only: no React, Leaflet, fetch or browser APIs.

export interface LatLng {
  lat: number
  lng: number
}

/** One position reading from a LocationProvider (real or simulated). */
export interface Fix {
  position: LatLng
  /** Reported horizontal accuracy radius in metres (68% confidence). */
  accuracyM: number
  /** Epoch milliseconds. */
  timestamp: number
}

/** Extend with 'cycling' | 'driving' later; adapters map each mode to a provider profile. */
export type TravelMode = 'walking'

export interface Route {
  distanceM: number
  durationS: number
  /** Polyline along permissible ways, start to end. */
  geometry: LatLng[]
}

/** A point snapped onto the routable network, and how far it moved. */
export interface Snap {
  location: LatLng
  snapDistanceM: number
}

export interface RouteResult {
  /** The provider's primary route plus any alternatives. */
  candidates: Route[]
  snappedFrom: Snap
  snappedTo: Snap
}

/** A validated goal: static for the whole session. */
export interface GoalPlan {
  goal: LatLng
  route: Route
  /** Where the route begins on the network (end of the dashed approach line). */
  routeStart: LatLng
}
