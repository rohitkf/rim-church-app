import { useCallback, useRef, useState } from 'react'
import { Overlay } from './Surface'
import { itemIdFromScan } from '../lib/qrLink'
import { useQrCamera } from '../lib/qrCamera'

/**
 * Point the camera at a label. The camera itself is lib/qrCamera; this is
 * the sheet round it, which closes on the first label that is one of ours.
 */
export function QrScanner({
  onFound,
  onClose,
}: {
  onFound: (itemId: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onText = useCallback(
    (text: string) => {
      const id = itemIdFromScan(text)
      if (id) {
        setDone(true)
        onFound(id)
        return
      }
      setNote('That code is not one of ours.')
    },
    [onFound],
  )
  const phase = useQrCamera(videoRef, onText, !done)

  return (
    <Overlay label="Scan an item's QR code" align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-5 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        <h2 className="text-headline-md">Scan a label</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Point the camera at the QR code on the item.
        </p>

        <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-[var(--radius-chip)] bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {/* A frame to aim with, rather than a live preview of the room. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-8 rounded-[var(--radius-chip)] shadow-[0_0_0_2px_rgba(255,255,255,0.65)]"
          />
          {phase !== 'scanning' && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-body-sm text-white/80">
              {phase === 'starting' && 'Starting the camera…'}
              {phase === 'denied' &&
                'The camera was refused. Allow camera access for this site, or find the item in the list instead.'}
              {phase === 'unavailable' &&
                'This browser will not give the page a camera. Find the item in the list instead.'}
            </p>
          )}
        </div>

        {note && <p className="mt-3 text-body-sm text-accent-orange-soft">{note}</p>}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface"
          >
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}
