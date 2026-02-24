import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { bindAuthProfileInvalidation } from './lib/useSupabase'

const queryClient = new QueryClient()

function AppRoot() {
  useEffect(() => {
    const cleanup = bindAuthProfileInvalidation(queryClient)
    return cleanup
  }, [])

  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoot />
    </QueryClientProvider>
  </StrictMode>,
)
