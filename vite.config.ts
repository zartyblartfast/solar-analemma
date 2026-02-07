import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/solar-analemma/' : '/',
  plugins: [react()],
  define: {
    'process.env': {},
  },
}));
