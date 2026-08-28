/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AI_ASSISTANT_ENABLED?: string
  /**
   * The public half of the server's VAPID key pair. Without it the app
   * still shows notifications while it is running; with it, it can also be
   * reached while it is closed.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
