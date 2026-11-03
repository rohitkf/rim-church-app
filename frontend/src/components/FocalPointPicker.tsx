import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CENTRE, imagePosition, type ImageFocus } from '../lib/registrations'

/**
 * Where the picture's subject is (0248). The event's page shows the
 * picture 16:9, cropped to fit, so a tall poster or a wide banner lost
 * its subject at the edges. Tap or drag the dot onto the part that must
 * stay in view; the preview beside it is the crop as the page will show
 * it. The two sliders are the same control for a keyboard, and for
 * anybody who finds a dot hard to drag.
 */
export function FocalPointPicker({ src, value, onChange }: { src: string; value: ImageFocus; onChange: (next: ImageFocus) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))
  const place = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return
    onChange({ x: clamp(((e.clientX - box.left) / box.width) * 100), y: clamp(((e.clientY - box.top) / box.height) * 100) })
  }
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A browser without pointer capture still gets the tap.
    }
    setDragging(true)
    place(e)
  }
  const stop = () => setDragging(false)
  const centred = value.x === CENTRE.x && value.y === CENTRE.y

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="text-label-md text-on-surface-variant">Drag the dot onto the part that must stay in view.</p>
        <div
          ref={boxRef}
          role="img"
          aria-label="The picture, with the dot on its subject — tap or drag to move it"
          onPointerDown={start}
          onPointerMove={(e) => dragging && place(e)}
          onPointerUp={stop}
          onPointerCancel={stop}
          className="relative mt-2 max-w-md cursor-crosshair touch-none select-none overflow-hidden rounded-[var(--radius-chip)] bg-black"
        >
          <img src={src} alt="" draggable={false} className="block h-auto w-full" />
          <span
            aria-hidden="true"
            style={{ left: `${value.x}%`, top: `${value.y}%` }}
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.55),0_0_12px_rgba(0,0,0,0.5)]"
          />
        </div>
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-label-sm text-on-surface-faint">
            Left to right
            <input type="range" min={0} max={100} value={value.x} onChange={(e) => onChange({ ...value, x: Number(e.target.value) })} className="accent-[var(--color-primary)]" />
          </label>
          <label className="flex flex-col gap-1 text-label-sm text-on-surface-faint">
            Top to bottom
            <input type="range" min={0} max={100} value={value.y} onChange={(e) => onChange({ ...value, y: Number(e.target.value) })} className="accent-[var(--color-primary)]" />
          </label>
        </div>
      </div>
      <div className="w-full shrink-0 sm:w-64">
        <p className="text-label-md text-on-surface-variant">How it will show</p>
        <img
          src={src}
          alt="How the picture will show on the event’s page"
          style={{ objectPosition: imagePosition(value) }}
          className="mt-2 aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover"
        />
        <button type="button" onClick={() => onChange(CENTRE)} disabled={centred} className="tap mt-1 text-label-md text-on-surface-faint hover:underline disabled:opacity-50">
          Back to the middle
        </button>
      </div>
    </div>
  )
}
