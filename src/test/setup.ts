// Gives Node a real-enough IndexedDB so the Dexie layer can be tested without a browser.
// Must be imported for its side effects before anything touches `db`.
import 'fake-indexeddb/auto'
