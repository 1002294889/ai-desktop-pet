import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ChatApp } from './chat/ChatApp'
import { CharacterManagerApp } from './characters/CharacterManagerApp'
import { MemoryApp } from './memory/MemoryApp'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

const view = new URLSearchParams(window.location.search).get('view')

document.documentElement.dataset.view = view ?? 'pet'

if (view === 'memory') {
  document.title = 'Memory & Privacy — AI Desktop Pet'
} else if (view === 'characters') {
  document.title = 'Characters — AI Desktop Pet'
}

createRoot(root).render(
  <StrictMode>
    {view === 'chat' ? (
      <ChatApp />
    ) : view === 'memory' ? (
      <MemoryApp />
    ) : view === 'characters' ? (
      <CharacterManagerApp />
    ) : (
      <App />
    )}
  </StrictMode>
)
