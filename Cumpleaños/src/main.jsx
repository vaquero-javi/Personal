import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jersey-10/400.css'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/press-start-2p/400.css'
import './styles.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
