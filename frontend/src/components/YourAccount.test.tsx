import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext } from '../auth/AuthContext'
import { SecondStepCard } from './SecondStepCard'
import { SecondStepPeopleCard } from './SecondStepPeopleCard'
import { CloseAccountCard, MyDataCard } from './MyDataCard'
import { PrivacyDetailsCard } from './PrivacyDetailsCard'

const step = vi.hoisted(() => ({
  fetchMyAuthenticators: vi.fn(),
  beginEnrolment: vi.fn(),
  giveCode: vi.fn(),
  removeAuthenticator: vi.fn(),
  fetchSecondStepPeople: vi.fn(),
  clearSecondStep: vi.fn(),
}))
vi.mock('../lib/secondStep', async (real) => ({ ...(await real<typeof import('../lib/secondStep')>()), ...step }))
const data = vi.hoisted(() => ({
  fetchMyData: vi.fn(),
  fetchMyDataLookups: vi.fn(),
  saveMyData: vi.fn(),
  saveMyDataDocument: vi.fn(),
  deleteMyAccount: vi.fn(),
  leaveAfterClosing: vi.fn(),
}))
vi.mock('../lib/myData', async (real) => ({ ...(await real<typeof import('../lib/myData')>()), ...data }))
const privacy = vi.hoisted(() => ({ fetchPrivacyDetails: vi.fn(), savePrivacyDetails: vi.fn() }))
vi.mock('../lib/privacyDetails', async (real) => ({ ...(await real<typeof import('../lib/privacyDetails')>()), ...privacy }))
vi.mock('../lib/families', async (real) => ({
  ...(await real<typeof import('../lib/families')>()),
  fetchPeopleNames: () => Promise.resolve([{ id: 'u2', first_name: 'Joel', last_name: 'Adeyemi' }, { id: 'me', first_name: 'Grace', last_name: 'Mensah' }]),
}))
vi.mock('./QrCode', () => ({ QrCode: ({ text, label }: { text: string; label: string }) => <p role="img" aria-label={label}>{text}</p> }))
const may = vi.hoisted(() => ({ general: true }))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: (key: string) => key === 'settings.general' && may.general }) }))
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

/*
 * Settings › Your account, and the church's privacy details in General (0334).
 */
function show(ui: React.ReactNode, who: Record<string, unknown> = {}) {
  const value = { session: { user: { id: 'me', email: 'grace@example.com' } }, isAdmin: false, isSuperAdmin: false, viewAs: null, ...who }
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AuthContext.Provider value={value as never}>{ui}</AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  for (const group of [step, data, privacy]) for (const fn of Object.values(group)) fn.mockReset()
  may.general = true
})

