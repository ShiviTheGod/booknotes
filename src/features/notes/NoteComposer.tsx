import { useEffect, useRef, useState } from 'react'
import { createNote } from '../../data/repo/notes'
import { putImage } from '../../data/repo/images'
import { processOcrQueue } from '../../services/ocr'
import {
  checkSpeechAvailability,
  startDictation,
  type DictationHandle,
} from '../../services/speech'
import styles from './NoteComposer.module.css'

/**
 * Capture one key idea: typed, dictated, or photographed.
 *
 * All three paths land in the same place — a Note attached to this book and chapter —
 * so the composer keeps one shared text area and swaps only the input affordance.
 */
export default function NoteComposer({
  bookId,
  chapterId,
}: {
  bookId: string
  chapterId: string
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState<string>()

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dictationRef = useRef<DictationHandle | null>(null)
  /** Text present before dictation began, so a transcript appends rather than overwrites. */
  const textBeforeDictationRef = useRef('')
  /** Whether the current draft came from the microphone, so it can be typed correctly on save. */
  const listeningProducedText = useRef(false)

  // Evaluated once on mount: the answer depends on how the app was launched
  // (Safari tab vs Home Screen), which cannot change without a reload.
  const [speech] = useState(checkSpeechAvailability)

  // Make sure a live microphone is released if the user navigates away mid-dictation.
  useEffect(() => () => dictationRef.current?.stop(), [])

  function autoGrow(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  async function saveText() {
    const body = text.trim()
    if (!body || saving) return

    setSaving(true)
    try {
      await createNote({
        bookId,
        chapterId,
        // A note whose text arrived by voice is tagged as such, so the chapter view can
        // show how it was captured.
        type: listeningProducedText.current ? 'voice' : 'text',
        content: body,
      })
      setText('')
      listeningProducedText.current = false
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop()
      return
    }

    setMessage(undefined)
    textBeforeDictationRef.current = text ? `${text.trimEnd()} ` : ''

    const handle = startDictation({
      onPartial: (transcript) => {
        setText(textBeforeDictationRef.current + transcript)
        listeningProducedText.current = true
      },
      onFinal: (transcript) => {
        setListening(false)
        dictationRef.current = null
        if (transcript) {
          setText(textBeforeDictationRef.current + transcript)
          listeningProducedText.current = true
        }
        textareaRef.current?.focus()
      },
      onError: (errorMessage) => {
        setMessage(errorMessage)
        setListening(false)
        dictationRef.current = null
      },
    })

    if (handle) {
      dictationRef.current = handle
      setListening(true)
    }
  }

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change event.
    event.target.value = ''
    if (!file) return

    setSaving(true)
    setMessage(undefined)
    try {
      // The file is stored exactly as captured — no resize, no re-encode, no rotation.
      const imageBlobId = await putImage(file)

      await createNote({
        bookId,
        chapterId,
        type: 'photo',
        content: text.trim(),
        imageBlobId,
        ocrStatus: 'pending',
      })

      setText('')
      setMessage('Photo saved. Reading any text in the background…')

      // Fire-and-forget: the note is already visible and usable while this runs.
      void processOcrQueue()
    } catch (error) {
      console.error(error)
      setMessage('That photo could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.composer}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          autoGrow(event.target)
        }}
        placeholder="What's worth keeping from this chapter?"
        aria-label="Note text"
        rows={2}
      />

      <div className={styles.actions}>
        <div className={styles.captureButtons}>
          {speech.available && (
            <button
              type="button"
              className={listening ? styles.micButtonActive : styles.micButton}
              onClick={toggleDictation}
              aria-pressed={listening}
              aria-label={listening ? 'Stop dictation' : 'Dictate a note'}
            >
              <MicIcon />
              {listening && <span className={styles.pulse} aria-hidden="true" />}
            </button>
          )}

          <button
            type="button"
            className={styles.photoButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            aria-label="Photograph a page"
          >
            <CameraIcon />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            /* `capture` asks iOS to open the rear camera directly rather than the
               photo picker. Ignored on desktop, which falls back to a file dialog. */
            capture="environment"
            className="sr-only"
            onChange={(event) => void handlePhoto(event)}
            tabIndex={-1}
          />
        </div>

        <button
          type="button"
          className={styles.saveButton}
          onClick={() => void saveText()}
          disabled={!text.trim() || saving}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>

      {listening && <p className={styles.listening}>Listening — tap the mic again to stop.</p>}

      {message && <p className={styles.message}>{message}</p>}

      {!speech.available && speech.suggestKeyboardMic && (
        <p className={styles.speechHint}>
          {speech.reason} Use the <strong>microphone key on your keyboard</strong> to dictate
          straight into the note instead.
        </p>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
