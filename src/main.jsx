import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { MODO_LOCAL } from '@/api/base44Client'
import BarraLocal from '@/api/local/BarraLocal'

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <App />
    {MODO_LOCAL && <BarraLocal />}
  </>
)
