import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './server/api.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const isDevelopment = process.argv.includes('--dev')
const port = Number(process.env.PORT || 5173)
let vite

if (isDevelopment) {
  const { createServer: createViteServer } = await import('vite')
  vite = await createViteServer({
    server: {
      middlewareMode: true,
      watch: { ignored: ['**/docx_render/**', '**/~$*', '**/*.tmp'] },
    },
    appType: 'spa',
  })
}

const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }

const server = createServer(async (request, response) => {
  if (await handleApi(request, response)) return
  if (vite) return vite.middlewares(request, response)

  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  let filePath = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname)
  if (!filePath.startsWith(path.join(root, 'dist')) || !existsSync(filePath) || (await stat(filePath)).isDirectory()) filePath = path.join(root, 'dist', 'index.html')
  try {
    response.writeHead(200, { 'Content-Type': `${mimeTypes[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` })
    response.end(await readFile(filePath))
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})

server.listen(port, '0.0.0.0', () => console.log(`한입 서버: http://localhost:${port}`))
