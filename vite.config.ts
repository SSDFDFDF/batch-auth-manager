import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  const singleFile = mode === 'singlefile'

  return {
    plugins: [vue(), singleFile ? viteSingleFile() : null].filter(Boolean),
    build: singleFile
      ? {
          cssCodeSplit: false,
          assetsInlineLimit: 100000000,
          rollupOptions: {
            output: {
              inlineDynamicImports: true
            }
          }
        }
      : undefined,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5174,
      proxy: {
        '/v0': {
          target: 'http://localhost:8317',
          changeOrigin: true
        }
      }
    }
  }
})
