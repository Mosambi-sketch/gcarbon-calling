import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-seed-middleware',
      configureServer(server) {
        server.middlewares.use('/api/seed', (req, res) => {
          try {
            const seedPath = path.resolve(import.meta.dirname, 'data/seed.json')
            if (fs.existsSync(seedPath)) {
              const content = fs.readFileSync(seedPath, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true, data: JSON.parse(content) }))
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'Seed file not found' }))
            }
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: e.message }))
          }
        })
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './')
    }
  },
  server: {
    port: 3000,
    host: true
  }
})
