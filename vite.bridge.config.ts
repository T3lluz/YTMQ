import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** Self-contained IIFE for music.youtube.com (CSP blocks esm.sh imports). */
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/bridge/ytmusic-bridge.ts'),
      name: 'YTMQBridge',
      formats: ['iife'],
      fileName: () => 'ytmusic-bridge.js',
    },
    outDir: 'public',
    emptyOutDir: false,
    minify: true,
    target: 'es2020',
  },
})
