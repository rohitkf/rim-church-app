import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { chooseOption } from './select'

/**
 * Choosing a date or a time through the app's own fields, the way a
 * person does: open the sheet, pick. The native inputs these replaced
 * could be typed into; these cannot, so tests go through the sheet too.
 */

/** The sheet just opened — the topmost dialog, which may sit on another. */
async function openedSheet() {
  const dialogs = await screen.findAllByRole('dialog')
  return dialogs[dialogs.length - 1]
}

/** Open a DateField and pick "YYYY-MM-DD". */
export async function pickDate(user: UserEvent, trigger: HTMLElement, iso: string) {
  await user.click(trigger)
  const sheet = await openedSheet()
  const year = iso.slice(0, 4)
  const month = new Date(Number(year), Number(iso.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
  })
  await chooseOption(user, within(sheet).getByRole('combobox', { name: 'Year' }), year)
  await chooseOption(user, within(sheet).getByRole('combobox', { name: 'Month' }), month)
  await user.click(within(sheet).getByRole('gridcell', { name: iso }))
}

/** Open a TimeField and pick "HH:MM". */
export async function pickTime(user: UserEvent, trigger: HTMLElement, hhmm: string) {
  await user.click(trigger)
  const sheet = await openedSheet()
  const [h, m] = hhmm.split(':')
  await user.click(within(within(sheet).getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: h }))
  await user.click(within(within(sheet).getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: m }))
  await user.click(within(sheet).getByRole('button', { name: 'Done' }))
}
