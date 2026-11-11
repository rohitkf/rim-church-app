import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationsCard } from './NotificationsCard'

// The push row talks to the browser and the database; its own tests cover it.
vi.mock('./PushPermission', () => ({ PushPermissionRow: () => <p>push row</p> }))
vi.mock('./PushPreferences', () => ({ PushPreferences: () => <p>push choices</p> }))

describe('Notifications', () => {
  it('turns phone notifications on, and chooses what reaches the phone', () => {
    render(<NotificationsCard />)
    expect(screen.getByRole('heading', { name: 'Phone notifications' })).toBeInTheDocument()
    expect(screen.getByText('push row')).toBeInTheDocument()
    expect(screen.getByText('push choices')).toBeInTheDocument()
  })
})
