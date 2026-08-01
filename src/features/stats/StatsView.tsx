import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import PageHeader from '../../components/PageHeader'
import ReadingGoal from './ReadingGoal'
import { computeStats } from './computeStats'
import styles from './StatsView.module.css'

export default function StatsView() {
  const stats = useLiveQuery(async () => {
    const [books, notes] = await Promise.all([db.books.toArray(), db.notes.toArray()])
    return computeStats(books, notes)
  }, [])

  if (!stats) return <p className={styles.loading}>Counting…</p>

  const peakMonth = Math.max(1, ...stats.finishedPerMonth.map((month) => month.count))

  return (
    <>
      <PageHeader title="Stats" subtitle="What your reading looks like over time" />

      <ReadingGoal />

      <div className={styles.tiles}>
        <Tile value={stats.finishedBooks} label="Books finished" />
        <Tile value={stats.totalNotes} label="Notes captured" />
        <Tile
          value={stats.pagesRead.toLocaleString()}
          label="Pages read"
          footnote={
            stats.booksMissingPageCount > 0
              ? `${stats.booksMissingPageCount} book${stats.booksMissingPageCount === 1 ? '' : 's'} without a page count`
              : undefined
          }
        />
        <Tile value={stats.readingBooks} label="In progress" />
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Note streak</h2>

        <div className={styles.streak}>
          <div className={styles.streakMain}>
            <span className={styles.streakValue}>{stats.currentStreak}</span>
            <span className={styles.streakUnit}>
              {stats.currentStreak === 1 ? 'day' : 'days'} running
            </span>
          </div>

          <p className={styles.streakNote}>
            {stats.currentStreak === 0
              ? 'No streak yet — one note today starts it.'
              : stats.notedToday
                ? 'Today is counted. Nicely done.'
                : 'Yesterday counted. A note today keeps it going.'}
          </p>

          {stats.longestStreak > 0 && (
            <p className={styles.streakBest}>Longest run: {stats.longestStreak} days</p>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Books finished by month</h2>

        {stats.finishedBooks === 0 ? (
          <p className={styles.empty}>Nothing finished yet.</p>
        ) : (
          <div className={styles.chart}>
            {stats.finishedPerMonth.map((month) => (
              <div key={month.key} className={styles.barColumn}>
                <span className={styles.barCount}>{month.count > 0 ? month.count : ''}</span>
                <div
                  className={month.count > 0 ? styles.bar : styles.barEmpty}
                  /* Reserve a sliver of height for zero months so the baseline reads
                     as a continuous axis rather than a broken row. */
                  style={{ height: `${Math.max(3, (month.count / peakMonth) * 100)}%` }}
                  role="img"
                  aria-label={`${month.count} finished in ${month.label}`}
                />
                <span className={styles.barLabel}>{month.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {stats.totalBooks > 0 && (
        <p className={styles.footnote}>
          Averaging {stats.averageNotesPerBook.toFixed(1)} notes per book across{' '}
          {stats.totalBooks} {stats.totalBooks === 1 ? 'book' : 'books'}.
        </p>
      )}
    </>
  )
}

function Tile({
  value,
  label,
  footnote,
}: {
  value: number | string
  label: string
  footnote?: string
}) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileLabel}>{label}</span>
      {footnote && <span className={styles.tileFootnote}>{footnote}</span>}
    </div>
  )
}
