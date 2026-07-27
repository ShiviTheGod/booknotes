import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { listNotesByChapter, SOFT_NOTE_LIMIT } from '../../data/repo/notes'
import { updateChapter } from '../../data/repo/chapters'
import PageHeader from '../../components/PageHeader'
import NoteComposer from './NoteComposer'
import NoteCard from './NoteCard'
import styles from './ChapterNotesView.module.css'

export default function ChapterNotesView() {
  const { bookId = '', chapterId = '' } = useParams()

  const book = useLiveQuery(() => db.books.get(bookId), [bookId])
  const chapter = useLiveQuery(() => db.chapters.get(chapterId), [chapterId])
  const notes = useLiveQuery(() => listNotesByChapter(chapterId), [chapterId])

  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  if (chapter === undefined) return <p className={styles.loading}>Loading…</p>
  if (chapter === null) return <p className={styles.loading}>That chapter no longer exists.</p>

  const count = notes?.length ?? 0
  const overSoftLimit = count > SOFT_NOTE_LIMIT

  async function saveTitle() {
    const next = draftTitle.trim()
    if (next) await updateChapter(chapterId, { title: next })
    setRenaming(false)
  }

  return (
    <>
      <PageHeader
        title={`Chapter ${chapter.number}`}
        subtitle={book?.title}
        backTo={`/book/${bookId}`}
      />

      {renaming ? (
        <div className={styles.renameRow}>
          <input
            className={styles.renameInput}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void saveTitle()
              if (event.key === 'Escape') setRenaming(false)
            }}
            aria-label="Chapter title"
            autoFocus
          />
          {/* A visible Cancel is not optional here: there is no Escape key on a phone,
              so without it a mis-tapped rename has no way out. */}
          <button
            type="button"
            className={styles.renameCancel}
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
          <button type="button" className={styles.renameSave} onClick={() => void saveTitle()}>
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.chapterTitle}
          onClick={() => {
            setDraftTitle(chapter.title)
            setRenaming(true)
          }}
        >
          {chapter.title}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className={styles.counter}>
        <span className={overSoftLimit ? styles.counterOver : styles.counterValue}>
          {count} of ~{SOFT_NOTE_LIMIT} key ideas
        </span>
        {overSoftLimit && (
          <span className={styles.counterNote}>
            Past the guideline — worth asking whether any of these can merge.
          </span>
        )}
      </div>

      <NoteComposer bookId={bookId} chapterId={chapterId} />

      {notes && notes.length > 0 ? (
        <ul className={styles.noteList}>
          {notes.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyNotes}>
          No notes in this chapter yet. What's the one idea worth keeping?
        </p>
      )}
    </>
  )
}
