import { splitLinks } from '../lib/links'

/**
 * Text with its web addresses made into links (lib/links).
 *
 * A link opens in a new tab, so the message somebody was reading is still
 * there when they come back, and it says nothing about this app to the
 * page it opens. A tap on it is the link's alone: a message that opens its
 * own menu when tapped does not open it as well.
 *
 * `onDark` is for a bubble drawn in the primary colour, where the app's
 * link blue would vanish.
 */
export function LinkedText({ text, onDark = false }: { text: string; onDark?: boolean }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className={`break-all underline underline-offset-2 ${
              onDark ? 'text-on-primary decoration-on-primary/60' : 'text-accent-blue-soft decoration-accent-blue-soft/50'
            } hover:decoration-current`}
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
