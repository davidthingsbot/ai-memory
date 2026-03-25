import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Repository name for GitHub Pages deployment
const REPO_NAME = 'ai-memory'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Base path: '/' for dev, '/repo-name/' for production (GitHub Pages)
  base: mode === 'production' ? `/${REPO_NAME}/` : '/',
  plugins: [react(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3075,
    host: true,
    proxy: {
      // Proxy Brave Search API to avoid CORS issues in dev
      '/api/brave': {
        target: 'https://api.search.brave.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/brave/, ''),
      },
    },
  },
}))
