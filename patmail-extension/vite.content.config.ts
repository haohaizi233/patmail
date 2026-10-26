import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyManifestPlugin } from './vite.manifest'

/** Content Script 必须打成单个 IIFE，不能拆成页面里的 ES module。 */
export default defineConfig({
  plugins: [vue(), copyManifestPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    // Content Script 必须整包 IIFE，文档和依赖都压在这一个文件里，提示无意义。
    chunkSizeWarningLimit: 3072,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        name: 'PatMailContent',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
        extend: true
      }
    }
  }
})
