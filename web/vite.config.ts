import './scripts/build-help.mjs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    // Server OAuth tests use Node crypto and their own setup/config.
    exclude: [...configDefaults.exclude, 'server/chatgpt/**'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})