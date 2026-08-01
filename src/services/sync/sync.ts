import { db, nowIso } from '../../data/db'
import { getSetting, setSetting } from '../../data/repo/settings'
import { clearTombstones, listTombstones, recordTombstones } from '../../data/repo/tombstones'
import type { Book, Chapter, Note, SyncEntity } from '../../data/types'
import { getClient, SYNC_KEYS } from './client'
import { decide, type Timestamped } from './merge'

/**
 * Manual, text-only synchronisation between the reader's own devices.
 *
 * Three deliberate limits, each of which removes a class of failure rather than a
 * feature:
 *
 * - **Manual.** Nothing syncs until the reader asks. Background sync means data
 *   moving while nobody is watching, and this is the only code in the app that can
 *   destroy notes on two devices at once.
 * - **Text only.** Books, chapters, notes, extracted text and translations travel;
 *   photographs stay on the device that took them. That keeps a library inside the
 *   free tier indefinitely and keeps photographs of pages off a server.
 * - **One table.** Everything lands in `sync_rows` as JSON. The server never queries
 *   inside a row, so mirroring the schema in SQL would buy nothing and cost a
 *   migration every time a field is added.
 */

/** Photographs never leave the device, so the blob reference is stripped on the way up. */
type SyncableNote = Omit<Note, 'imageBlobId'>

interface RemoteRow {
  entity: SyncEntity
  id: string
  updated_at: string
  deleted_at: string | null
  data: Record<string, unknown> | null
  server_at: string
}

export interface SyncReport {
  pulled: number
  pushed: number
  deletedHere: number
  deletedThere: number
  at: string
}

export async function runSync(): Promise<SyncReport> {
  const client = await getClient()
  if (!client) throw new Error('Sync is not set up yet.')

  const { data: userData } = await client.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Sign in before syncing.')

  const lastPulledAt = await getSetting<string>(SYNC_KEYS.lastPulledAt, '')
  const lastPushedAt = await getSetting<string>(SYNC_KEYS.lastPushedAt, '')

  // Taken before pushing, so anything written while this sync runs is caught by the
  // next one rather than being skipped by a watermark set too late.
  const pushStartedAt = nowIso()

  const report = await pull(client, lastPulledAt)
  const pushed = await push(client, userId, lastPushedAt)

  await setSetting(SYNC_KEYS.lastPushedAt, pushStartedAt)

  return { ...report, pushed, at: nowIso() }
}

async function pull(
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>,
  since: string,
): Promise<Omit<SyncReport, 'pushed' | 'at'>> {
  let query = client.from('sync_rows').select('entity,id,updated_at,deleted_at,data,server_at')
  // RLS already restricts this to the signed-in user; the filter is only the watermark.
  if (since) query = query.gt('server_at', since)

  const { data, error } = await query.order('server_at', { ascending: true })
  if (error) throw new Error(`Could not read from Supabase: ${error.message}`)

  const rows = (data ?? []) as RemoteRow[]
  if (rows.length === 0) return { pulled: 0, deletedHere: 0, deletedThere: 0 }

  const tombstones = new Map((await listTombstones()).map((t) => [t.id, t.deletedAt]))

  let pulled = 0
  let deletedHere = 0
  const deletedThere = rows.filter((row) => row.deleted_at).length

  for (const row of rows) {
    const local = await readLocal(row.entity, row.id)

    const outcome = decide({
      local: local ? ({ id: local.id, updatedAt: localStamp(local) } as Timestamped) : undefined,
      remote: row.deleted_at ? undefined : { id: row.id, updatedAt: row.updated_at },
      localDeletedAt: tombstones.get(row.id),
      remoteDeletedAt: row.deleted_at ?? undefined,
    })

    if (outcome === 'take-remote' && row.data) {
      await writeLocal(row.entity, row.data)
      // A row coming back down outranks a local gravestone for the same id, or the
      // next sync would delete what was just accepted.
      await clearTombstones([row.id])
      pulled += 1
    } else if (outcome === 'delete-local') {
      await deleteLocal(row.entity, row.id)
      // Recorded rather than silently removed, so this device agrees the row is gone
      // instead of treating it as missing and pushing it back up.
      await recordTombstones(row.entity, [row.id])
      deletedHere += 1
    }
  }

  const newest = rows[rows.length - 1].server_at
  await setSetting(SYNC_KEYS.lastPulledAt, newest)

  return { pulled, deletedHere, deletedThere }
}

