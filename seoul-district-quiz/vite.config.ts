import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

import aitDevtools from '@apps-in-toss/devtools/unplugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [aitDevtools.vite(), tailwindcss(), react()],
})
