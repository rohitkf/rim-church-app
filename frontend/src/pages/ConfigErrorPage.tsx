export function ConfigErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="text-headline-lg">Missing configuration</div>
      <p className="max-w-md text-body-sm text-on-surface-variant">
        <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
        <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> aren't set. Copy{' '}
        <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code>{' '}
        and fill in your Supabase project's values, then restart the dev server.
      </p>
    </div>
  )
}
