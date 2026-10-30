import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyManifestPlugin } from './vite.manifest.ts'

/** Content Script 必须打成单个 IIFE，不能拆成页面里的 ES module。 */
export default defineConfig({
  plugins: [vue(), copyManifestPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // IIFE 没有模块 URL；依赖的资源基址必须指向扩展，不能落到宿主页面。
    'import.meta.url': 'chrome.runtime.getURL("content.js")',
    'import.meta.resolve': 'undefined'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    // Content Script 必须整包 IIFE，文档和依赖都压在这一个文件里，提示无意义。
    chunkSizeWarningLimit: 3072,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        name: 'PatMailContent',
        entryFileNames: 'content.js',
        codeSplitting: false,
        extend: true
      }
    }
  }
})
