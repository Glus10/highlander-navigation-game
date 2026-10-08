import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Recorded FOSSGIS OSRM response (London): snapped start → goal ~399 m away, route 488.1 m.
const ROUTE_FIXTURE = readFileSync('src/adapters/__fixtures__/osrm-route-one-route.json', 'utf8')
const [startLng, startLat] = JSON.parse(ROUTE_FIXTURE).waypoints[0].location as [number, number]
const SIM_URL = `/?simulate=1&lat=${startLat}&lng=${startLng}`

async function stubNetwork(page: Page, routeStatus = 200) {
  // Keep E2E deterministic: no live tiles or routing.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort())
  await page.route('**/route/v1/**', (route) =>
    routeStatus === 200
      ? route.fulfill({ status: 200, contentType: 'application/json', body: ROUTE_FIXTURE })
      : route.fulfill({ status: routeStatus, body: 'error' }),
  )
}

test('simulated player reaches the generated goal along the walking route (E-01)', async ({ page }) => {
  await stubNetwork(page)
  await page.goto(SIM_URL)

  await expect(page.getByRole('note')).toContainText('SIMULATED LOCATION')
  await expect(page.getByRole('heading', { name: 'Reach the goal!' })).toBeVisible()
  await expect(page.locator('.ball-icon')).toBeVisible()
  await expect(page.locator('.goal-icon')).toBeVisible()
  await expect(page.locator('path.route-line')).toHaveCount(1)
  await expect(page.locator('path.approach-line')).toHaveCount(1)
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
  await expect(page.locator('.leaflet-control-attribution')).toContainText('Fix the map')

  // Arrow-key nudge moves the player (distance text changes).
  const status = page.getByRole('status')
  const before = await status.textContent()
  await page.keyboard.press('ArrowUp')
  await expect(status).not.toHaveText(before ?? '')

  // Click the goal (non-interactive marker → map click → simulator moves there).
  const box = await page.locator('.goal-marker').boundingBox()
  if (!box) throw new Error('goal marker not rendered')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(page.getByRole('heading', { name: 'Goal reached!' })).toBeVisible()
  // Restart opens a new session. (The fixed fixture can't yield a valid goal from the new
  // position, so only assert that the won state was left.)
  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page.getByRole('heading', { name: 'Goal reached!' })).toHaveCount(0)
})

test('real browser location provider starts the game at the host position (E-02)', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: startLat, longitude: startLng, accuracy: 15 })
  await stubNetwork(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Reach the goal!' })).toBeVisible()
  await expect(page.locator('.goal-icon')).toBeVisible()
  await expect(page.getByText(/SIMULATED LOCATION/)).toHaveCount(0)
})

test('location permission denied shows guidance and no game (E-03)', async ({ page }) => {
  await stubNetwork(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Location permission denied' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(page.locator('.goal-icon')).toHaveCount(0)
})

test('routing failure shows an error and draws no route (E-04)', async ({ page }) => {
  await stubNetwork(page, 500)
  await page.goto(SIM_URL)
  await expect(page.getByRole('heading', { name: 'Routing unavailable' })).toBeVisible()
  await expect(page.locator('path.route-line')).toHaveCount(0)
})
