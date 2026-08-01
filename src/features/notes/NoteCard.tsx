import { useEffect, useState } from 'react'
import type { Note } from '../../data/types'
import { deleteNote, updateNote } from '../../data/repo/notes'
import { getImageBlob } from '../../data/repo/images'
import { OCR_CONFIDENCE_THRESHOLD } from '../../services/ocr'
import styles from './NoteCard.module.css'

export default function NoteCard({ note }: { note: Note }) {
  const [imageUrl, setImageUrl] = useState<string>()
  const [showOcr, setShowOcr] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!note.imageBlobId) return

    let objectUrl: string | undefined
    let cancelled = false

    void getImageBlob(note.imageBlobId).then((blob) => {
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setImageUrl(objectUrl)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [note.imageBlobId])

  const hasOcrText = Boolean(note.ocrText && note.ocrText.length > 0)
  const lowConfidence =
    note.ocrConfidence !== undefined && note.ocrConfidence < OCR_CONFIDENCE_THRESHOLD

  // A photo note's body is a caption and may legitimately be empty. A typed or
  // dictated one *is* its text, so emptying it would leave a note that says nothing.
  const canSaveEdit = Boolean(note.imageBlobId) || draft.trim().length > 0

  async function saveEdit() {
    if (!canSaveEdit) return
    await updateNote(note.id, { content: draft.trim() })
    setEditing(false)
  }

  function startEditing() {
    setDraft(note.content ?? '')
    setEditing(true)
  }

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <span className={styles.type}>
          <TypeIcon type={note.type} />
          {note.type === 'voice' ? 'Dictated' : note.type === 'photo' ? 'Photo' : 'Note'}
        </span>
        <time className={styles.time} dateTime={note.createdAt}>
          {formatTimestamp(note.createdAt)}
        </time>
      </header>

      {imageUrl && (
        <img
          className={styles.photo}
          src={imageUrl}
          alt={note.content || 'Photographed page'}
          loading="lazy"
          decoding="async"
        />
      )}

      {editing ? (
        <div className={styles.editor}>
          <textarea
            className={styles.editorInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Note text"
            autoFocus
          />
          <div className={styles.editorActions}>
            {/* Visible Cancel, for the same reason the chapter rename has one: there
                is no Escape key on a phone. */}
            <button
              type="button"
              className={styles.editorCancel}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.editorSave}
              onClick={() => void saveEdit()}
              disabled={!canSaveEdit}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        note.content && <p className={styles.body}>{note.content}</p>
      )}

      {note.type === 'photo' && (
        <div className={styles.ocr}>
          {note.ocrStatus === 'pending' && (
            <span className={styles.ocrPending}>Reading the text in this photo…</span>
          )}

          {note.ocrStatus === 'failed' && (
            <span className={styles.ocrFailed}>Couldn't read text from this photo.</span>
          )}

          {note.ocrStatus === 'done' && !hasOcrText && (
            <span className={styles.ocrNone}>No readable text found.</span>
          )}

          {note.ocrStatus === 'done' && hasOcrText && (
            <>
              <button
                type="button"
                className={styles.ocrToggle}
                onClick={() => setShowOcr((open) => !open)}
                aria-expanded={showOcr}
              >
                {showOcr ? 'Hide extracted text' : 'Show extracted text'}
              </button>

              {lowConfidence && (
                // OCR fails silently: an unreadable photo still produces
                // confident-looking nonsense. Without this the reader would have no
                // signal that what landed in their searchable notes is unreliable.
                <p className={styles.ocrWarning}>
                  Hard to read — this text is likely inaccurate.
                </p>
              )}
              {showOcr && (
                <div className={styles.ocrText}>
                  <p className={styles.ocrLabel}>
                    Extracted text — searchable, and kept separate from the photo itself.
                  </p>
                  <pre className={styles.ocrPre}>{note.ocrText}</pre>
                  {note.translatedText && (
                    <>
                      <p className={styles.ocrLabel}>Translation</p>
                      <pre className={styles.ocrPre}>{note.translatedText}</pre>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <footer className={styles.footer}>
        {confirming ? (
          <span className={styles.confirm}>
            <span>Delete this note?</span>
            <button type="button" className={styles.keep} onClick={() => setConfirming(false)}>
              Keep
            </button>
            <button
              type="button"
              className={styles.delete}
              onClick={() => void deleteNote(note.id)}
            >
              Delete
            </button>
          </span>
        ) : (
          !editing && (
            <>
              {note.updatedAt && note.updatedAt !== note.createdAt && (
                <span className={styles.edited}>edited</span>
              )}
              <button type="button" className={styles.editLink} onClick={startEditing}>
                Edit
              </button>
              <button
                type="button"
                className={styles.deleteLink}
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            </>
          )
        )}
      </footer>
    </article>
  )
}

function TypeIcon({ type }: { type: Note['type'] }) {
  if (type === 'voice') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'photo') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 5h14M5 10h14M5 15h9" strokeLinecap="round" />
    </svg>
  )
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
