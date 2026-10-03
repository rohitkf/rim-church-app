import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { QrCode } from '../components/QrCode'
import { PageHeader, Panel, Tile } from '../components/Surface'
import {
  formatIban,
  formatSortCode,
  isEmptyGiving,
  isSafeLink,
  useGiving,
  useGivingQrImage,
  type BankAccount,
  type GivingLink,
} from '../lib/giving'

/**
 * Tithes and offerings — how to give, for every member signed in.
 *
 * Three ways, each only when the church has set it up in App settings:
 *   - links to wherever it takes card payments (a Stripe Payment Link,
 *     PayPal, a giving platform), each a button and a QR code, so
 *     somebody at the back of the hall can scan the screen at the front;
 *   - a QR picture the church was given by its bank or provider;
 *   - its bank accounts, with every number copyable, because a sort code
 *     retyped from a phone is where a payment goes astray.
 *
 * Nothing is paid here. A link opens the provider's page, which is where
 * Apple Pay and Google Pay are offered and where the card details go.
 */
export function GivingPage() {
  const { isAdmin } = useAuth()
  const giving = useGiving()

  return (
    <div>
      <PageHeader
        eyebrow="Tithes & offerings"
        title="Giving"
        description={
          giving.data?.page.intro ??
          'Thank you for giving. Choose whichever way suits you — every one reaches the church directly.'
        }
      />

      <QueryState isLoading={giving.isLoading} error={giving.error}>
        {giving.data && isEmptyGiving(giving.data) ? (
          <Tile>
            <p className="text-body-md text-on-surface">Nothing has been set up here yet.</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {isAdmin ? (
                <>
                  Add the church’s bank details and giving links in{' '}
                  <Link to="/settings/giving" className="text-secondary">
                    Settings › Giving
                  </Link>
                  .
                </>
              ) : (
                'Ask somebody at church how to give for now.'
              )}
            </p>
          </Tile>
        ) : (
          giving.data && (
            <div className="flex flex-col gap-6">
              {(giving.data.links.length > 0 || giving.data.page.qr_image_path) && (
                <Panel title="Give online">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {giving.data.links.map((link) => (
                      <LinkCard key={link.id} link={link} />
                    ))}
                    {giving.data.page.qr_image_path && (
                      <UploadedQr
                        path={giving.data.page.qr_image_path}
                        caption={giving.data.page.qr_image_caption}
                      />
                    )}
                  </div>
                </Panel>
              )}

              {giving.data.accounts.length > 0 && (
                <Panel title="Bank transfer">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {giving.data.accounts.map((account) => (
                      <AccountCard key={account.id} account={account} />
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          )
        )}
      </QueryState>
    </div>
  )
}

export function LinkCard({ link }: { link: GivingLink }) {
  // The database only stores https links (0108); this is the belt to its
  // braces, so a row that somehow is not one is never a button.
  if (!isSafeLink(link.url)) return null
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-chip)] bg-surface-container p-5 text-center">
      <div>
        <h3 className="text-headline-sm text-on-surface">{link.label}</h3>
        {link.note && <p className="mt-1 text-body-sm text-on-surface-variant">{link.note}</p>}
      </div>
      {link.show_qr && (
        <QrCode
          text={link.url}
          label={`QR code for ${link.label}`}
          className="h-44 w-44 rounded-[var(--radius-chip)]"
        />
      )}
      {/* The button is for whoever cannot scan — or is already on the
          phone the code would open. */}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="tap inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-3 text-body-sm font-medium text-on-primary hover:opacity-90"
      >
        {link.label} <span aria-hidden="true">↗</span>
      </a>
    </div>
  )
}

export function UploadedQr({ path, caption }: { path: string; caption: string | null }) {
  const image = useGivingQrImage(path)
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-chip)] bg-surface-container p-5 text-center">
      <h3 className="text-headline-sm text-on-surface">{caption || 'Scan to give'}</h3>
      {image.data ? (
        <img
          src={image.data}
          alt={caption ? `QR code: ${caption}` : 'QR code to give'}
          className="h-44 w-44 rounded-[var(--radius-chip)] bg-white object-contain p-2"
        />
      ) : (
        <div aria-hidden="true" className="h-44 w-44 animate-pulse rounded-[var(--radius-chip)] bg-surface-low" />
      )}
    </div>
  )
}

export function AccountCard({ account }: { account: BankAccount }) {
  const rows: [string, string | null][] = [
    ['Account name', account.account_name],
    ['Sort code', account.sort_code ? formatSortCode(account.sort_code) : null],
    ['Account number', account.account_number],
    ['IBAN', account.iban ? formatIban(account.iban) : null],
    ['BIC / SWIFT', account.bic ? account.bic.toUpperCase() : null],
    ['Reference', account.reference],
  ]
  return (
    <div className="rounded-[var(--radius-chip)] bg-surface-container p-5">
      <h3 className="text-headline-sm text-on-surface">{account.label}</h3>
      {account.bank_name && <p className="text-body-sm text-on-surface-variant">{account.bank_name}</p>}
      <dl className="mt-4 flex flex-col gap-3">
        {rows
          .filter((row): row is [string, string] => !!row[1])
          .map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="font-mono text-label-sm uppercase text-on-surface-faint">{label}</dt>
                <dd className="break-words font-mono text-body-md text-on-surface">{value}</dd>
              </div>
              <CopyButton value={value} what={label} />
            </div>
          ))}
      </dl>
      {account.notes && <p className="mt-4 text-body-sm text-on-surface-variant">{account.notes}</p>}
    </div>
  )
}

/** Copy one detail, so nobody has to retype a sort code from a screen. */
function CopyButton({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value.replace(/\s+/g, what === 'Account name' || what === 'Reference' ? ' ' : ''))
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
      className="tap shrink-0 rounded-full px-3 py-1.5 text-label-md text-secondary hairline hover:bg-surface-low"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
