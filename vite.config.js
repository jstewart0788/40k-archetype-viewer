import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/40k-archetype-viewer/',
  build: {
    // Split KaTeX (heavy, /docs-only) into its own chunk so users who
    // never visit Docs don't pay for it on initial load. Everything else
    // (React, Recharts, router, app code) goes into Vite's default
    // vendor chunk — splitting Recharts/React more aggressively scrambles
    // module evaluation order (Recharts' react-smooth and
    // react-resize-detector deps end up in a chunk that runs before the
    // main React chunk has finished evaluating, throwing
    // "Cannot read properties of undefined (reading 'forwardRef')").
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('katex')) return 'katex'
        },
      },
    },
  },
})
