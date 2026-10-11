import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path = repo name, so it works at https://<user>.github.io/<repo>/
// GitHub Actions sets this automatically (see .github/workflows/deploy.yml).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
