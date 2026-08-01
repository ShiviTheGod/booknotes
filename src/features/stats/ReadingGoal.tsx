import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { SETTING_KEYS, getSetting, setSetting } from '../../data/repo/settings'
import { computeGoalProgress } from './computeStats'
import styles from './ReadingGoal.module.css'

/**
 * A books-per-year goal, set and read in the same place.
 *
 * Not in Settings: a goal is something you glance at, and something you revise when
 * you glance at it. Making the number itself the control means changing it is one
 * tap from the progress it describes, rather than a trip to another screen and back.
 */
export default function ReadingGoal() {
  const goal = useLiveQuery(() => getSetting<number>(SETTING_KEYS.readingGoal, 0), [], undefined)
  const books = useLiveQuery(() => db.books.toArray(), [])

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Only seeds the field when the editor opens, so a live update from the other
  // device cannot overwrite what is being typed.
  useEffect(() => {
    if (editing) setDraft(goal ? String(goal) : '')
  }, [editing, goal])

  if (goal === undefined || books === undefined) return null

  const progress = computeGoalProgress(books, goal)

  async function commit() {
    const parsed = Number.parseInt(draft, 10)
    // An empty box or a zero clears the goal rather than being rejected — that is
    // the only way back out once one has been set.
    await setSetting(SETTING_KEYS.readingGoal, Number.isFinite(parsed) && parsed > 0 ? parsed : 0)
    setEditing(false)
  }

  if (editing) {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>Books this year</h2>
        <div className={styles.editRow}>
          <input
            className={styles.input}
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commit()
              if (event.key === 'Escape') setEditing(false)
            }}
            aria-label="Books to finish this year"
            enterKeyHint="done"
          />
          <button type="button" className={styles.save} onClick={() => void commit()}>
            Save
          </button>
          <button type="button" className={styles.cancel} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        <p className={styles.hint}>Leave it empty to drop the goal.</p>
      </section>
    )
  }

  if (!progress) {
    return (
      <section className={styles.card}>
        <h2 className={styles.title}>Books this year</h2>
        <p className={styles.hint}>
          Set a number to read towards, and this shows whether you are keeping up with it.
        </p>
        <button type="button" className={styles.set} onClick={() => setEditing(true)}>
          Set a goal
        </button>
      </section>
    )
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Books this year</h2>

      <button
        type="button"
        className={styles.countRow}
        onClick={() => setEditing(true)}
        aria-label={`${progress.finished} of ${progress.goal} books finished. Change the goal.`}
      >
        <span className={styles.count}>{progress.finished}</span>
        <span className={styles.of}>of {progress.goal}</span>
      </button>

      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.goal}
        aria-valuenow={progress.finished}
      >
        <div
          className={progress.done ? styles.fillDone : styles.fill}
          style={{ width: `${progress.fraction * 100}%` }}
        />
      </div>

      <p className={styles.pace}>{paceMessage(progress)}</p>
    </section>
  )
}

function paceMessage(progress: ReturnType<typeof computeGoalProgress>): string {
  if (!progress) return ''

  if (progress.done) {
    const over = progress.finished - progress.goal
    return over > 0
      ? `Goal met, and ${over} past it. The rest of the year is a bonus.`
      : 'Goal met. The rest of the year is a bonus.'
  }

  if (progress.daysLeft === 0) {
    return `The year is out, ${progress.remaining} short. Next one starts clean.`
  }

  const books = (count: number) => `${count} ${count === 1 ? 'book' : 'books'}`

  if (progress.aheadBy > 0) return `${books(progress.aheadBy)} ahead of pace.`
  if (progress.aheadBy < 0) return `${books(-progress.aheadBy)} behind pace.`

  return `Exactly on pace — ${books(progress.remaining)} to go, ${progress.daysLeft} days left.`
}
