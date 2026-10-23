import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: [resolve(__dirname, '..')]
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    environmentOptions: { jsdom: { url: 'https://example.test/forms?stage=1' } }
  }
})
