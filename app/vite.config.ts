import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/skills-github-pages/app/',
  plugins: [react()],
})
