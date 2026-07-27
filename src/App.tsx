import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ShelfView from './features/shelf/ShelfView'
import AddBookView from './features/search/AddBookView'
import BookDetailView from './features/book/BookDetailView'
import BookSummaryView from './features/book/BookSummaryView'
import ChapterNotesView from './features/notes/ChapterNotesView'
import StatsView from './features/stats/StatsView'
import SettingsView from './features/settings/SettingsView'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ShelfView />} />
        <Route path="/add" element={<AddBookView />} />
        <Route path="/book/:bookId" element={<BookDetailView />} />
        <Route path="/book/:bookId/summary" element={<BookSummaryView />} />
        <Route path="/book/:bookId/chapter/:chapterId" element={<ChapterNotesView />} />
        <Route path="/stats" element={<StatsView />} />
        <Route path="/settings" element={<SettingsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
