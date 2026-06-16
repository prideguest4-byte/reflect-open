import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { reactWithCompiler } from './react-compiler-plugin'

// Editor (ProseMirror/contenteditable) tests will move to browser-mode vitest
// later (Plan 01 step 9); jsdom covers pure logic + light component tests.
export default defineConfig({
  plugins: [reactWithCompiler()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
