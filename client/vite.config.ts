import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:4000' },
    warmup: { clientFiles: ['./src/components/*.{jsx,tsx}', './src/*.{jsx,tsx}'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
