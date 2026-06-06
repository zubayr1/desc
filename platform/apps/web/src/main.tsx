import { Buffer } from 'buffer'
// web3.js expects a global Buffer in the browser
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()

function Root() {
  const endpoint = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8899'
  // Empty wallets array → auto-detects standard wallets (Phantom, Solflare, …).
  const wallets = useMemo(() => [], [])
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
