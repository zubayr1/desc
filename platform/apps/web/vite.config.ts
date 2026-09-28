import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Fill `%SITE_URL%` in index.html at build time.
 *
 * Link previews (Open Graph, Twitter cards) need ABSOLUTE urls — a scraper has
 * no page context to resolve `/og.png` against — so the site's own address has
 * to be baked into the HTML. It comes from the same `DESC_DOMAIN` that drives
 * the certificate and the api's CORS origin, rather than being written out a
 * second time here, so moving the site is still one variable.
 */
function siteUrl(): Plugin {
  const url = process.env.DESC_DOMAIN
    ? `https://${process.env.DESC_DOMAIN}`
    : 'http://localhost:5173'
  return {
    name: 'desc-site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrl()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
