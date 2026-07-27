import { db } from '../data/db'
import type { Book, Chapter, ImageBlob, Note, Setting } from '../data/types'

/**
 * Whole-library export and import.
 *
 * This is the real safety net for a local-first app. Two things can lose the library:
 * Safari evicts script-writable storage for sites unused for seven days (installing to
 * the Home Screen exempts the app, but that's a setting the user has to know about),
 * and clearing website data wipes IndexedDB with no warning. Neither is recoverable
 * without a file the user actually holds.
 *
 * Images are inlined as base64. That inflates the file by roughly a third, but it keeps
 * a backup to a single file that can be emailed or dropped in iCloud — a zip would need
 * a dependency and an extra step at exactly the moment someone is trying to restore.
 */

const EXPORT_VERSION = 1

export interface BackupFile {
  format: 'booknotes-backup'
  version: number
  exportedAt: string
  books: Book[]
  chapters: Chapter[]
  notes: Note[]
  /** Blob replaced by a base64 data string; rebuilt on import. */
  images: Array<Omit<ImageBlob, 'blob'> & { data: string }>
  settings: Setting[]
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  // Chunked to stay well under the argument-count limit of String.fromCharCode,
  // which a multi-megabyte photo would blow past in a single call.
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

export async function buildBackup(): Promise<BackupFile> {
  const [books, chapters, notes, images, settings] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.notes.toArray(),
    db.images.toArray(),
    db.settings.toArray(),
  ])

  const encodedImages = await Promise.all(
    images.map(async ({ blob, ...rest }) => ({
      ...rest,
      data: await blobToBase64(blob),
    })),
  )

  return {
    format: 'booknotes-backup',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    chapters,
    notes,
    images: encodedImages,
    settings,
  }
}

/** Build the backup and hand it to the browser as a download. */
export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `booknotes-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Give the download a moment to start before tearing down the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export interface ImportResult {
  books: number
  chapters: number
  notes: number
  images: number
}

/**
 * Restore from a backup file.
 *
 * Replaces the current library rather than merging. Merging sounds friendlier but
 * quietly produces duplicates and half-reconciled edits; "restore this file" is the
 * behaviour someone actually wants when they reach for a backup. The caller is
 * responsible for confirming first.
 */
export async function restoreBackup(file: File): Promise<ImportResult> {
  const text = await file.text()

  let parsed: BackupFile
  try {
    parsed = JSON.parse(text) as BackupFile
  } catch {
    throw new Error("That file isn't valid JSON.")
  }

  if (parsed.format !== 'booknotes-backup') {
    throw new Error("That doesn't look like a BookNotes backup.")
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(
      `This backup was made by a newer version of BookNotes (v${parsed.version}). Update the app first.`,
    )
  }

  const images: ImageBlob[] = (parsed.images ?? []).map(({ data, ...rest }) => ({
    ...rest,
    blob: base64ToBlob(data, rest.mimeType),
  }))

  await db.transaction(
    'rw',
    db.books,
    db.chapters,
    db.notes,
    db.images,
    db.settings,
    async () => {
      await Promise.all([
        db.books.clear(),
        db.chapters.clear(),
        db.notes.clear(),
        db.images.clear(),
        db.settings.clear(),
      ])

      await db.books.bulkAdd(parsed.books ?? [])
      await db.chapters.bulkAdd(parsed.chapters ?? [])
      await db.notes.bulkAdd(parsed.notes ?? [])
      await db.images.bulkAdd(images)
      await db.settings.bulkAdd(parsed.settings ?? [])
    },
  )

  return {
    books: parsed.books?.length ?? 0,
    chapters: parsed.chapters?.length ?? 0,
    notes: parsed.notes?.length ?? 0,
    images: images.length,
  }
}
