import { formatServiceDay } from './sunday'

export const POLLS_KEY = ['polls']

/** Who a poll can be addressed to (0114). */
export const POLL_AUDIENCES = ['everyone', 'team', 'people', 'service'] as const
export type PollAudience = (typeof POLL_AUDIENCES)[number]

export interface PollAddress {
  audience: PollAudience
  department: { name: string } | null
  service: { date: string; service_type: string } | null
  recipient_ids: string[]
}

/** Who a poll is for, in the words the card says it in. */
export function audienceLabel(poll: PollAddress): string {
  switch (poll.audience) {
    case 'everyone':
      return 'Everyone'
    case 'team':
      return poll.department?.name ?? 'One team'
    case 'people':
      return `${poll.recipient_ids.length} ${poll.recipient_ids.length === 1 ? 'person' : 'people'}`
    case 'service': {
      const at = poll.service
        ? `${poll.service.service_type} · ${formatServiceDay(poll.service.date)}`
        : 'A service'
      return poll.department ? `${poll.department.name} at ${at}` : `Serving at ${at}`
    }
  }
}
