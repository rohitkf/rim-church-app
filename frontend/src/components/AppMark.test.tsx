import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppMark } from './AppMark'

const logo = vi.fn()
vi.mock('../lib/appLogo', () => ({
  BRANDING_BUCKET: 'branding',
  useAppLogo: () => logo(),
}))

describe('the mark at the top of the page', () => {
  it('draws the church’s logo when there is one', () => {
    logo.mockReturnValue({ path: 'logo/abc.png', url: 'https://signed/logo.png' })
    render(<AppMark />)
    const img = screen.getByRole('presentation', { hidden: true })
    expect(img).toHaveAttribute('src', 'https://signed/logo.png')
    // Fitted, never cropped: a wordmark squeezed into a square is not
    // the logo anybody uploaded.
    expect(img).toHaveClass('object-contain')
  })

  /*
   * The alignment bug this exists for. The mark used to be drawn into a
   * 36-pixel *square*, so a wide wordmark fitted into it came out as an
   * eight-pixel strip floating in the middle of the box — which is what
   * "the logo doesn't line up with the rest of the nav" looked like.
   * Height fixed and width free is the only measurement that holds for
   * every shape somebody might upload.
   */
  it('stands the same height as everything else, whatever shape it is', () => {
    logo.mockReturnValue({ path: 'logo/wide.png', url: 'https://signed/wide.png' })
    render(<AppMark />)
    const img = screen.getByRole('presentation', { hidden: true })
    expect(img).toHaveClass('h-9')
    expect(img).toHaveClass('w-auto')
    expect(img.className).not.toMatch(/\bw-9\b/)
  })

  /*
   * The drawn tile is not a placeholder to be ashamed of — it is what
   * every church sees before it has thought about a logo, and what this
   * one goes back to the moment the owner takes theirs down.
   */
  it('draws its own when there is not', () => {
    logo.mockReturnValue({ path: null, url: null })
    render(<AppMark />)
    expect(screen.getByText('RIM')).toBeInTheDocument()
    expect(screen.queryByRole('presentation', { hidden: true })).toBeNull()
  })

  it('falls back when the logo is set but could not be signed', () => {
    // A URL that could not be had is the same situation as no logo: the
    // header still has to draw something.
    logo.mockReturnValue({ path: 'logo/abc.png', url: null })
    render(<AppMark />)
    expect(screen.getByText('RIM')).toBeInTheDocument()
  })
})
