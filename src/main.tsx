import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { defaultUserLanguage, getSetting, SETTING_KEYS } from './data/repo/settings'
import { initTranslation } from './services/translation'
import { processOcrQueue } from './services/ocr'
import { applyResolvedTheme, readThemeChoice, watchSystemTheme } from './services/theme'
import './styles/global.css'

/**
 * Work that should happen once the app is on screen, never before it.
 *
 * Draining the OCR queue here matters as well as at the moment a photo is taken: an
 * app closed mid-extraction leaves notes marked pending, and nothing would pick them
 * up again until the next photo happened to be added.
 */
async function startBackgroundWork(): Promise<void> {
  const target = await getSetting(SETTING_KEYS.userLanguage, defaultUserLanguage())
  // Before the queue, so anything waiting gets translated on the same pass.
  await initTranslation(target)
  await processOcrQueue()
}

// The inline script in index.html has already set this for the first paint; this
// re-applies it from the same source of truth and keeps "auto" following the system
// for as long as the app is open.
applyResolvedTheme(readThemeChoice())
watchSystemTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root element missing from index.html')

// Nothing is written to the database before first paint any more. A new library
// starts empty and the shelf says so; the sample books are a button in Settings.
createRoot(container).render(
  <StrictMode>
    {/*
      HashRouter, not BrowserRouter: GitHub Pages serves static files and returns a
      404 for any deep link that is not a real file on disk. Hash routing sidesteps
      that entirely, and the URL bar is invisible in a Home Screen app anyway.
    */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

startBackgroundWork().catch((error) => {
  // Neither of these is worth interrupting anyone over: the app is fully usable
  // with untranslated notes and an OCR queue that retries on the next photo.
  console.error('Background work could not start:', error)
})
