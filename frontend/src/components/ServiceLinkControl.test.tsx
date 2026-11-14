import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServiceLinkControl, ServiceLinkPill } from './ServiceLinkControl'

const live = { link: 'https://example.org/live', link_label: 'Livestream' }

function control(props: Partial<Parameters<typeof ServiceLinkControl>[0]> = {}) {
  const onSave = vi.fn((_patch: unknown, done: () => void) => done())
  render(<ServiceLinkControl service={null} canEdit busy={false} error={null} onSave={onSave} {...props} />)
  return onSave
}

describe('a service’s link on its card', () => {
  it('opens the address in a new tab, under the name it was given', () => {
    render(<ServiceLinkPill service={live} />)
    const link = screen.getByRole('link', { name: /Livestream/ })
    expect(link).toHaveAttribute('href', 'https://example.org/live')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('draws nothing for a service without one', () => {
    const { container } = render(<ServiceLinkPill service={{ link: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('a service’s link in the Service Planner', () => {
  it('shows only the link to somebody who cannot plan the service', () => {
    control({ service: live, canEdit: false })
    expect(screen.getByRole('link', { name: /Livestream/ })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing at all when there is no link and no right to add one', () => {
    const { container } = render(
      <ServiceLinkControl service={null} canEdit={false} busy={false} error={null} onSave={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('saves the address and its name, giving a bare www. address https', async () => {
    const user = userEvent.setup()
    const onSave = control()
    await user.click(screen.getByRole('button', { name: '+ Add a link' }))
    await user.type(screen.getByLabelText('Web address'), 'www.example.org/live')
    await user.type(screen.getByLabelText(/What to call it/), 'Livestream')
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    expect(onSave).toHaveBeenCalledWith(
      { link: 'https://www.example.org/live', link_label: 'Livestream' },
      expect.any(Function),
    )
    // Saved: the sheet has closed.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the link with one press of a usual name, and lets go on a second', async () => {
    const user = userEvent.setup()
    const onSave = control()
    await user.click(screen.getByRole('button', { name: '+ Add a link' }))
    await user.type(screen.getByLabelText('Web address'), 'https://example.org/live')
    const zoom = screen.getByRole('button', { name: 'Zoom' })
    await user.click(zoom)
    expect(screen.getByLabelText(/What to call it/)).toHaveValue('Zoom')
    expect(zoom).toHaveAttribute('aria-pressed', 'true')
    await user.click(zoom)
    expect(screen.getByLabelText(/What to call it/)).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Slides' }))
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    expect(onSave).toHaveBeenCalledWith({ link: 'https://example.org/live', link_label: 'Slides' }, expect.any(Function))
  })

  it('says what is wrong with an address that is not one, and saves nothing', async () => {
    const user = userEvent.setup()
    const onSave = control()
    await user.click(screen.getByRole('button', { name: '+ Add a link' }))
    await user.type(screen.getByLabelText('Web address'), 'the usual place')
    await user.click(screen.getByRole('button', { name: 'Save link' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/That is not a web address/)).toBeInTheDocument()
    expect(screen.getByLabelText('Web address')).toHaveAttribute('aria-invalid', 'true')
  })

  it('opens on what is already there, and can take it away', async () => {
    const user = userEvent.setup()
    const onSave = control({ service: live })
    await user.click(screen.getByRole('button', { name: 'Change link' }))
    expect(screen.getByLabelText('Web address')).toHaveValue('https://example.org/live')
    expect(screen.getByLabelText(/What to call it/)).toHaveValue('Livestream')
    await user.click(screen.getByRole('button', { name: 'Remove link' }))
    expect(onSave).toHaveBeenCalledWith({ link: null, link_label: null }, expect.any(Function))
  })
})
