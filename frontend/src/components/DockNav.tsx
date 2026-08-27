import type { ComponentType, ReactNode, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'

export interface DockItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** A small dot on the icon: something here wants attention. */
  badge?: boolean
}

/**
 * The floating dock.
 *
 * Navigation is a single object hovering over the content rather than a
 * column beside it: it costs no horizontal space, it sits where a thumb
 * already is on a phone, and the destination you are on is the only one
 * wearing a label — which is what lets the others be icons alone without
 * the row becoming a puzzle.
 *
 * The row scrolls rather than wraps, because a dock that changes height
 * is a dock that moves the content underneath it.
 */
export function DockNav({
  items,
  trailing,
  label = 'Main',
}: {
  items: DockItem[]
  /** The assistant, or anything else that is not a destination. */
  trailing?: ReactNode
  label?: string
}) {
  return (
    <nav
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-[color-mix(in_oklab,var(--color-surface-container)_88%,transparent)] p-2.5 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] backdrop-blur-2xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                [
                  'group/dock relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-full transition-all duration-500 ease-[var(--ease-glide)]',
                  isActive
                    ? 'bg-primary px-4 text-on-primary'
                    : 'w-11 text-on-surface-variant hover:bg-raised-strong hover:text-on-surface',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="shrink-0" width={19} height={19} />
                  {/* Only the current destination spells its name, so the
                      dock stays one line however much the app grows. */}
                  {isActive && <span className="whitespace-nowrap text-label-md">{item.label}</span>}
                  {item.badge && !isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent-orange"
                    />
                  )}
                </>
              )}
            </NavLink>
          )
        })}

        {trailing && (
          <>
            <span aria-hidden="true" className="mx-1 h-7 w-px shrink-0 bg-outline-variant" />
            {trailing}
          </>
        )}
      </div>
    </nav>
  )
}
