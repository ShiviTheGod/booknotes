import { listPendingOcr, updateNote } from '../data/repo/notes'
import { getImageBlob } from '../data/repo/images'
import { detectLanguage } from './translation'

/**
 * Background text extraction from photo notes.
 *
 * Two things worth stating plainly, because they're easy to get wrong:
 *
 * 1. The photograph is never modified. OCR output is written to `note.ocrText` as
 *    searchable metadata alongside the image. The stored blob is byte-identical to
 *    what came off the camera.
 *
 * 2. Tesseract is loaded lazily and runs in its own worker. It is a large dependency
 *    (~2MB of wasm plus per-language training data fetched on first use), so it must
 *    never be part of the initial bundle — someone who only types notes should never
 *    pay for it. `import()` inside the queue is what keeps it out of the main chunk.
 *
 * The queue is serial on purpose: parallel Tesseract workers on a phone compete for
 * the same limited memory and end up slower than doing one at a time.
 */

type TesseractWorker = {
  recognize: (image: Blob) => Promise<{ data: { text: string; confidence: number } }>
  terminate: () => Promise<unknown>
}

let workerPromise: Promise<TesseractWorker> | undefined
let running = false

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      // 'eng' is the base model. Language data is fetched from the CDN on first run
      // and then cached by the browser, so this is a one-time cost per device.
      return (await createWorker('eng')) as unknown as TesseractWorker
    })()
  }
  return workerPromise
}

/** Free the worker and its wasm heap. Called when the queue drains. */
async function releaseWorker(): Promise<void> {
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = undefined
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // Already gone — nothing to clean up.
  }
}

export async function runOcrForNote(noteId: string, imageBlobId: string): Promise<void> {
  const blob = await getImageBlob(imageBlobId)
  if (!blob) {
    await updateNote(noteId, { ocrStatus: 'failed' })
    return
  }

  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(blob)
    const text = data.text.replace(/\s+\n/g, '\n').trim()

    if (!text) {
      // A photo with no legible text is a normal outcome, not an error. Mark it done
      // so the queue doesn't retry it forever.
      await updateNote(noteId, { ocrStatus: 'done', ocrText: '' })
      return
    }

    await updateNote(noteId, {
      ocrStatus: 'done',
      ocrText: text,
      ocrLang: detectLanguage(text),
    })
  } catch (error) {
    console.error('OCR failed for note', noteId, error)
    await updateNote(noteId, { ocrStatus: 'failed' })
  }
}

/**
 * Drain every note still waiting on OCR.
 *
 * Safe to call repeatedly — the `running` guard means concurrent callers (app start,
 * plus each new photo saved) collapse into the single queue that is already working.
 */
export async function processOcrQueue(): Promise<void> {
  if (running) return
  running = true

  try {
    // Re-queried each pass so photos added while the queue runs get picked up.
    for (;;) {
      const pending = await listPendingOcr()
      if (pending.length === 0) break

      for (const note of pending) {
        if (!note.imageBlobId) {
          await updateNote(note.id, { ocrStatus: 'failed' })
          continue
        }
        await runOcrForNote(note.id, note.imageBlobId)
      }
    }
  } finally {
    running = false
    await releaseWorker()
  }
}
