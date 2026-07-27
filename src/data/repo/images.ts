import { db, newId, nowIso } from '../db'
import type { ImageBlob } from '../types'

/**
 * Image storage.
 *
 * The original file is stored exactly as it came off the camera or picker — no
 * re-encoding, no resizing, no EXIF stripping, no rotation. Anything derived from
 * the image (OCR text, translations) is metadata on the Note, never a change here.
 */

/** Read intrinsic dimensions without modifying the image. Returns undefined if undecodable. */
async function readDimensions(blob: Blob): Promise<{ width: number; height: number } | undefined> {
  // createImageBitmap is the cheap path and avoids an <img> round-trip.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dims
    } catch {
      // fall through to the <img> approach
    }
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    img.src = url
  })
}

export async function putImage(blob: Blob): Promise<string> {
  const dims = await readDimensions(blob)
  const record: ImageBlob = {
    id: newId(),
    blob,
    mimeType: blob.type || 'image/jpeg',
    width: dims?.width,
    height: dims?.height,
    createdAt: nowIso(),
  }
  await db.images.add(record)
  return record.id
}

export function getImage(id: string): Promise<ImageBlob | undefined> {
  return db.images.get(id)
}

export async function getImageBlob(id: string): Promise<Blob | undefined> {
  const record = await db.images.get(id)
  return record?.blob
}

export async function deleteImage(id: string): Promise<void> {
  await db.images.delete(id)
}

/** Fetch a remote cover once and cache it locally so the shelf still renders offline. */
export async function cacheRemoteImage(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const blob = await response.blob()
    if (blob.size === 0) return undefined
    return await putImage(blob)
  } catch {
    // Offline, CORS-blocked, or the provider is down. The remote URL still works as
    // a fallback in the UI, so this is a soft failure by design.
    return undefined
  }
}
