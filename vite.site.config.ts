// The plugins run-cradle.com's pages need when `rer build --site` renders them in Node: the docs virtual module,
// React and Tailwind for the app stylesheet the landing and docs share. Never the app's vite.config.ts.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { docsSite } from './src/core/features/docs/build/plugin.ts'

export default defineConfig({ plugins: [docsSite(), react(), tailwindcss()] })
