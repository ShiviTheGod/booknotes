import type { SupabaseClient } from '@supabase/supabase-js'
import { getSetting, setSetting } from '../../data/repo/settings'

/**
 * The connection to the reader's own Supabase project.
 *
 * The URL and key are typed into Settings and stored on the device, not committed.
 * That is not paranoia about the anon key — it is designed to be public and is
 * useless without Row Level Security — but about whose project this is. Baking one
 * project's credentials into a public repository would point every copy of the app at
 * the same database.
 *
 * The library itself is dynamically imported so that anyone who never turns sync on
 * never downloads it.
 */

export const SYNC_KEYS = {
  url: 'supabaseUrl',
  anonKey: 'supabaseAnonKey',
  /** Server-side watermark: the newest change already pulled down. */
  lastPulledAt: 'syncLastPulledAt',
  /** Local watermark: when this device last sent its changes up. */
  lastPushedAt: 'syncLastPushedAt',
} as const

export interface SyncConfig {
  url: string
  anonKey: string
}

export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  const url = await getSetting<string>(SYNC_KEYS.url, '')
  const anonKey = await getSetting<string>(SYNC_KEYS.anonKey, '')
  if (!url.trim() || !anonKey.trim()) return undefined
  return { url: url.trim(), anonKey: anonKey.trim() }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await setSetting(SYNC_KEYS.url, config.url.trim())
  await setSetting(SYNC_KEYS.anonKey, config.anonKey.trim())
  cached = undefined
}

export async function clearSyncConfig(): Promise<void> {
  await setSetting(SYNC_KEYS.url, '')
  await setSetting(SYNC_KEYS.anonKey, '')
  await setSetting(SYNC_KEYS.lastPulledAt, '')
  await setSetting(SYNC_KEYS.lastPushedAt, '')
  cached = undefined
}

let cached: { key: string; client: SupabaseClient } | undefined

export async function getClient(): Promise<SupabaseClient | undefined> {
  const config = await getSyncConfig()
  if (!config) return undefined

  const key = `${config.url}::${config.anonKey}`
  if (cached?.key === key) return cached.client

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(config.url, config.anonKey, {
    auth: {
      // The session has to outlive the app being closed, or sync would need signing
      // in again every launch. localStorage is where the library keeps it.
      persistSession: true,
      autoRefreshToken: true,
      // No redirect handling: sign-in is email and password inside the app, so there
      // is never a callback URL to parse — which a sideloaded app cannot receive.
      detectSessionInUrl: false,
    },
  })

  cached = { key, client }
  return client
}

export interface AccountState {
  configured: boolean
  email?: string
}

export async function getAccount(): Promise<AccountState> {
  const client = await getClient()
  if (!client) return { configured: false }

  const { data } = await client.auth.getUser()
  return { configured: true, email: data.user?.email ?? undefined }
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = await requireClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
  const client = await requireClient()
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  // Supabase projects confirm email addresses by default, in which case there is no
  // session yet and the reader has to click the link before signing in.
  return { needsConfirm: data.session === null }
}

export async function signOut(): Promise<void> {
  const client = await getClient()
  await client?.auth.signOut()
}

async function requireClient(): Promise<SupabaseClient> {
  const client = await getClient()
  if (!client) throw new Error('Add your Supabase project URL and key first.')
  return client
}
