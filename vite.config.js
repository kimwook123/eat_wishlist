import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { handleApi } from './server/api.js'

const reviewApiPlugin = () => ({
  name: 'hanip-review-api',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (!await handleApi(request, response)) next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (!await handleApi(request, response)) next()
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), reviewApiPlugin()],
  server: {
    watch: {
      ignored: ['**/docx_render/**', '**/~$*', '**/*.tmp'],
    },
  },
})
