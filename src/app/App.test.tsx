import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('starts the game and reports unsupported location when the API is missing (jsdom has none)', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Location not supported' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
