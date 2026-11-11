import { PushPermissionRow } from './PushPermission'
import { PushPreferences } from './PushPreferences'
import { BellIcon } from './icons'
import { Tile } from './Surface'

/**
 * Whether the app may reach your phone, and with what.
 *
 * It shared a room with the theme ("Appearance & Alerts"), where nobody
 * looking for notifications thought to look. Turning it on is this
 * device's; what reaches it is your account's. The bell inside the app
 * keeps everything either way.
 */
export function NotificationsCard() {
  return (
    <div className="flex flex-col gap-4">
      <Tile padded={false} className="overflow-hidden">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span className="mt-0.5 text-on-surface-variant" aria-hidden="true">
            <BellIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-md font-medium text-on-surface">Phone notifications</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Rota changes, alerts, reminders, board posts and team chat, even while the app is closed.
              Turning it on is for this device; what reaches it is for your account.
            </p>
          </div>
        </div>
        <PushPermissionRow />
        <PushPreferences />
      </Tile>

      <p className="px-2 text-label-sm text-on-surface-faint">
        The bell inside the app keeps everything, whatever you choose here.
      </p>
    </div>
  )
}
