import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Babylon engine — large, rarely changes, cache-busts independently
          if (id.includes('@babylonjs')) return 'babylon'
          // React ecosystem — stable, long cache lifetime
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router')) return 'react-vendor'
          // GSAP — separate small chunk
          if (id.includes('node_modules/gsap')) return 'gsap'
        },
      },
    },
  },
})
