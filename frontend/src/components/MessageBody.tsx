import { splitBody, type MentionablePerson } from '../lib/mentions'
import { LinkedText } from './LinkedText'

/**
 * A message with the names in it lit up.
 *
 * Being named is the reason someone opens a notification, so the name has
 * to be findable in the message they land on — a wall of identical grey
 * makes them read the whole thing to see why they were called.
 *
 * Web addresses in it are links (LinkedText), so a pasted sign-up form or
 * livestream is a tap away — in every message, old ones included.
 */
export function MessageBody({
  body,
  people,
  className = '',
  onDark = false,
}: {
  body: string
  people: MentionablePerson[]
  className?: string
  /** Drawn on the primary colour (your own chat bubble): links in its ink. */
  onDark?: boolean
}) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {splitBody(body, people).map((segment, index) =>
        segment.person ? (
          <span
            key={index}
            className="rounded-[4px] bg-secondary/15 px-1 font-medium text-accent-blue-soft"
          >
            {segment.text}
          </span>
        ) : (
          <LinkedText key={index} text={segment.text} onDark={onDark} />
        ),
      )}
    </p>
  )
}
