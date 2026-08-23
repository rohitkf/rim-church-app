import { supabase } from './supabaseClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface PendingAction {
  tool_use_id: string
  tool_name: string
  tool_input: Record<string, unknown>
}

// Opaque Anthropic message content — the frontend only ever echoes this
// back verbatim, never inspects it, so the backend owns the shape.
export type HistoryEntry = Record<string, unknown>

export interface AssistantResponse {
  reply: string
  history: HistoryEntry[]
  pending_actions: PendingAction[] | null
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in.')
  return { Authorization: `Bearer ${session.access_token}` }
}

export async function sendChatMessage(text: string, history: HistoryEntry[]): Promise<AssistantResponse> {
  const headers = await authHeader()
  const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, history }),
  })
  if (!res.ok) throw new Error(`Assistant request failed (${res.status})`)
  return res.json()
}

export async function confirmPendingActions(
  approved: boolean,
  pendingActions: PendingAction[],
  history: HistoryEntry[],
): Promise<AssistantResponse> {
  const headers = await authHeader()
  const res = await fetch(`${API_BASE_URL}/assistant/confirm`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, pending_actions: pendingActions, history }),
  })
  if (!res.ok) throw new Error(`Confirmation request failed (${res.status})`)
  return res.json()
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const headers = await authHeader()
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  const res = await fetch(`${API_BASE_URL}/assistant/transcribe`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`)
  const data = await res.json()
  return data.text
}
