import { useEffect, useState } from 'react'
import {
  clearSyncConfig,
  getAccount,
  getSyncConfig,
  saveSyncConfig,
  signIn,
  signOut,
  signUp,
} from '../../services/sync/client'
import { runSync, type SyncReport } from '../../services/sync/sync'
import styles from './SettingsView.module.css'

/**
 * Set-up and manual trigger for syncing a library between devices.
 *
 * Everything here is deliberately explicit — paste a key, sign in, press Sync — rather
 * than something that quietly happens in the background. This is the only part of the
 * app that can remove notes from two devices at once, so it does nothing until asked.
 */
export default function SyncSettings() {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [configured, setConfigured] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedInAs, setSignedInAs] = useState<string>()

  const [busy, setBusy] = useState<'config' | 'auth' | 'sync'>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [report, setReport] = useState<SyncReport>()

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const config = await getSyncConfig()
      const account = await getAccount()
      if (cancelled) return

      if (config) {
        setUrl(config.url)
        setAnonKey(config.anonKey)
      }
      setConfigured(Boolean(config))
      setSignedInAs(account.email)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function run<T>(kind: 'config' | 'auth' | 'sync', work: () => Promise<T>) {
    setBusy(kind)
    setError(undefined)
    setMessage(undefined)
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(undefined)
    }
  }

  const handleSaveConfig = () =>
    run('config', async () => {
      await saveSyncConfig({ url, anonKey })
      setConfigured(true)
      setMessage('Project saved. Now sign in below.')
    })

  const handleDisconnect = () =>
    run('config', async () => {
      await signOut()
      await clearSyncConfig()
      setConfigured(false)
      setSignedInAs(undefined)
      setUrl('')
      setAnonKey('')
      // Worth saying plainly: disconnecting is not destructive.
      setMessage('Disconnected. Your notes on this device are untouched.')
    })

  const handleSignIn = () =>
    run('auth', async () => {
      await signIn(email, password)
      setSignedInAs((await getAccount()).email)
      setPassword('')
      setMessage('Signed in.')
    })

  const handleSignUp = () =>
    run('auth', async () => {
      const { needsConfirm } = await signUp(email, password)
      setPassword('')
      setMessage(
        needsConfirm
          ? 'Account made. Check your email for a confirmation link, then sign in here.'
          : 'Account made and signed in.',
      )
      setSignedInAs((await getAccount()).email)
    })

  const handleSignOut = () =>
    run('auth', async () => {
      await signOut()
      setSignedInAs(undefined)
      setMessage('Signed out. Nothing was deleted.')
    })

  const handleSync = () =>
    run('sync', async () => {
      setReport(await runSync())
    })

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Sync between devices</h2>
      <p className={styles.help}>
        Keeps one library across your phone and tablet, through a Supabase project that
        is yours rather than mine. Books, chapters, notes, extracted text and
        translations travel. <strong>Photos stay on the device that took them</strong> —
        they are the bulk of the data, and they are pictures of what you were reading.
      </p>

      <p className={styles.help}>
        Setup is in <code>supabase/schema.sql</code> in the repository: make a free
        project, run that file in its SQL editor, then paste the project URL and the
        <em> anon</em> key below. The anon key is meant to be public; the schema turns on
        Row Level Security so it can only ever reach your own rows.
      </p>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Project URL</span>
        <input
          className={styles.input}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://xxxxx.supabase.co"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Anon key</span>
        <input
          className={styles.input}
          value={anonKey}
          onChange={(event) => setAnonKey(event.target.value)}
          placeholder="eyJhbGci…"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void handleSaveConfig()}
          disabled={busy !== undefined || !url.trim() || !anonKey.trim()}
        >
          {busy === 'config' ? 'Saving…' : 'Save project'}
        </button>
        {configured && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void handleDisconnect()}
            disabled={busy !== undefined}
          >
            Disconnect
          </button>
        )}
      </div>

      {configured && (
        <>
          <h3 className={styles.subTitle}>{signedInAs ? 'Account' : 'Sign in'}</h3>

          {signedInAs ? (
            <>
              <p className={styles.help}>
                Signed in as <strong>{signedInAs}</strong>. Use the same account on your
                other device.
              </p>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleSignOut()}
                  disabled={busy !== undefined}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="username"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Password</span>
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleSignIn()}
                  disabled={busy !== undefined || !email.trim() || !password}
                >
                  {busy === 'auth' ? 'Working…' : 'Sign in'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void handleSignUp()}
                  disabled={busy !== undefined || !email.trim() || !password}
                >
                  Create account
                </button>
              </div>
            </>
          )}
        </>
      )}

      {signedInAs && (
        <>
          <h3 className={styles.subTitle}>Sync</h3>
          <p className={styles.help}>
            Nothing moves until you press this. <strong>Export a backup first</strong> the
            first time you sync a device that already has notes on it — merging two
            libraries is the one operation here that can remove something.
          </p>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleSync()}
              disabled={busy !== undefined}
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </>
      )}

      {report && (
        <div className={styles.diagResult}>
          <Row label="Brought down" value={String(report.pulled)} />
          <Row label="Sent up" value={String(report.pushed)} />
          <Row label="Deleted here" value={String(report.deletedHere)} />
          <p className={styles.help}>
            Counts are rows, not notes alone — books and chapters travel too.
          </p>
        </div>
      )}

      {message && <p className={styles.message}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.diagRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
