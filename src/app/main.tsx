import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { useAppStore } from './state'

import '../index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found')
}

// Run bootstrap (DB init → settings → stored theme/language/font scale) and
// mount immediately; App renders a loading screen until `dbReady`.
void useAppStore.getState().initialize()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