describe('a second step at sign-in', () => {
  it('sets one up: a code to scan, the secret to type, and nothing on until the first code is right', async () => {
    step.fetchMyAuthenticators.mockResolvedValue([])
    step.beginEnrolment.mockResolvedValue({ factorId: 'f1', uri: 'otpauth://totp/Church:grace?secret=ABCDEFGH', secret: 'ABCDEFGH' })
    step.giveCode.mockRejectedValueOnce({ message: 'Invalid TOTP code entered' }).mockResolvedValueOnce(undefined)
    show(<SecondStepCard />)
    expect(await screen.findByText('Off. Your password alone signs you in.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Set up an authenticator app' }))
    expect(await screen.findByRole('img', { name: 'A code for your authenticator app to scan' })).toHaveTextContent('otpauth://totp/Church:grace?secret=ABCDEFGH')
    expect(screen.getByText('ABCD EFGH')).toBeInTheDocument()
    const turnOn = screen.getByRole('button', { name: 'Turn it on' })
    expect(turnOn).toBeDisabled()
    const box = screen.getByLabelText('The six digits it shows')
    await userEvent.type(box, '111111')
    await userEvent.click(turnOn)
    expect(await screen.findByRole('alert')).toHaveTextContent(/That code was not accepted/)
    step.fetchMyAuthenticators.mockResolvedValue([{ id: 'f1', since: '2026-11-26T10:00:00Z' }])
    await userEvent.type(box, '222222')
    await userEvent.click(screen.getByRole('button', { name: 'Turn it on' }))
    // The date is written the way the device writes dates.
    expect(await screen.findByText(/On since .*November.*2026/)).toBeInTheDocument()
    expect(step.giveCode).toHaveBeenLastCalledWith('f1', '222222')
  })

  it('takes away a set-up that is cancelled half way', async () => {
    step.fetchMyAuthenticators.mockResolvedValue([])
    step.beginEnrolment.mockResolvedValue({ factorId: 'f1', uri: 'otpauth://x', secret: 'ABCD' })
    step.removeAuthenticator.mockResolvedValue(undefined)
    show(<SecondStepCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Set up an authenticator app' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(step.removeAuthenticator).toHaveBeenCalledWith('f1', expect.anything()))
    expect(await screen.findByRole('button', { name: 'Set up an authenticator app' })).toBeInTheDocument()
  })

  it('turns it off only after being asked twice', async () => {
    step.fetchMyAuthenticators.mockResolvedValue([{ id: 'f1', since: '2026-11-01T10:00:00Z' }])
    step.removeAuthenticator.mockResolvedValue(undefined)
    show(<SecondStepCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn it off' }))
    expect(step.removeAuthenticator).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog', { name: 'Turn the second step off?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn it off' }))
    await waitFor(() => expect(step.removeAuthenticator).toHaveBeenCalledWith('f1', expect.anything()))
  })
})

describe('the Owner clearing somebody else’s', () => {
  it('is not drawn for anybody but the Owner, and asks the database nothing', () => {
    show(<SecondStepPeopleCard />, { isAdmin: true })
    expect(screen.queryByText(/Other people/)).toBeNull()
    expect(step.fetchSecondStepPeople).not.toHaveBeenCalled()
  })

  it('lists who has one by name, the Owner’s own aside, and clears one on a second yes', async () => {
    step.fetchSecondStepPeople.mockResolvedValue(['u2', 'me'])
    step.clearSecondStep.mockResolvedValue(undefined)
    show(<SecondStepPeopleCard />, { isAdmin: true, isSuperAdmin: true })
    expect(await screen.findByText('Joel Adeyemi')).toBeInTheDocument()
    expect(screen.queryByText('Grace Mensah')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Clear Joel Adeyemi’s second step' }))
    expect(step.clearSecondStep).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear it' }))
    await waitFor(() => expect(step.clearSecondStep).toHaveBeenCalledWith('u2', expect.anything()))
  })

  it('says so when nobody else has one', async () => {
    step.fetchSecondStepPeople.mockResolvedValue(['me'])
    show(<SecondStepPeopleCard />, { isSuperAdmin: true })
    expect(await screen.findByText('Nobody else has set one up.')).toBeInTheDocument()
  })
})

describe('a copy of what is kept', () => {
  const answer = { tables: { profiles: [{ first_name: 'Grace' }], messages: [{ body: 'one' }, { body: 'two' }] } }
  const emptyLookups = { team: new Map(), service: new Map(), role: new Map(), person: new Map(), session: new Map(), me: 'me' }

  it('saves a document a person can read, under the reader’s name, and says what is in it', async () => {
    data.fetchMyData.mockResolvedValue(answer)
    data.fetchMyDataLookups.mockResolvedValue(emptyLookups)
    show(<MyDataCard />, { profile: { first_name: 'Grace', last_name: 'Mensah' } })
    await userEvent.click(screen.getByRole('button', { name: 'Download a copy' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved as my-data-\d{4}-\d{2}-\d{2}\.html: 3 entries under 2 headings\. Open it from your downloads/)
    const [doc, who] = data.saveMyDataDocument.mock.calls[0]
    expect(who).toBe('Grace Mensah')
    expect(doc.sections.map((s: { title: string }) => s.title)).toEqual(['Your profile', 'Messages you posted'])
    // The names of teams and services are looked up for the reader, by their own id.
    expect(data.fetchMyDataLookups).toHaveBeenCalledWith('me')
    expect(data.saveMyData).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'What the app keeps, and for how long' })).toHaveAttribute('href', '/privacy')
  })

  it('still offers the database’s own rows, for whoever wants every column', async () => {
    data.fetchMyData.mockResolvedValue(answer)
    show(<MyDataCard />)
    await userEvent.click(screen.getByRole('button', { name: 'As a data file' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved as my-data-\d{4}-\d{2}-\d{2}\.json: 3 entries under 2 headings\. It opens in any text editor/)
    expect(data.saveMyData).toHaveBeenCalledWith(answer, expect.any(Date))
    expect(data.saveMyDataDocument).not.toHaveBeenCalled()
    expect(data.fetchMyDataLookups).not.toHaveBeenCalled()
  })

  it('says so when the copy could not be made', async () => {
    data.fetchMyData.mockRejectedValue({ code: 'P0001', message: 'Sign in first.' })
    show(<MyDataCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Download a copy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in first.')
    expect(data.saveMyDataDocument).not.toHaveBeenCalled()
  })
})

describe('removing your own account', () => {
  it('does nothing until the account’s own email address is typed', async () => {
    data.deleteMyAccount.mockResolvedValue(undefined)
    show(<CloseAccountCard />)
    const button = screen.getByRole('button', { name: 'Remove my account' })
    expect(button).toBeDisabled()
    const box = screen.getByLabelText(/Type your email address to confirm/)
    await userEvent.type(box, 'somebody@else.com')
    expect(button).toBeDisabled()
    await userEvent.clear(box)
    await userEvent.type(box, 'Grace@Example.com')
    expect(button).toBeEnabled()
    await userEvent.click(button)
    await waitFor(() => expect(data.leaveAfterClosing).toHaveBeenCalledTimes(1))
    expect(data.deleteMyAccount).toHaveBeenCalledWith('Grace@Example.com')
  })

  it('shows the database’s refusal and leaves the person where they are', async () => {
    data.deleteMyAccount.mockRejectedValue({ code: 'P0001', message: 'That is not the email address of this account, so nothing was removed.' })
    show(<CloseAccountCard />)
    await userEvent.type(screen.getByLabelText(/Type your email address to confirm/), 'grace@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Remove my account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was removed/)
    expect(data.leaveAfterClosing).not.toHaveBeenCalled()
  })

  it('tells the Owner to hand the app on first, and offers no box', () => {
    show(<CloseAccountCard />, { isSuperAdmin: true })
    expect(screen.getByText(/Hand it to somebody else first/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove my account' })).toBeNull()
  })

  it('is not offered inside a preview: the account that would go is the previewer’s own', () => {
    show(<CloseAccountCard />, { viewAs: { as: 'church' } })
    expect(screen.getByText(/Leave the preview to remove your own account/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove my account' })).toBeNull()
  })
})

describe('what the church says about itself on the privacy page', () => {
  it('shows what is saved, saves a change trimmed, and will not send a bad address', async () => {
    privacy.fetchPrivacyDetails.mockResolvedValue({ contact_name: 'The office' })
    privacy.savePrivacyDetails.mockImplementation((d: unknown) => Promise.resolve(d))
    show(<PrivacyDetailsCard />)
    expect(await screen.findByLabelText(/Who to ask/)).toHaveValue('The office')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const email = screen.getByLabelText('Their email address')
    await userEvent.type(email, 'not an address')
    expect(screen.getByText('That does not look like an email address.')).toBeInTheDocument()
    expect(save).toBeDisabled()
    await userEvent.clear(email)
    await userEvent.type(email, ' office@church.test ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(privacy.savePrivacyDetails).toHaveBeenCalledWith({ contact_name: 'The office', contact_email: 'office@church.test' }))
  })

  it('is not drawn for somebody who may not change General', () => {
    may.general = false
    show(<PrivacyDetailsCard />)
    expect(screen.queryByText(/On the page about what is kept/)).toBeNull()
    expect(privacy.fetchPrivacyDetails).not.toHaveBeenCalled()
  })
})
