import { useState } from 'react'
import { runOcrSelfTest, type OcrSelfTest } from '../../services/ocr'
import { checkSpeechAvailability, isIos, isStandalone } from '../../services/speech'
import { Capacitor } from '@capacitor/core'
import styles from './SettingsView.module.css'

/**
 * Reports which engines are actually live, and runs OCR on a known sample.
 *
 * The native plugins compile in CI but nothing can exercise them outside a real
 * device, so without this "does Vision work?" is answered by taking a photo and
 * squinting at the result. Running a fixed image through whichever engine is active
 * gives a confidence score and a timing that can be compared directly against the
 * Tesseract baseline in the browser.
 */
export default function NativeDiagnostics() {
  const [result, setResult] = useState<OcrSelfTest>()
  const [error, setError] = useState<string>()
  const [running, setRunning] = useState(false)

  const platform = Capacitor.getPlatform()
  const native = Capacitor.isNativePlatform()
  const speech = checkSpeechAvailability()

  async function runTest() {
    setRunning(true)
    setError(undefined)
    setResult(undefined)

    try {
      setResult(await runOcrSelfTest(await sampleImage()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Diagnostics</h2>
      <p className={styles.help}>
        Which engines this build is actually using. Handy for comparing the installed app
        against the browser version.
      </p>

      <dl className={styles.diagList}>
        <Row label="Platform" value={native ? `${platform} (native)` : `${platform} (browser)`} />
        <Row label="Launched from" value={isStandalone() ? 'Home Screen' : 'browser tab'} />
        <Row label="Text extraction" value={native ? 'Vision (on-device)' : 'Tesseract.js'} />
        <Row
          label="Dictation"
          value={
            speech.available
              ? native
                ? 'SFSpeechRecognizer'
                : 'Web Speech API'
              : 'unavailable — use the keyboard mic'
          }
        />
        {isIos() && !native && <Row label="Note" value="Safari, not the installed app" />}
      </dl>

      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => void runTest()}
        disabled={running}
      >
        {running ? 'Reading…' : 'Run text-extraction test'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.diagResult}>
          <Row label="Engine" value={result.engine === 'vision' ? 'Vision' : 'Tesseract.js'} />
          <Row label="Confidence" value={`${result.confidence} / 100`} />
          <Row label="Time" value={`${(result.ms / 1000).toFixed(1)}s`} />
          <Row label="Read as" value={result.text || '(nothing)'} />
          <p className={styles.help}>
            The sample says <strong>“Attention is the rarest resource.”</strong> — anything else
            means extraction is off.
          </p>
        </div>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.diagRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/**
 * A known sentence drawn at a comfortable size. Generated rather than bundled so the
 * test needs no network and no fixture file, and so the expected output is unambiguous.
 */
async function sampleImage(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 200

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable on this device.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111111'
  context.font = '44px Georgia, serif'
  context.fillText('Attention is the rarest resource.', 40, 120)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the sample image.'))),
      'image/jpeg',
      0.95,
    )
  })
}
