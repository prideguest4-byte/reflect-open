// Setup for the browser-mode vitest project. Loads the app's real stylesheet so
// visibility and layout assertions behave like the shipped app, and registers
// the `locate(selector)` locator extension.
import '@/styles/index.css'

import '@/test-utils/locator'
