import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { availableParallelism, totalmem } from 'node:os'
import vue from '@vitejs/plugin-vue'

const profiles = {
  low: 1,
  default: process.platform === 'win32' ? 2 : 4,
  parallel: 8,
} as const
const requestedProfile = process.env.PATMAIL_TEST_PROFILE ?? 'default'
if (!Object.hasOwn(profiles, requestedProfile)) {
  throw new Error('PATMAIL_TEST_PROFILE must be low, default or parallel')
}
const profile = requestedProfile as keyof typeof profiles
const memorySlots = Math.max(1, Math.floor(totalmem() / (2 * 1024 ** 3)))
const maxWorkers = Math.min(profiles[profile], availableParallelism(), memorySlots)

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      allow: [resolve(import.meta.dirname, '..')],
    },
  },
  test: {
    maxWorkers,
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
