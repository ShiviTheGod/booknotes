import { db, newId, nowIso } from '../db'
import type { Note, NoteType, OcrStatus } from '../types'
import { deleteImage } from './images'
import { recordTombstone } from './tombstones'

/**
 * The "up to ~5 key ideas per chapter" guideline.
 *
 * Enforced softly: the composer shows a counter that turns amber once you pass it,
 * but never blocks a save. The point is to nudge toward distilling rather than
 * transcribing — cutting someone off mid-thought would do more harm than the nudge does good.
 */
export const SOFT_NOTE_LIMIT = 5

export interface NewNote {
  bookId: string
  chapterId: string
  type: NoteType
  content: string
  imageBlobId?: string
  ocrStatus?: OcrStatus
}

export async function createNote(input: NewNote): Promise<Note> {
  const timestamp = nowIso()
  const note: Note = {
    id: newId(),
    bookId: input.bookId,
    chapterId: input.chapterId,
    type: input.type,
    content: input.content,
    imageBlobId: input.imageBlobId,
    // Photo notes start life as 'pending' so the OCR queue knows to pick them up.
    ocrStatus: input.ocrStatus ?? (input.type === 'photo' ? 'pending' : 'none'),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.notes.add(note)
  return note
}

export function getNote(id: string): Promise<Note | undefined> {
  return db.notes.get(id)
}

/** Notes for one chapter, oldest first. */
export function listNotesByChapter(chapterId: string): Promise<Note[]> {
  return db.notes
    .where('[chapterId+createdAt]')
    .between([chapterId, ''], [chapterId, '￿'])
    .toArray()
}

/** Every note for a book, oldest first. Backs the summary view in one query. */
export function listNotesByBook(bookId: string): Promise<Note[]> {
  return db.notes.where('[bookId+createdAt]').between([bookId, ''], [bookId, '￿']).toArray()
}

export function countNotesByChapter(chapterId: string): Promise<number> {
  return db.notes.where('chapterId').equals(chapterId).count()
}

export async function updateNote(id: string, changes: Partial<Note>): Promise<void> {
  await db.notes.update(id, { ...changes, updatedAt: nowIso() })
}

export async function deleteNote(id: string): Promise<void> {
  const note = await db.notes.get(id)
  await db.notes.delete(id)
  await recordTombstone('note', id)
  if (note?.imageBlobId) await deleteImage(note.imageBlobId)
}

/** Notes whose OCR hasn't run yet. Drives the background extraction queue. */
export function listPendingOcr(): Promise<Note[]> {
  return db.notes.where('ocrStatus').equals('pending').toArray()
}

/**
 * Free-text search across note bodies and extracted photo text.
 *
 * Deliberately a full scan rather than an index: IndexedDB has no substring index,
 * and a personal library is small enough (thousands of notes at most) that scanning
 * is instant. Revisit if this ever grows into the tens of thousands.
 */
export async function searchNotes(query: string): Promise<Note[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  return db.notes
    .filter((note) => {
      return (
        note.content.toLowerCase().includes(needle) ||
        (note.ocrText?.toLowerCase().includes(needle) ?? false) ||
        (note.translatedText?.toLowerCase().includes(needle) ?? false)
      )
    })
    .toArray()
}
