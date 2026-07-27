import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { seedIfEmpty } from './data/seed'
import './styles/global.css'

// Install the starter library before first paint so the shelf never flashes empty.
// A failure here is not fatal — the app works fine with no books.
seedIfEmpty()
  .catch((error) => {
    console.error('Could not install the starter library:', error)
  })
  .finally(() => {
    const container = document.getElementById('root')
    if (!container) throw new Error('Root element missing from index.html')

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
  })
