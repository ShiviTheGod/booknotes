import { listPendingOcr, updateNote } from '../data/repo/notes'
import { getImageBlob } from '../data/repo/images'
import { detectLanguage } from './translation'
import { VisionOcr, blobToBase64, isNativeIos } from './native/plugins'

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

/**
 * Below this, extracted text is shown with a caution.
 *
 * Chosen from measurements rather than taste. Cleanly rendered text scores 96. A
 * 1948 printed document with decorative capitals and two columns scores 55 and comes
 * back readable but scrambled. A 1609 quarto using the long-s scores 36 and is pure
 * nonsense. Everything trustworthy sat in the nineties; everything problematic at 55
 * or below, so 70 separates them with room to spare.
 */
export const OCR_CONFIDENCE_THRESHOLD = 70

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

  // On iOS, Vision does this natively: on-device, no download, no wasm, and far
  // better on a phone camera's output than Tesseract manages.
  if (isNativeIos()) {
    await runVisionOcr(noteId, blob)
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
      ocrConfidence: Math.round(data.confidence),
    })
  } catch (error) {
    console.error('OCR failed for note', noteId, error)
    await updateNote(noteId, { ocrStatus: 'failed' })
  }
}

export interface OcrSelfTest {
  engine: 'vision' | 'tesseract'
  text: string
  confidence: number
  ms: number
}

/**
 * Run OCR on one image and report what happened, without touching the database.
 *
 * Exists because the native path cannot be verified anywhere but a real device.
 * Running the same image through whichever engine is active turns "does Vision
 * work?" into a number that can be compared against the Tesseract baseline.
 */
export async function runOcrSelfTest(blob: Blob): Promise<OcrSelfTest> {
  const started = performance.now()

  if (isNativeIos()) {
    const base64 = await blobToBase64(blob)
    const { text, confidence } = await VisionOcr.recognizeText({ imageBase64: base64 })
    return {
      engine: 'vision',
      text: text.trim(),
      // Vision reports 0–1; match Tesseract's 0–100 so the two are comparable.
      confidence: Math.round(confidence * 100),
      ms: Math.round(performance.now() - started),
    }
  }

  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(blob)
    return {
      engine: 'tesseract',
      text: data.text.trim(),
      confidence: Math.round(data.confidence),
      ms: Math.round(performance.now() - started),
    }
  } finally {
    // The queue isn't running, so nothing else needs the worker's wasm heap.
    await releaseWorker()
  }
}

/** Vision-framework path. Same contract as the Tesseract path: writes ocrText and status. */
async function runVisionOcr(noteId: string, blob: Blob): Promise<void> {
  try {
    const base64 = await blobToBase64(blob)
    const { text, confidence } = await VisionOcr.recognizeText({ imageBase64: base64 })
    const trimmed = text.trim()

    await updateNote(noteId, {
      ocrStatus: 'done',
      ocrText: trimmed,
      // An empty result is a legitimate outcome (a photo with no legible text),
      // so it is recorded as done rather than retried forever.
      ocrLang: trimmed ? detectLanguage(trimmed) : undefined,
      // Vision reports 0–1; Tesseract reports 0–100. Normalize so the UI has one scale.
      ocrConfidence: trimmed ? Math.round(confidence * 100) : undefined,
    })
  } catch (error) {
    console.error('Vision OCR failed for note', noteId, error)
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
