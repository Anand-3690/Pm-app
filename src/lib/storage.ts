const BUCKET = 'task-attachments'

/** Accepts a legacy full URL or a bare path; always returns a bare path. */
export function toPath(stored: string): string {
  if (!stored.startsWith('http')) return stored.replace(/^\/+/, '')
  const marker = `/object/public/${BUCKET}/`
  const i = stored.indexOf(marker)
  const raw = i === -1 ? stored : stored.slice(i + marker.length)
  return decodeURIComponent(raw.split('?')[0])
}

export async function signOne(supabase: any, stored: string, secs = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrl(toPath(stored), secs)
  return error ? null : data.signedUrl
}

/** Bulk-sign. Returns a map keyed by the ORIGINAL stored value. */
export async function signMany(supabase: any, stored: string[], secs = 3600) {
  const out: Record<string, string | null> = {}
  if (!stored.length) return out
  const paths = stored.map(toPath)
  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrls(paths, secs)
  if (error || !data) { stored.forEach(s => { out[s] = null }); return out }
  data.forEach((r: any, i: number) => { out[stored[i]] = r.error ? null : r.signedUrl })
  return out
}