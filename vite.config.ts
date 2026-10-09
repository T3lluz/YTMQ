import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served at t3lluz.com/ytmq by server/main.ts. In dev, /ytmq/api goes to a
// local server (deno task dev in server/) unless YTMQ_API_PROXY says otherwise,
// e.g. YTMQ_API_PROXY=https://t3lluz.com to work against the live API.
export default defineConfig({
  base: '/ytmq/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ytmq/api': {
        target: process.env.YTMQ_API_PROXY ?? 'http://localhost:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
