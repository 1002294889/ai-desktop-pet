import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { ChatApp } from './chat/ChatApp'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

const isChatWindow = new URLSearchParams(window.location.search).get('view') === 'chat'

createRoot(root).render(
  <StrictMode>
    {isChatWindow ? <ChatApp /> : <App />}
  </StrictMode>
)
