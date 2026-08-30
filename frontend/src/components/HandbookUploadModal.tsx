import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import gsap from 'gsap'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { HANDBOOK_BUCKET } from '../lib/useHandbookUrl'
import {
  checkHandbookFile,
  formatBytes,
  HANDBOOK_ACCEPT,
  HANDBOOK_MAX_BYTES,
  HANDBOOK_TYPES,
  type HandbookExt,
} from '../lib/handbookFile'

type Stage = 'idle' | 'uploading' | 'done' | 'failed'

interface HandbookUploadModalProps {
  departmentId: string
  departmentName: string
  /** The stored path of the handbook already on file, if any. */
  currentPath: string | null
  onClose: () => void
}

/**
 * Putting a team's handbook on file: one document per team, PDF or Word,
 * up to 30MB, replacing whatever was there before.
 *
 * The animation is doing a job, not decoration — an upload gives no
 * progress events worth trusting, so the ring fills at a pace that reads as
 * "working", then resolves into a tick or a cross the moment the request
 * comes back. It never shows a finished tick before the file is stored.
 */
export function HandbookUploadModal({
  departmentId,
  departmentName,
  currentPath,
  onClose,
}: HandbookUploadModalProps) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const tickRef = useRef<SVGPathElement>(null)
  const crossRef = useRef<SVGGElement>(null)
  const spinner = useRef<gsap.core.Tween | null>(null)

  // Entrance.
  useEffect(() => {
    if (!dialogRef.current) return
    const ctx = gsap.context(() => {
      gsap.from(dialogRef.current, { y: 16, opacity: 0, duration: 0.28, ease: 'power2.out' })
    })
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage !== 'uploading') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, stage])

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      const check = checkHandbookFile(chosen)
      if (!check.ok) throw new Error(check.reason)

      const path = `${departmentId}/handbook.${check.ext}`
      const { error: uploadErr } = await supabase.storage
        .from(HANDBOOK_BUCKET)
        .upload(path, chosen, { upsert: true, contentType: check.mime })
      if (uploadErr) throw uploadErr

      // One handbook per team: if the last one was the other format, the
      // new upload wouldn't overwrite it, so clear it out by hand.
      const stale = HANDBOOK_TYPES.map((t) => `${departmentId}/handbook.${t.ext}`).filter(
        (p) => p !== path,
      )
      await supabase.storage.from(HANDBOOK_BUCKET).remove(stale)

      const { error: updateErr } = await supabase
        .from('departments')
        .update({ handbook_url: path })
        .eq('id', departmentId)
      if (updateErr) throw updateErr

      return check.ext
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department', departmentId] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      finish(true)
    },
    onError: (err: unknown) => {
      setMessage(errorText(err, 'Upload failed.'))
      finish(false)
    },
  })

  /** Spin the ring while the request is in flight. */
  function startSpinner() {
    const ring = ringRef.current
    if (!ring) return
    const circumference = 2 * Math.PI * 52
    gsap.set(ring, { strokeDasharray: circumference, strokeDashoffset: circumference * 0.75 })
    spinner.current = gsap.to(ring, {
      rotation: 360,
      transformOrigin: '50% 50%',
      duration: 1.1,
      ease: 'none',
      repeat: -1,
    })
  }

  /** Close the ring, then draw a tick or a cross over it. */
  function finish(ok: boolean) {
    spinner.current?.kill()
    setStage(ok ? 'done' : 'failed')

    requestAnimationFrame(() => {
      const ring = ringRef.current
      const timeline = gsap.timeline()

      if (ring) {
        timeline.to(ring, {
          strokeDashoffset: 0,
          rotation: 0,
          duration: 0.35,
          ease: 'power2.out',
        })
      }

      if (ok && tickRef.current) {
        const length = tickRef.current.getTotalLength?.() ?? 60
        gsap.set(tickRef.current, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 })
        timeline.to(tickRef.current, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, '-=0.1')
        timeline.fromTo(
          dialogRef.current,
          { scale: 1 },
          { scale: 1.015, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.inOut' },
          '-=0.2',
        )
      }

      if (!ok && crossRef.current) {
        gsap.set(crossRef.current, { opacity: 1, scale: 0.6, transformOrigin: '50% 50%' })
        timeline.to(crossRef.current, { scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, '-=0.1')
        timeline.fromTo(
          dialogRef.current,
          { x: 0 },
          { x: -6, duration: 0.07, repeat: 5, yoyo: true, ease: 'power1.inOut' },
          '-=0.2',
        )
        timeline.set(dialogRef.current, { x: 0 })
      }
    })
  }

  function choose(chosen: File | undefined | null) {
    if (!chosen) return
    const check = checkHandbookFile(chosen)
    if (!check.ok) {
      setFile(null)
      setMessage(check.reason)
      setStage('failed')
      requestAnimationFrame(() => finish(false))
      return
    }
    setFile(chosen)
    setMessage(null)
    setStage('uploading')
    requestAnimationFrame(() => {
      startSpinner()
      upload.mutate(chosen)
    })
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (stage === 'uploading') return
    choose(e.dataTransfer.files?.[0])
  }

  const busy = stage === 'uploading'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handbook-upload-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 shadow-lg"
      >
        <h2 id="handbook-upload-title" className="text-headline-md">
          {currentPath ? 'Replace' : 'Upload'} the {departmentName} handbook
        </h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          One document per team, PDF or Word (.docx), up to {formatBytes(HANDBOOK_MAX_BYTES)}.
          {currentPath && ' Uploading a new one replaces what is there now.'}
        </p>

        {stage === 'idle' ? (
          <div
            ref={dropRef}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? 'border-secondary bg-secondary/5' : 'border-border-subtle bg-surface-low'
            }`}
          >
            <UploadGlyph active={dragging} />
            <p className="mt-3 text-body-md text-on-surface">
              Drag the handbook here, or
              <label className="ml-1 cursor-pointer font-medium text-secondary hover:underline">
                browse
                <input
                  type="file"
                  accept={HANDBOOK_ACCEPT}
                  className="hidden"
                  onChange={(e) => choose(e.target.files?.[0])}
                />
              </label>
            </p>
            <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
              PDF or .docx · max {formatBytes(HANDBOOK_MAX_BYTES)}
            </p>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center rounded-lg bg-surface-low px-6 py-8">
            <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="6" className="stroke-surface-container" />
              <circle
                ref={ringRef}
                cx="60"
                cy="60"
                r="52"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className={
                  stage === 'failed'
                    ? 'stroke-error'
                    : stage === 'done'
                      ? 'stroke-success'
                      : 'stroke-secondary'
                }
                transform="rotate(-90 60 60)"
              />
              <path
                ref={tickRef}
                d="M40 61 L54 75 L81 47"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-success"
                style={{ opacity: 0 }}
              />
              <g ref={crossRef} style={{ opacity: 0 }} className="stroke-error" strokeWidth="7" strokeLinecap="round">
                <line x1="45" y1="45" x2="75" y2="75" />
                <line x1="75" y1="45" x2="45" y2="75" />
              </g>
            </svg>

            <p className="mt-4 text-body-md text-on-surface">
              {stage === 'uploading' && 'Uploading…'}
              {stage === 'done' && 'Handbook uploaded'}
              {stage === 'failed' && "That didn't work"}
            </p>
            {file && (
              <p className="mt-1 break-all font-mono text-label-sm text-on-surface-variant">
                {file.name} · {formatBytes(file.size)}
              </p>
            )}
            {message && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-center text-body-sm text-on-error-container">
                {message}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {stage === 'failed' && (
            <button
              type="button"
              onClick={() => {
                setStage('idle')
                setMessage(null)
                setFile(null)
              }}
              className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
            >
              Try another file
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`rounded-sm px-4 py-2.5 text-body-sm font-medium disabled:opacity-50 ${
              stage === 'done'
                ? 'bg-primary text-on-primary hover:opacity-90'
                : 'border border-border-subtle text-on-surface hover:border-secondary'
            }`}
          >
            {stage === 'done' ? 'Done' : busy ? 'Uploading…' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadGlyph({ active }: { active: boolean }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current) return
    gsap.to(ref.current, {
      y: active ? -6 : 0,
      scale: active ? 1.08 : 1,
      duration: 0.3,
      ease: 'power2.out',
    })
  }, [active])

  return (
    <svg
      ref={ref}
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mx-auto ${active ? 'text-secondary' : 'text-on-surface-variant'}`}
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

export type { HandbookExt }
