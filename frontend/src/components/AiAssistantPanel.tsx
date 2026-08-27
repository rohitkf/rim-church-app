import { type FormEvent, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useErrorText } from '../lib/useErrorText'
import {
  confirmPendingActions,
  sendChatMessage,
  transcribeAudio,
  type HistoryEntry,
  type PendingAction,
} from '../lib/assistantApi'

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

interface AiAssistantPanelProps {
  open: boolean
  onClose: () => void
}

export function AiAssistantPanel({ open, onClose }: AiAssistantPanelProps) {
  const errorText = useErrorText()
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [pendingActions, setPendingActions] = useState<PendingAction[] | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const chatMutation = useMutation({
    mutationFn: (text: string) => sendChatMessage(text, history),
    onSuccess: (res) => {
      setError(null)
      setHistory(res.history)
      setPendingActions(res.pending_actions)
      if (res.reply) setTurns((t) => [...t, { role: 'assistant', text: res.reply }])
    },
    onError: (err: unknown) => setError(errorText(err, 'Something went wrong.')),
  })

  const confirmMutation = useMutation({
    mutationFn: (approved: boolean) => confirmPendingActions(approved, pendingActions!, history),
    onSuccess: (res) => {
      setError(null)
      setHistory(res.history)
      setPendingActions(res.pending_actions)
      if (res.reply) setTurns((t) => [...t, { role: 'assistant', text: res.reply }])
    },
    onError: (err: unknown) => setError(errorText(err, 'Something went wrong.')),
  })

  const transcribeMutation = useMutation({
    mutationFn: (blob: Blob) => transcribeAudio(blob),
    onSuccess: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (err: unknown) => setError(errorText(err, 'Transcription failed.')),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || chatMutation.isPending) return
    setTurns((t) => [...t, { role: 'user', text }])
    setInput('')
    chatMutation.mutate(text)
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        transcribeMutation.mutate(blob)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }

  if (!open) return null

  const busy = chatMutation.isPending || confirmMutation.isPending

  return (
    <div className="fixed bottom-6 right-6 z-20 flex h-[520px] w-96 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface-lowest hairline shadow-lg">
      <div className="flex items-center justify-between bg-primary px-4 py-3 text-on-primary">
        <span className="text-body-sm font-medium">✦ Ops Assistant</span>
        <button onClick={onClose} aria-label="Close assistant" className="text-on-primary hover:opacity-70">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">
            Ask me things like "what's left on the media checklist today" or "log attendance for
            worship, 45 expected, 40 actual."
          </p>
        )}
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-body-sm ${
              turn.role === 'user'
                ? 'ml-auto bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface'
            }`}
          >
            {turn.text}
          </div>
        ))}

        {pendingActions && pendingActions.length > 0 && (
          <div className="rounded-[var(--radius-card)] hairline bg-surface-muted p-3">
            <p className="text-body-sm text-on-surface">
              {turns[turns.length - 1]?.role === 'assistant' ? turns[turns.length - 1].text : 'Confirm this action?'}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => confirmMutation.mutate(true)}
                disabled={busy}
                className="rounded-full bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => confirmMutation.mutate(false)}
                disabled={busy}
                className="rounded-full hairline px-3 py-1.5 text-body-sm text-on-surface hover:bg-surface-container"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {busy && <p className="text-body-sm text-on-surface-variant">Thinking…</p>}
        {error && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border-subtle p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI to do something…"
          disabled={!!pendingActions}
          className="flex-1 rounded-full hairline px-3 py-2 text-body-sm text-on-surface focus:border-2 focus:border-secondary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={toggleRecording}
          disabled={!!pendingActions}
          title={recording ? 'Stop recording' : 'Record voice input'}
          className={`rounded-sm border px-2 py-2 text-body-sm disabled:opacity-50 ${
            recording ? 'border-error text-error' : 'border-border-subtle text-on-surface-variant'
          }`}
        >
          🎙
        </button>
        <button
          type="submit"
          disabled={busy || !!pendingActions || !input.trim()}
          className="rounded-full bg-primary px-3 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
