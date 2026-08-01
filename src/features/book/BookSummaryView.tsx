import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { listNotesByBook } from '../../data/repo/notes'
import { listChapters } from '../../data/repo/chapters'
import PageHeader from '../../components/PageHeader'
import styles from './BookSummaryView.module.css'

/**
 * Every note for a book, gathered into one read-through.
 *
 * Aggregation only, and permanently so — this is a settled decision rather than a
 * placeholder. The notes appear as written, in reading order, with nothing rewritten.
 * They are the reader's own words about their own reading; a model summarising them
 * would replace the one thing here that cannot be got anywhere else. It would also
 * need an API key, which a static app cannot hold, and a bill for every book finished.
 *
 * The summary needs no generating step for the same reason: there is nothing to
 * compute. It is always current, works offline, and costs nothing.
 */
export default function BookSummaryView() {
  const { bookId = '' } = useParams()

  const book = useLiveQuery(() => db.books.get(bookId), [bookId])
  const chapters = useLiveQuery(() => listChapters(bookId), [bookId])
  const notes = useLiveQuery(() => listNotesByBook(bookId), [bookId])

  const sections = useMemo(() => {
    if (!chapters || !notes) return undefined

    const byChapter = new Map<string, typeof notes>()
    for (const note of notes) {
      const bucket = byChapter.get(note.chapterId)
      if (bucket) bucket.push(note)
      else byChapter.set(note.chapterId, [note])
    }

    return chapters
      .map((chapter) => ({ chapter, notes: byChapter.get(chapter.id) ?? [] }))
      .filter((section) => section.notes.length > 0)
  }, [chapters, notes])

  if (book === undefined || sections === undefined) {
    return <p className={styles.loading}>Gathering your notes…</p>
  }
  if (book === null) return <p className={styles.loading}>That book is no longer on your shelf.</p>

  const totalNotes = notes?.length ?? 0

  return (
    <>
      <PageHeader
        title="Summary"
        subtitle={book.title}
        backTo={`/book/${bookId}`}
      />

      <div className={styles.masthead}>
        <p className={styles.mastheadMeta}>
          {totalNotes} {totalNotes === 1 ? 'note' : 'notes'} across {sections.length}{' '}
          {sections.length === 1 ? 'chapter' : 'chapters'}
          {book.dateFinished && ` · finished ${formatDate(book.dateFinished)}`}
        </p>
        {book.authors.length > 0 && <p className={styles.byline}>{book.authors.join(', ')}</p>}
      </div>

      {sections.length === 0 ? (
        <p className={styles.empty}>
          No notes yet. Once you capture a few key ideas they'll gather here.
        </p>
      ) : (
        <div className={styles.sections}>
          {sections.map(({ chapter, notes: chapterNotes }) => (
            <section key={chapter.id} className={styles.section}>
              <h2 className={styles.chapterHeading}>
                <span className={styles.chapterNumber}>{chapter.number}</span>
                {chapter.title}
              </h2>

              <ul className={styles.ideas}>
                {chapterNotes.map((note) => (
                  <li key={note.id} className={styles.idea}>
                    {note.content ? (
                      <p className={styles.ideaText}>{note.content}</p>
                    ) : note.ocrText ? (
                      <p className={styles.ideaText}>{note.ocrText}</p>
                    ) : (
                      <p className={styles.ideaMuted}>
                        {note.type === 'photo' ? 'Photograph with no caption' : 'Empty note'}
                      </p>
                    )}

                    {/* A captioned photo still carries its extracted text — surface it
                        quietly underneath rather than hiding it from the summary. */}
                    {note.content && note.ocrText && (
                      <p className={styles.ideaOcr}>{note.ocrText}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
