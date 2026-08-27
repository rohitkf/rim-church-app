import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HandbookUploadModal } from './HandbookUploadModal'
import { HANDBOOK_MAX_BYTES } from '../lib/handbookFile'

const upload = vi.fn(() => Promise.resolve({ error: null }))

// The modal asks who is looking, to decide how blunt an error should be.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => upload(...(args as [])),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}))

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <HandbookUploadModal
        departmentId="dept-1"
        departmentName="Media"
        currentPath={null}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const fileOf = (name: string, size: number) => {
  const f = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('HandbookUploadModal', () => {
  it('offers the drop zone with the rules stated', () => {
    renderModal()
    expect(screen.getByText(/drag the handbook here/i)).toBeInTheDocument()
    expect(screen.getByText(/PDF or \.docx · max 30 MB/i)).toBeInTheDocument()
  })

  it('refuses a file of the wrong type without attempting an upload', async () => {
    const user = renderModal()
    await user.upload(screen.getByLabelText(/browse/i), fileOf('notes.txt', 1024))
    expect(await screen.findByText(/isn’t allowed/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses a file over the size limit and names the size', async () => {
    const user = renderModal()
    await user.upload(screen.getByLabelText(/browse/i), fileOf('big.pdf', HANDBOOK_MAX_BYTES + 1))
    expect(await screen.findByText(/the limit is 30 MB/i)).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploads an acceptable file and reports success', async () => {
    const user = renderModal()
    await user.upload(screen.getByLabelText(/browse/i), fileOf('Handbook.pdf', 2048))
    expect(await screen.findByText(/handbook uploaded/i)).toBeInTheDocument()
    expect(upload).toHaveBeenCalledWith(
      'dept-1/handbook.pdf',
      expect.anything(),
      expect.objectContaining({ upsert: true, contentType: 'application/pdf' }),
    )
  })
})
