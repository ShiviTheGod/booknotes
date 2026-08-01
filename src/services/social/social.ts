import type { Book, Review } from '../../data/types'
import { getClient } from '../sync/client'

/**
 * Friends and shared reviews.
 *
 * Everything here goes through database functions rather than table queries. That is
 * not ceremony: the profiles table is deliberately unreadable, so that holding the
 * anon key never becomes a way to list every address that has signed up. Each function
 * answers exactly one question — is there an account at this address, who am I
 * connected to, what reviews of this book may I see — and reveals nothing else.
 *
 * What is published is only ever a review: writing the reader composed knowing someone
 * else would read it. Notes never leave, and neither does `ocrText`, which is the
 * book's own words rather than the reader's.
 */

export type FriendStatus = 'pending' | 'accepted'
export type FriendDirection = 'incoming' | 'outgoing'

export interface Friend {
  friendId: string
  email: string
  status: FriendStatus
  direction: FriendDirection
}

export interface SharedReview {
  userId: string
  email: string
  rating?: number
  body: string
  updatedAt: string
}

export type RequestOutcome = 'requested' | 'accepted' | 'not-found' | 'self'

async function client() {
  const supabase = await getClient()
  if (!supabase) throw new Error('Connect your Supabase project in Settings first.')

  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('Sign in first.')

  return { supabase, userId: data.user.id }
}

/** Is sharing usable at all right now? Used to keep the UI quiet when it is not. */
export async function socialReady(): Promise<boolean> {
  const supabase = await getClient()
  if (!supabase) return false
  const { data } = await supabase.auth.getUser()
  return Boolean(data.user)
}

export async function requestFriend(email: string): Promise<RequestOutcome> {
  const { supabase } = await client()
  const { data, error } = await supabase.rpc('request_friend', { target_email: email.trim() })
  if (error) throw new Error(error.message)
  return data as RequestOutcome
}

export async function listFriends(): Promise<Friend[]> {
  const { supabase } = await client()
  const { data, error } = await supabase.rpc('list_friends')
  if (error) throw new Error(error.message)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    friendId: String(row.friend_id),
    email: String(row.email),
    status: row.status as FriendStatus,
    direction: row.direction as FriendDirection,
  }))
}

/** Saying yes. Only the person who was asked can do this — the policy enforces it. */
export async function acceptFriend(friendId: string): Promise<void> {
  const { supabase, userId } = await client()
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester', friendId)
    .eq('addressee', userId)
  if (error) throw new Error(error.message)
}

/**
 * Declining, cancelling and unfriending are the same act, so they are one function.
 *
 * Removing the row is what withdraws access: a former friend stops matching
 * `are_friends`, and every review of yours becomes invisible to them again.
 */
export async function removeFriend(friendId: string): Promise<void> {
  const { supabase, userId } = await client()
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester.eq.${userId},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${userId})`,
    )
  if (error) throw new Error(error.message)
}

/**
 * Put a review where friends can read it.
 *
 * Explicit, and separate from saving it locally. Writing and publishing are different
 * decisions, and collapsing them would mean a half-finished thought reaching someone
 * the moment it was typed.
 */
export async function publishReview(book: Book, review: Review): Promise<void> {
  const { supabase, userId } = await client()

  const { error } = await supabase.from('reviews').upsert(
    {
      user_id: userId,
      book_key: review.bookKey,
      title: book.title,
      authors: book.authors.join(', '),
      rating: review.rating ?? null,
      body: review.body,
      updated_at: review.updatedAt,
    },
    { onConflict: 'user_id,book_key' },
  )
  if (error) throw new Error(error.message)
}

/** Take it back down. Friends stop seeing it; the local copy is untouched. */
export async function unpublishReview(bookKey: string): Promise<void> {
  const { supabase, userId } = await client()
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('user_id', userId)
    .eq('book_key', bookKey)
  if (error) throw new Error(error.message)
}

export async function reviewsForBook(key: string): Promise<SharedReview[]> {
  const { supabase } = await client()
  const { data, error } = await supabase.rpc('reviews_for_book', { key })
  if (error) throw new Error(error.message)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    email: String(row.email),
    rating: row.rating == null ? undefined : Number(row.rating),
    body: String(row.body ?? ''),
    updatedAt: String(row.updated_at),
  }))
}
