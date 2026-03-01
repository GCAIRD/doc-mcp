import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/mcp': 'http://localhost:8900',
      '/health': 'http://localhost:8900',
    },
  },
})
