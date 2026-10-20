import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/render'
import { Home } from '../Home'

describe('Home', () => {
  it("shows the signed-in user's name, username and email", async () => {
    renderWithProviders(<Home />)

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('@ada')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('links to sign out', async () => {
    renderWithProviders(<Home />)

    expect(await screen.findByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '/sign-out')
  })
})
