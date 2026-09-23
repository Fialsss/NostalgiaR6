import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  // the one place the version lives: package.json
  renderer: { plugins: [react()], define: { __VERSION__: JSON.stringify(version) } }
})