async function push(
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>,
  userId: string,
  since: string,
): Promise<number> {
  const [books, chapters, notes, tombstones] = await Promise.all([
    db.books.toArray(),
    db.chapters.toArray(),
    db.notes.toArray(),
    listTombstones(),
  ])

  const changed = (stamp: string) => !since || Date.parse(stamp) > Date.parse(since)

  const payload = [
    ...books
      .filter((book) => changed(book.updatedAt))
      .map((book) => toRow(userId, 'book', book.id, book.updatedAt, book)),
    ...chapters
      .filter((chapter) => changed(localStamp(chapter)))
      .map((chapter) =>
        toRow(userId, 'chapter', chapter.id, localStamp(chapter), chapter),
      ),
    ...notes
      .filter((note) => changed(note.updatedAt))
      // The photograph stays here. Everything read out of it travels.
      .map(({ imageBlobId: _imageBlobId, ...rest }) =>
        toRow(userId, 'note', rest.id, rest.updatedAt, rest satisfies SyncableNote),
      ),
    ...tombstones
      .filter((tombstone) => changed(tombstone.deletedAt))
      .map((tombstone) => ({
        user_id: userId,
        entity: tombstone.entity,
        id: tombstone.id,
        updated_at: tombstone.deletedAt,
        deleted_at: tombstone.deletedAt,
        data: null,
      })),
  ]

  if (payload.length === 0) return 0

  // Chunked because Supabase rejects very large request bodies, and a first sync of a
  // long-established library sends everything at once.
  const CHUNK = 200
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await client
      .from('sync_rows')
      .upsert(payload.slice(i, i + CHUNK), { onConflict: 'user_id,entity,id' })
    if (error) throw new Error(`Could not write to Supabase: ${error.message}`)
  }

  return payload.length
}

function toRow(
  userId: string,
  entity: SyncEntity,
  id: string,
  updatedAt: string,
  data: unknown,
) {
  return { user_id: userId, entity, id, updated_at: updatedAt, deleted_at: null, data }
}

/** Chapters predate sync and may have no updatedAt; an unedited chapter is as old as it is. */
function localStamp(row: Book | Chapter | Note): string {
  return 'updatedAt' in row && row.updatedAt ? row.updatedAt : row.createdAt
}

async function readLocal(
  entity: SyncEntity,
  id: string,
): Promise<Book | Chapter | Note | undefined> {
  if (entity === 'book') return db.books.get(id)
  if (entity === 'chapter') return db.chapters.get(id)
  return db.notes.get(id)
}

async function writeLocal(entity: SyncEntity, data: Record<string, unknown>): Promise<void> {
  if (entity === 'book') {
    await db.books.put(data as unknown as Book)
    return
  }
  if (entity === 'chapter') {
    await db.chapters.put(data as unknown as Chapter)
    return
  }

  // A note arriving from the other device carries no imageBlobId. If this device
  // already holds the photograph, keep the link — overwriting it with nothing would
  // orphan an image that is still on disk and strip the picture off the note.
  const incoming = data as unknown as SyncableNote
  const existing = await db.notes.get(incoming.id)
  await db.notes.put({ ...incoming, imageBlobId: existing?.imageBlobId })
}

async function deleteLocal(entity: SyncEntity, id: string): Promise<void> {
  if (entity === 'book') await db.books.delete(id)
  else if (entity === 'chapter') await db.chapters.delete(id)
  else await db.notes.delete(id)
}
