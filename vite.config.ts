import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' позволяет открывать сайт и с GitHub Pages (в подпапке), и с любого другого хостинга.
export default defineConfig({
  base: './',
  plugins: [react()],
});
