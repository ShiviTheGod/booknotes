import { db, newId, nowIso } from '../db'
import type { Chapter } from '../types'
import { deleteImage } from './images'
import { recordTombstone, recordTombstones } from './tombstones'

/** Chapters for a book, in reading order. */
export function listChapters(bookId: string): Promise<Chapter[]> {
  return db.chapters.where('[bookId+number]').between([bookId, 0], [bookId, Infinity]).toArray()
}

export function getChapter(id: string): Promise<Chapter | undefined> {
  return db.chapters.get(id)
}

export async function createChapter(
  bookId: string,
  title: string,
  number?: number,
): Promise<Chapter> {
  const resolvedNumber = number ?? (await nextChapterNumber(bookId))
  const chapter: Chapter = {
    id: newId(),
    bookId,
    number: resolvedNumber,
    title: title.trim() || `Chapter ${resolvedNumber}`,
    createdAt: nowIso(),
  }
  await db.chapters.add(chapter)
  return chapter
}

async function nextChapterNumber(bookId: string): Promise<number> {
  const existing = await listChapters(bookId)
  return existing.length === 0 ? 1 : Math.max(...existing.map((c) => c.number)) + 1
}

export async function updateChapter(id: string, changes: Partial<Chapter>): Promise<void> {
  // Stamped so sync can tell which side of a conflict is the newer one.
  await db.chapters.update(id, { ...changes, updatedAt: nowIso() })
}

/** Delete a chapter along with its notes and their images. */
export async function deleteChapter(id: string): Promise<void> {
  const imageIds: string[] = []

  await db.transaction('rw', db.chapters, db.notes, db.tombstones, async () => {
    const notes = await db.notes.where('chapterId').equals(id).toArray()
    for (const note of notes) {
      if (note.imageBlobId) imageIds.push(note.imageBlobId)
    }
    await db.notes.where('chapterId').equals(id).delete()
    await db.chapters.delete(id)

    await recordTombstones(
      'note',
      notes.map((note) => note.id),
    )
    await recordTombstone('chapter', id)
  })

  await Promise.all(imageIds.map(deleteImage))
}

/**
 * Create `count` blank chapters in one go.
 *
 * Used by the "generate chapters" shortcut on the book screen, where the usual
 * starting point is a page count and a guess at chapter length rather than a real
 * table of contents. Titles are intentionally plain — they're meant to be renamed.
 */
export async function generateChapters(bookId: string, count: number): Promise<Chapter[]> {
  const start = await nextChapterNumber(bookId)
  const timestamp = nowIso()
  const chapters: Chapter[] = Array.from({ length: count }, (_, i) => ({
    id: newId(),
    bookId,
    number: start + i,
    title: `Chapter ${start + i}`,
    createdAt: timestamp,
  }))
  await db.chapters.bulkAdd(chapters)
  return chapters
}

/**
 * Rough chapter-count suggestion from a page count.
 *
 * ~18 pages per chapter is a middling non-fiction average. This is a starting
 * suggestion the user can overwrite, not a claim about the actual book.
 */
export function suggestChapterCount(pageCount?: number): number {
  if (!pageCount || pageCount <= 0) return 10
  return Math.max(1, Math.min(40, Math.round(pageCount / 18)))
}
