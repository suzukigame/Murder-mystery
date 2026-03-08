import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',

    // Tauri がログを消さないようにする
    clearScreen: false,

    server: {
        host: '0.0.0.0',
        // Tauri が開発サーバーのポートを確実に検出できるよう固定
        port: 5173,
        strictPort: true,
    },
})
