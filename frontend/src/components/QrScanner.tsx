import { useEffect, useRef, useState } from 'react'
import { Overlay } from './Surface'
import { itemIdFromScan } from '../lib/qrLink'

type Phase = 'starting' | 'scanning' | 'denied' | 'unavailable'

/**
 * Point the camera at a label.
 *
 * Uses the browser's own BarcodeDetector where it exists — it is hardware
 * accelerated and costs nothing to ship — and falls back to decoding the
 * video frames in JavaScript where it does not, which is most of iOS. The
 * fallback is loaded only when it is needed.
 *
 * The camera stops the moment this closes. A page that quietly keeps a
 * camera open is a page nobody trusts twice.
 */
export function QrScanner({
  onFound,
  onClose,
}: {
  onFound: (itemId: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false

    async function decoderFor(): Promise<(bitmap: HTMLVideoElement) => Promise<string | null>> {
      const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
      if (Detector) {
        const detector = new Detector({ formats: ['qr_code'] })
        return async (video) => {
          const codes = await detector.detect(video)
          return codes[0]?.rawValue ?? null
        }
      }

      const { default: jsQR } = await import('jsqr')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      return async (video) => {
        if (!ctx || !video.videoWidth) return null
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        return jsQR(data.data, data.width, data.height)?.data ?? null
      }
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase('unavailable')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The back camera is the one pointing at the equipment.
          video: { facingMode: { ideal: 'environment' } },
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setPhase('scanning')

        const decode = await decoderFor()
        const tick = async () => {
          if (stopped) return
          try {
            const text = await decode(video)
            if (text) {
              const id = itemIdFromScan(text)
              if (id) {
                stopped = true
                onFound(id)
                return
              }
              setNote('That code is not one of ours.')
            }
          } catch {
            // A frame that will not decode is normal; keep looking.
          }
          frame = requestAnimationFrame(() => void tick())
        }
        void tick()
      } catch {
        setPhase('denied')
      }
    }

    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onFound])

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

        {note && <p className="mt-3 text-body-sm text-accent-orange">{note}</p>}

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
