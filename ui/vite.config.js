import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' de ban build chay duoc khi Electron nap bang file://
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  server: { port: 5173 },
});
