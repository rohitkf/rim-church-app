/** A team's ready light: green and blinking, or red and still. */
export function ReadyLight({ ready, size = 12 }: { ready: boolean; size?: number }) {
  return (
    <span
      className="ready-light"
      data-ready={ready ? 'true' : 'false'}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ready ? 'Ready' : 'Not ready'}
    />
  )
}

/** The banner once every serving team is green. */
export function ReadyForService() {
  return (
    <p
      role="status"
      className="font-black uppercase tracking-[0.08em] text-accent-green"
      style={{ fontSize: 'clamp(1.75rem, 6vw, 2.75rem)', lineHeight: 1.05, fontWeight: 900 }}
    >
      Ready for service
    </p>
  )
}
