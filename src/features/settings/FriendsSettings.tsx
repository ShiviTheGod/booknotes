import { useCallback, useEffect, useState } from 'react'
import {
  acceptFriend,
  listFriends,
  removeFriend,
  requestFriend,
  socialReady,
  type Friend,
} from '../../services/social/social'
import styles from './SettingsView.module.css'

/**
 * Who can read your reviews.
 *
 * By invitation only, in both directions — you ask, they agree, or the other way
 * round. That is the whole moderation story, and it is why this can exist at all
 * without blocking, reporting or anything else a public system needs: nobody you did
 * not deliberately let in can see a word you wrote.
 *
 * Nothing about a friend is discoverable. Asking by email says only whether the ask
 * landed, never whose account it reached or whether an address is registered at all.
 */
export default function FriendsSettings() {
  const [ready, setReady] = useState<boolean>()
  const [friends, setFriends] = useState<Friend[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setFriends(await listFriends())
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const usable = await socialReady()
      if (cancelled) return
      setReady(usable)
      if (usable) {
        try {
          await refresh()
        } catch (caught) {
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleAsk = () =>
    run(async () => {
      const outcome = await requestFriend(email)
      setMessage(
        outcome === 'requested'
          ? 'Asked. They will see it next time they open ReadNote.'
          : outcome === 'accepted'
            ? 'They had already asked you — you are now friends.'
            : outcome === 'self'
              ? 'That is your own address.'
              : 'Nobody is using ReadNote with that address yet.',
      )
      if (outcome !== 'not-found' && outcome !== 'self') {
        setEmail('')
        await refresh()
      }
    })

  if (ready === undefined) return null

  if (!ready) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Friends</h2>
        <p className={styles.help}>
          Sharing reviews needs the same account as sync. Connect a Supabase project and
          sign in above, and this becomes available.
        </p>
      </section>
    )
  }

  const accepted = friends.filter((friend) => friend.status === 'accepted')
  const incoming = friends.filter(
    (friend) => friend.status === 'pending' && friend.direction === 'incoming',
  )
  const outgoing = friends.filter(
    (friend) => friend.status === 'pending' && friend.direction === 'outgoing',
  )

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Friends</h2>
      <p className={styles.help}>
        Friends can read the reviews you choose to share, and nothing else.{' '}
        <strong>Your notes are never shared</strong> — nor is the text read out of
        photographed pages, which is the book's writing rather than yours.
      </p>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Ask someone by email</span>
        <input
          className={styles.input}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="their@email.com"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void handleAsk()}
          disabled={busy || !email.trim()}
        >
          {busy ? 'Working…' : 'Send request'}
        </button>
      </div>

      {incoming.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Waiting for you</h3>
          {incoming.map((friend) => (
            <div key={friend.friendId} className={styles.diagRow}>
              <dt>{friend.email}</dt>
              <dd className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void run(async () => {
                    await acceptFriend(friend.friendId)
                    await refresh()
                  })}
                  disabled={busy}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void run(async () => {
                    await removeFriend(friend.friendId)
                    await refresh()
                  })}
                  disabled={busy}
                >
                  Decline
                </button>
              </dd>
            </div>
          ))}
        </>
      )}

      {accepted.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Friends</h3>
          {accepted.map((friend) => (
            <div key={friend.friendId} className={styles.diagRow}>
              <dt>{friend.email}</dt>
              <dd>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void run(async () => {
                    await removeFriend(friend.friendId)
                    await refresh()
                  })}
                  disabled={busy}
                >
                  Remove
                </button>
              </dd>
            </div>
          ))}
          <p className={styles.help}>
            Removing someone takes back every review they could see, at once.
          </p>
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Asked, not yet answered</h3>
          {outgoing.map((friend) => (
            <div key={friend.friendId} className={styles.diagRow}>
              <dt>{friend.email}</dt>
              <dd>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void run(async () => {
                    await removeFriend(friend.friendId)
                    await refresh()
                  })}
                  disabled={busy}
                >
                  Cancel
                </button>
              </dd>
            </div>
          ))}
        </>
      )}

      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <p className={styles.help}>Nobody yet. Ask someone by their email address above.</p>
      )}

      {message && <p className={styles.message}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
