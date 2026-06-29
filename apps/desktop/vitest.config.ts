import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { configDefaults, defineConfig } from 'vitest/config'
import { reactWithCompiler } from './react-compiler-plugin'

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
}

// Two test projects, split by what each test needs:
//
// - `browser` runs DOM-bound tests (React components, the editor, virtua lists)
//   in a real Chromium via Playwright. A test opts in by ending its filename
//   with `.browser.test.ts(x)`; it queries the page with `vitest/browser`
//   locators and `await expect.element(...)`.
// - `node` runs the rest (pure logic) in Node.
//
// While the DOM tests are still being migrated off jsdom, `node` keeps
// `environment: 'jsdom'` so not-yet-migrated tests keep passing. It flips to
// `node` (and jsdom is dropped) once every DOM test is a `.browser.test`.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [reactWithCompiler()],
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, 'src/**/*.browser.test.{ts,tsx}'],
        },
      },
      {
        plugins: [reactWithCompiler(), tailwindcss()],
        resolve: { alias },
        test: {
          name: 'browser',
          globals: false,
          include: ['src/**/*.browser.test.{ts,tsx}'],
          setupFiles: ['./vitest.setup.browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
