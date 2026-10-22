import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Project Pages live at https://toku1639.github.io/grove-qr/
// so production assets must be rooted under /grove-qr/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/grove-qr/' : '/',
  plugins: [react()],
}))
