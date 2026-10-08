// Leaflet marker icons built from the supplied assets.
// The supplied files are JPEGs with a painted (fake) transparency checkerboard, so they are
// cropped with CSS (see styles.css: .ball-icon / .goal-icon) instead of being used as raw icons.

import L from 'leaflet'

const BALL_SIZE = 36
const GOAL_WIDTH = 56
const GOAL_HEIGHT = 26

export const ballIcon = L.divIcon({
  className: 'ball-marker',
  html: '<div class="ball-icon" role="img" aria-label="Player"></div>',
  iconSize: [BALL_SIZE, BALL_SIZE],
  iconAnchor: [BALL_SIZE / 2, BALL_SIZE / 2],
})

export const goalIcon = L.divIcon({
  className: 'goal-marker',
  html: '<div class="goal-icon" role="img" aria-label="Goal"></div>',
  iconSize: [GOAL_WIDTH, GOAL_HEIGHT],
  iconAnchor: [GOAL_WIDTH / 2, GOAL_HEIGHT / 2],
})
