import { db, nowIso } from '../db'
import type { SyncEntity, Tombstone } from '../types'

/**
 * Records of things deleted on this device.
 *
 * Every delete in the repositories writes one. It costs a row nobody reads until
 * sync is switched on, and it is the only way a deletion can ever reach another
 * device: without it the other side sees a row this device no longer has, assumes
 * this device is behind, and pushes the row back. The note would be undeletable.
 *
 * Writing them unconditionally — rather than only while sync is configured — matters,
 * because otherwise everything deleted before the first sign-in would come flooding
 * back on the first sync.
 */

export async function recordTombstone(entity: SyncEntity, id: string): Promise<void> {
  await db.tombstones.put({ id, entity, deletedAt: nowIso() })
}

export async function recordTombstones(entity: SyncEntity, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const deletedAt = nowIso()
  await db.tombstones.bulkPut(ids.map((id) => ({ id, entity, deletedAt })))
}

export function listTombstones(): Promise<Tombstone[]> {
  return db.tombstones.toArray()
}

/**
 * Forget a tombstone.
 *
 * Used when a row is recreated with an id that was previously deleted — restoring a
 * backup does exactly this — so the resurrected row is not deleted again by its own
 * stale gravestone on the next sync.
 */
export async function clearTombstone(id: string): Promise<void> {
  await db.tombstones.delete(id)
}

export async function clearTombstones(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.tombstones.bulkDelete(ids)
}
