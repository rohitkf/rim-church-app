import { useEffect, useState, type RefObject } from 'react'

export type QrCameraPhase = 'starting' | 'scanning' | 'denied' | 'unavailable'

/**
 * The back camera, decoded frame by frame for QR codes, into a <video>.
 *
 * Uses the browser's own BarcodeDetector where it exists — it is hardware
 * accelerated and costs nothing to ship — and falls back to decoding the
 * video frames in JavaScript where it does not, which is most of iOS. The
 * fallback is loaded only when it is needed.
 *
 * `onText` hears every frame that decodes, including the same code over
 * and over while it stays in view; whoever listens decides what is new.
 * The camera stops the moment `active` turns false or the caller unmounts.
 * A page that quietly keeps a camera open is a page nobody trusts twice.
 */
export function useQrCamera(videoRef: RefObject<HTMLVideoElement | null>, onText: (text: string) => void, active = true): QrCameraPhase {
  const [phase, setPhase] = useState<QrCameraPhase>('starting')

  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false

    async function decoderFor(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
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
          // The back camera is the one pointing at the thing.
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
            if (text && !stopped) onText(text)
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
  }, [videoRef, onText, active])

  return phase
}
