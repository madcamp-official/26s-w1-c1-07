import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 자립성(MERGE_PLAN §2-0): alias는 main 워크스페이스 안만 가리킨다.
//  '@'            → client/src (자기 워크스페이스)
//  '@madpump/shared' → main의 shared/src (game-lab vendor-in 코어, 원 소스 TS를 vite가 트랜스파일)
// design-lab / game-lab 폴더는 절대 가리키지 않는다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      '@madpump/shared': path.resolve(dirname, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
