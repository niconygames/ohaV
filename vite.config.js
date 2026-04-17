import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        maker: 'maker.html',
      },
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
