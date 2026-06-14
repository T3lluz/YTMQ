import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { discoverProxyPlugin } from './vite.discoverProxy'

// https://vite.dev/config/
export default defineConfig({
  base: '/YTMQ/',
  plugins: [react(), tailwindcss(), discoverProxyPlugin()],
})
