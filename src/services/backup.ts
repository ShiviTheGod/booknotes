import { Capacitor } from '@capacitor/core'
import { db } from '../data/db'
import type { Book, Chapter, ImageBlob, Note, Review, Setting } from '../data/types'

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

/**
 * What new exports are stamped with, and what old ones carry.
 *
 * The app was called BookNotes until it was renamed, and backups made under that name
 * are still the only copy of someone's library. Restore accepts both; export writes
 * only the current one. A file that cannot be read back is not a backup.
 */
const FORMAT = 'readnote-backup'
const LEGACY_FORMATS = ['booknotes-backup']

export interface BackupFile {
  format: string
  version: number
  exportedAt: string
  books: Book[]
  chapters: Chapter[]
  notes: Note[]
  /** Blob replaced by a base64 data string; rebuilt on import. */
  images: Array<Omit<ImageBlob, 'blob'> & { data: string }>
  settings: Setting[]
  /** Optional: absent from files written before reviews existed. */
  reviews?: Review[]
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
  const [books, chapters, notes, images, settings, reviews] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.notes.toArray(),
    db.images.toArray(),
    db.settings.toArray(),
    db.reviews.toArray(),
  ])

  const encodedImages = await Promise.all(
    images.map(async ({ blob, ...rest }) => ({
      ...rest,
      data: await blobToBase64(blob),
    })),
  )

  return {
    format: FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    chapters,
    notes,
    images: encodedImages,
    settings,
    reviews,
  }
}

function backupFilename(): string {
  return `readnote-${new Date().toISOString().slice(0, 10)}.json`
}

/**
 * Build the backup and get it out of the app.
 *
 * Two routes, because the browser one does not work in the installed app:
 * WKWebView refuses `blob:` URLs on a link with the `download` attribute, a
 * long-standing WebKit limitation. In the native shell the export button would
 * simply do nothing — no file, no error — which is a poor property for the only
 * safety net standing between the reader and losing every note when the app is
 * deleted. So on iOS the file is written to disk and handed to the share sheet.
 */
export async function downloadBackup(): Promise<void> {
  const json = JSON.stringify(await buildBackup())

  if (Capacitor.isNativePlatform()) {
    await exportViaShareSheet(json)
    return
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = backupFilename()
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Give the download a moment to start before tearing down the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function exportViaShareSheet(json: string): Promise<void> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const path = backupFilename()

  // Cache rather than Documents: this is a hand-off file, not something the reader
  // needs to find again inside the app, and iOS may reclaim it once shared.
  await Filesystem.writeFile({
    path,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })

  // The share sheet is what makes the file reachable — Save to Files, iCloud Drive,
  // AirDrop, mail. Without it the JSON would sit in a sandbox the reader cannot open.
  await Share.share({
    title: 'ReadNote backup',
    text: 'Your ReadNote library.',
    url: uri,
    dialogTitle: 'Save your ReadNote backup',
  })
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

  if (parsed.format !== FORMAT && !LEGACY_FORMATS.includes(parsed.format)) {
    throw new Error("That doesn't look like a ReadNote backup.")
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error(
      `This backup was made by a newer version of ReadNote (v${parsed.version}). Update the app first.`,
    )
  }

  const images: ImageBlob[] = (parsed.images ?? []).map(({ data, ...rest }) => ({
    ...rest,
    blob: base64ToBlob(data, rest.mimeType),
  }))

  // Array form rather than a table per argument: Dexie's typed overloads stop at five.
  await db.transaction(
    'rw',
    [db.books, db.chapters, db.notes, db.images, db.settings, db.tombstones, db.reviews],
    async () => {
      await Promise.all([
        db.books.clear(),
        db.chapters.clear(),
        db.notes.clear(),
        db.images.clear(),
        db.settings.clear(),
        db.reviews.clear(),
        // Restoring reinstates rows by their original ids, and any of those ids may
        // have been deleted here since the backup was taken. Leaving the gravestones
        // in place would let the next sync delete the very notes just restored.
        db.tombstones.clear(),
      ])

      await db.books.bulkAdd(parsed.books ?? [])
      await db.chapters.bulkAdd(parsed.chapters ?? [])
      await db.notes.bulkAdd(parsed.notes ?? [])
      await db.images.bulkAdd(images)
      await db.settings.bulkAdd(parsed.settings ?? [])
      await db.reviews.bulkAdd(parsed.reviews ?? [])
    },
  )

  return {
    books: parsed.books?.length ?? 0,
    chapters: parsed.chapters?.length ?? 0,
    notes: parsed.notes?.length ?? 0,
    images: images.length,
  }
}
