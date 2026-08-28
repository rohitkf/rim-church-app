import { splitBody, type MentionablePerson } from '../lib/mentions'

/**
 * A message with the names in it lit up.
 *
 * Being named is the reason someone opens a notification, so the name has
 * to be findable in the message they land on — a wall of identical grey
 * makes them read the whole thing to see why they were called.
 */
export function MessageBody({
  body,
  people,
  className = '',
}: {
  body: string
  people: MentionablePerson[]
  className?: string
}) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {splitBody(body, people).map((segment, index) =>
        segment.person ? (
          <span
            key={index}
            className="rounded-[4px] bg-secondary/15 px-1 font-medium text-secondary"
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  )
}
