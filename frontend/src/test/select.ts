import { screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Choosing from the app's own dropdown, the way a person does.
 *
 * The menu is not inside the trigger — it is drawn into `document.body` so
 * a card cannot clip it — so a test opens the combobox and then looks for
 * the option on the page rather than within the field.
 */
export async function chooseOption(user: UserEvent, trigger: HTMLElement, label: string | RegExp) {
  await user.click(trigger)
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByRole('option', { name: label }))
}

/** The options a closed dropdown would offer, without choosing one. */
export async function openOptions(user: UserEvent, trigger: HTMLElement) {
  await user.click(trigger)
  return screen.findByRole('listbox')
}
