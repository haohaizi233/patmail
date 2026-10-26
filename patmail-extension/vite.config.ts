import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { copyManifestPlugin } from './vite.manifest'

export default defineConfig({
  base: './',
  server: { fs: { allow: [resolve(__dirname, '..')] } },
  publicDir: resolve(__dirname, '../public'),
  plugins: [vue(), copyManifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 插件在本机 unpacked 加载，体积不影响运行；文档、mermaid 图表和 sql.js
    // 本来就是整包进来的，拆不薄，这里只把 "chunk 过大" 的提示关掉。
    chunkSizeWarningLimit: 3072,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        app: resolve(__dirname, 'app.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
