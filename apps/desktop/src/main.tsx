import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { installTauriBridge } from '@/lib/tauri-bridge'
import { GraphProvider } from '@/providers/graph-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import '@/styles/index.css'

installTauriBridge()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <GraphProvider>
        <App />
      </GraphProvider>
    </ThemeProvider>
  </StrictMode>,
)
