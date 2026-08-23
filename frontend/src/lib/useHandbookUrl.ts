import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'

const HANDBOOK_BUCKET = 'handbooks'

async function fetchHandbookUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(HANDBOOK_BUCKET).createSignedUrl(path, 300)
  if (error) return null
  return data.signedUrl
}

export function useHandbookUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['handbook-url', path],
    queryFn: () => fetchHandbookUrl(path ?? null),
    enabled: !!path,
  })
}

export { HANDBOOK_BUCKET }
