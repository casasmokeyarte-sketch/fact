import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Las variables de entorno de Supabase no estAn configuradas. Revisa el archivo .env.local')
}

function resolveProjectRef(url) {
  try {
    const hostname = new URL(String(url || '')).hostname
    const [projectRef] = hostname.split('.')
    return String(projectRef || '').trim()
  } catch {
    return ''
  }
}

export function getSupabaseAuthStorageKey() {
  const projectRef = resolveProjectRef(supabaseUrl)
  return projectRef ? `sb-${projectRef}-auth-token` : ''
}

export function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return
  const storageKey = getSupabaseAuthStorageKey()
  if (!storageKey) return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {}
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
