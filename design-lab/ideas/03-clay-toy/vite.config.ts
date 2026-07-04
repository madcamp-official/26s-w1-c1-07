import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// '@shared' → design-lab/shared/src (@madpump/shared 소스 직접 참조)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5103,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(dirname, '../../shared/src'),
    },
  },
});
