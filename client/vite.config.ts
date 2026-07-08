import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Self-containment (MERGE_PLAN §2-0): aliases point only inside the main workspace.
//  '@'            → client/src (own workspace)
//  '@madcade/shared' → main's shared/src (game-lab vendor-in core, vite transpiles the original source TS)
// Never point at the design-lab / game-lab folders.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@madcade/shared': path.resolve(dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
