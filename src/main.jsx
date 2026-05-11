import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { PanelProvider } from './context/PanelContext'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PanelProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PanelProvider>
    </BrowserRouter>
  </React.StrictMode>
)
