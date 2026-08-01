/**
 * The decision at the heart of sync: for one row, which side wins?
 *
 * Kept as a pure function, separate from anything that touches the network or the
 * database, because this is where sync loses people's notes. Every other part of the
 * feature fails loudly — a bad key, a dropped connection — but a wrong answer here
 * silently overwrites something someone wrote. It is the one part that has to be
 * tested exhaustively, and it cannot be tested at all if it is tangled up with IO.
 */

export type MergeOutcome =
  /** Remote is newer: write it over the local row. */
  | 'take-remote'
  /** Local is newer: send it up. */
  | 'push-local'
  /** Deleted somewhere, and the deletion is the most recent thing that happened. */
  | 'delete-local'
  /** Identical, or nothing to do. */
  | 'skip'

export interface Timestamped {
  id: string
  updatedAt: string
}

export interface MergeInput {
  local?: Timestamped
  remote?: Timestamped
  /** When this id was deleted locally, if it was. */
  localDeletedAt?: string
  /** When this id was deleted remotely, if it was. */
  remoteDeletedAt?: string
}

/**
 * Last write wins, where a deletion counts as a write.
 *
 * The subtle case is a row edited on one device and deleted on the other. Treating
 * deletion as just another timestamped event is what makes that decidable: whichever
 * happened later is what the reader last intended. The alternative — always letting
 * deletion win — means an edit made after a delete is thrown away, and always letting
 * an edit win means deleted notes come back from the dead.
 */
export function decide(input: MergeInput): MergeOutcome {
  const { local, remote, localDeletedAt, remoteDeletedAt } = input

  // Deleted on both sides, or deleted here and never known there: nothing to resolve.
  if (localDeletedAt && remoteDeletedAt) return 'skip'

  if (remoteDeletedAt) {
    // Deleted there. An edit here after that deletion is a deliberate revival.
    if (local && isAfter(local.updatedAt, remoteDeletedAt)) return 'push-local'
    return local ? 'delete-local' : 'skip'
  }

  if (localDeletedAt) {
    // Deleted here. An edit there after that deletion means the other device wants it.
    if (remote && isAfter(remote.updatedAt, localDeletedAt)) return 'take-remote'
    // Otherwise the deletion still needs pushing, which the caller handles from the
    // tombstone list — there is no local row left to send.
    return 'skip'
  }

  if (!local && !remote) return 'skip'
  if (!local) return 'take-remote'
  if (!remote) return 'push-local'

  if (isAfter(remote.updatedAt, local.updatedAt)) return 'take-remote'
  if (isAfter(local.updatedAt, remote.updatedAt)) return 'push-local'
  return 'skip'
}

/**
 * ISO-8601 strings in a fixed offset compare correctly as strings, but nothing
 * guarantees every row was written with the same offset — a backup restored from
 * another machine need not have been. Parsing is the honest comparison.
 */
function isAfter(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b)
}
