import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/vitest-setup.ts'],
    // 部分调度回归（stream-download-idle / file-search-bulk）是真实时序轮询，
    // 高负载或慢 CI 容器上 5s 默认超时会随机翻车；断言口径不变，只放宽等待上限。
    testTimeout: 15_000,
    hookTimeout: 15_000,
    environmentOptions: { jsdom: { url: 'https://example.test/forms?stage=1' } },
    // Vitest 4：coverage 挂在 test 下（vite 的 UserConfig 只认 test 字段）。
    coverage: {
      provider: 'v8',
      reportsDirectory: 'test-results/coverage',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/assets/**', '**/*.d.ts'],
    },
  },
})
