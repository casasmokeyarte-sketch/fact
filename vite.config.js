import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.ELECTRON_BUILD === '1' ? './' : '/',
  plugins: [react()],
  build: {
    emptyOutDir: process.env.ELECTRON_BUILD === '1' ? false : undefined,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.loca.lt', '.trycloudflare.com'],
  },
})
