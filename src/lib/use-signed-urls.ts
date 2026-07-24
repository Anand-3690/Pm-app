import { useEffect, useState } from 'react'
import { signMany } from './storage'

export function useSignedUrls(supabase: any, messages: { attachment_url?: string | null }[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({})

  const keys = messages.map(m => m.attachment_url).filter(Boolean) as string[]
  const sig = keys.join('|')

  useEffect(() => {
    let cancelled = false
    const missing = keys.filter(k => !(k in urls))
    if (!missing.length) return
    signMany(supabase, missing).then(res => {
      if (!cancelled) setUrls(prev => ({ ...prev, ...res }))
    })
    return () => { cancelled = true }
  }, [sig])

  return urls
}