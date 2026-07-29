import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // fake-indexeddb/auto installs a working IndexedDB onto globalThis before any
    // test imports db.ts, which would otherwise throw on Dexie construction.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
