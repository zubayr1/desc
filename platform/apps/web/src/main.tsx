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
import { loadChain } from './lib/chain'

const queryClient = new QueryClient()

function Root({ endpoint }: { endpoint: string }) {
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

// The api says which chain it is on, and the wallet adapter needs that RPC on
// its first render — so the config is fetched before React mounts rather than
// inside a hook. One `DESC_ENV` on the api moves the whole frontend with it.
loadChain().then((c) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root endpoint={c.rpcUrl} />
    </StrictMode>,
  )
})
