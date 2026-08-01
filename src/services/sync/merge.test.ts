import { describe, expect, it } from 'vitest'
import { decide } from './merge'

/**
 * Every case here is a way a reader could lose something they wrote.
 *
 * Two devices, two people's worth of edits from one person, and no server refereeing
 * in real time. The cases that matter are not "which timestamp is bigger" — they are
 * the ones where a deletion and an edit race each other, because those are the ones
 * where a plausible-looking rule quietly destroys data.
 */

const EARLY = '2026-08-01T10:00:00.000Z'
const MIDDLE = '2026-08-01T11:00:00.000Z'
const LATE = '2026-08-01T12:00:00.000Z'

const row = (updatedAt: string) => ({ id: 'n1', updatedAt })

describe('decide', () => {
  it('takes whichever side was edited more recently', () => {
    expect(decide({ local: row(EARLY), remote: row(LATE) })).toBe('take-remote')
    expect(decide({ local: row(LATE), remote: row(EARLY) })).toBe('push-local')
  })

  it('does nothing when both sides are at the same version', () => {
    expect(decide({ local: row(MIDDLE), remote: row(MIDDLE) })).toBe('skip')
  })

  it('carries rows the other side has never seen', () => {
    expect(decide({ remote: row(MIDDLE) })).toBe('take-remote')
    expect(decide({ local: row(MIDDLE) })).toBe('push-local')
    expect(decide({})).toBe('skip')
  })

  it('applies a deletion made on the other device', () => {
    // The note still exists here and was last touched before it was deleted there.
    expect(decide({ local: row(EARLY), remoteDeletedAt: LATE })).toBe('delete-local')
  })

  it('keeps a note edited here after it was deleted there', () => {
    // Someone deleted it on the iPad, then wrote into it on the phone. The writing is
    // the later intent, so the note lives and goes back up. Letting the deletion win
    // here would throw away text typed after it.
    expect(decide({ local: row(LATE), remoteDeletedAt: EARLY })).toBe('push-local')
  })

  it('accepts a note edited on the other device after being deleted here', () => {
    // The mirror image, and the reason deletion cannot simply always win.
    expect(decide({ remote: row(LATE), localDeletedAt: EARLY })).toBe('take-remote')
  })

  it('leaves a note deleted here that was not touched there afterwards', () => {
    // Nothing to apply locally — it is already gone. The tombstone still has to be
    // pushed, which is the caller's job, not this decision's.
    expect(decide({ remote: row(EARLY), localDeletedAt: LATE })).toBe('skip')
  })

  it('does not resurrect something deleted on both devices', () => {
    expect(decide({ localDeletedAt: EARLY, remoteDeletedAt: LATE })).toBe('skip')
    expect(decide({ local: row(EARLY), localDeletedAt: MIDDLE, remoteDeletedAt: LATE })).toBe(
      'skip',
    )
  })

  it('compares instants rather than strings', () => {
    // The same moment written with different offsets. A string comparison would call
    // the second one later and silently pick the wrong side.
    const utc = { id: 'n1', updatedAt: '2026-08-01T12:00:00.000Z' }
    const offset = { id: 'n1', updatedAt: '2026-08-01T14:00:00.000+02:00' }

    expect(decide({ local: utc, remote: offset })).toBe('skip')
  })

  it('treats a deletion at the exact edit time as the later event', () => {
    // A tie goes to the deletion: isAfter is strict, so an edit stamped identically
    // does not count as "after" the delete. Arbitrary, but it has to be decided, and
    // this way round means a delete is never quietly ignored.
    expect(decide({ local: row(MIDDLE), remoteDeletedAt: MIDDLE })).toBe('delete-local')
  })
})
