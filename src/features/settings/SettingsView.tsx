import { useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import PageHeader from '../../components/PageHeader'
import { downloadBackup, restoreBackup } from '../../services/backup'
import { installSampleBooks, removeSampleBooks, sampleBookTally } from '../../data/seed'
import { isIos, isStandalone } from '../../services/speech'
import NativeDiagnostics from './NativeDiagnostics'
import AppearanceSettings from './AppearanceSettings'
import LibraryImport from './LibraryImport'
import SupportProject from './SupportProject'
import TranslationSettings from './TranslationSettings'
import SyncSettings from './SyncSettings'
import FriendsSettings from './FriendsSettings'
import styles from './SettingsView.module.css'

export default function SettingsView() {
  const counts = useLiveQuery(async () => {
    const [books, notes, images] = await Promise.all([
      db.books.count(),
      db.notes.count(),
      db.images.count(),
    ])
    return { books, notes, images }
  }, [])

  // Re-runs whenever books or notes change, so the tally cannot go stale behind a
  // deletion made on the book screen.
  const samples = useLiveQuery(sampleBookTally, [])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState<'export' | 'import' | 'samples'>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  async function handleExport() {
    setBusy('export')
    setMessage(undefined)
    setError(undefined)
    try {
      await downloadBackup()
      setMessage(
        Capacitor.isNativePlatform()
          ? 'Choose where to keep it — Files, iCloud Drive, or mail it to yourself. Anywhere but this device.'
          : 'Backup saved. Keep it somewhere outside this device.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(undefined)
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const confirmed = window.confirm(
      'Restoring replaces everything currently in ReadNote with the contents of this file. Continue?',
    )
    if (!confirmed) return

    setBusy('import')
    setMessage(undefined)
    setError(undefined)
    try {
      const result = await restoreBackup(file)
      setMessage(
        `Restored ${result.books} books, ${result.chapters} chapters, ${result.notes} notes, and ${result.images} images.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(undefined)
    }
  }

  async function handleRemoveSamples() {
    setBusy('samples')
    setError(undefined)
    try {
      const removed = await removeSampleBooks()
      setMessage(`Removed ${removed} sample ${removed === 1 ? 'book' : 'books'}.`)
      setConfirmingRemove(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove them.')
    } finally {
      setBusy(undefined)
    }
  }

  async function handleAddSamples() {
    setBusy('samples')
    setError(undefined)
    try {
      await installSampleBooks()
      setMessage('Sample books added to your shelf.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them.')
    } finally {
      setBusy(undefined)
    }
  }

  const showStorageWarning = isIos() && !isStandalone()

  return (
    <>
      <PageHeader title="Settings" />

      <SupportProject />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your library</h2>
        <p className={styles.stat}>
          {counts
            ? `${counts.books} books · ${counts.notes} notes · ${counts.images} images`
            : 'Counting…'}
        </p>
        <p className={styles.help}>
          Everything is stored on this device only. Nothing is uploaded, and nothing leaves
          unless you export it.
        </p>
      </section>

      {showStorageWarning && (
        <section className={styles.warning}>
          <h2 className={styles.warningTitle}>Add ReadNote to your Home Screen</h2>
          <p>
            Safari clears stored data for websites left unused for about a week. Installing
            ReadNote — <strong>Share → Add to Home Screen</strong> — exempts it from that and
            keeps your notes safe.
          </p>
          <p className={styles.warningNote}>
            One trade-off worth knowing: in-app dictation stops working once the app is
            launched from the Home Screen. Your keyboard's microphone key still works
            everywhere, so nothing is really lost.
          </p>
        </section>
      )}

      <AppearanceSettings />

      <LibraryImport />

      <TranslationSettings />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Backup</h2>
        <p className={styles.help}>
          Exports every book, chapter, note, and photo into a single file. This is the only
          copy of your notes that exists outside this device — worth doing now and then.
        </p>

        {Capacitor.isNativePlatform() && (
          // The single most destructive thing available, and nothing else warns about it:
          // iOS deletes the app's container along with the app, taking every note with it.
          // Re-signing the app each week is safe; deleting it is not.
          <p className={styles.help}>
            <strong>Before you ever delete ReadNote, export.</strong> Removing the app erases
            everything in it. Re-signing it each week keeps your notes; deleting does not.
          </p>
        )}

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleExport()}
            disabled={busy !== undefined}
          >
            {busy === 'export' ? 'Preparing…' : 'Export backup'}
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== undefined}
          >
            {busy === 'import' ? 'Restoring…' : 'Restore from file'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => void handleImport(event)}
            tabIndex={-1}
          />
        </div>
      </section>

      {message && <p className={styles.message}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sample books</h2>

        {samples && samples.books > 0 ? (
          <>
            <p className={styles.help}>
              Eight books that came with the app to show what a full shelf looks like.
              Clearing them leaves everything you added untouched — they are removed by the
              mark they were installed with, not by title.
            </p>

            {confirmingRemove ? (
              <>
                <p className={styles.help}>
                  Removes {samples.books} {samples.books === 1 ? 'book' : 'books'} and the{' '}
                  {samples.notes} {samples.notes === 1 ? 'note' : 'notes'} that came with them.
                  If you have written notes of your own on any of these, those go too.
                </p>
                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep them
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void handleRemoveSamples()}
                    disabled={busy !== undefined}
                  >
                    {busy === 'samples' ? 'Removing…' : 'Remove them'}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirmingRemove(true)}
              >
                Clear the {samples.books} sample books
              </button>
            )}
          </>
        ) : (
          <>
            <p className={styles.help}>
              Eight books with chapters and notes already in them, for seeing how the shelf,
              summaries and stats look before your own library has filled up. They add
              alongside your books and can be cleared again here.
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleAddSamples()}
              disabled={busy !== undefined}
            >
              {busy === 'samples' ? 'Adding…' : 'Add the sample books'}
            </button>
          </>
        )}
      </section>

      <SyncSettings />

      <FriendsSettings />

      <NativeDiagnostics />

      <p className={styles.version}>ReadNote v0.1 — a personal reading journal.</p>
    </>
  )
}
