import { statSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 解壓後的實際大小；主機啟用 gzip 時 content-length 不能當進度分母。
  define: { __DATA_BYTES__: statSync('public/data/polities.json').size },
  build: { chunkSizeWarningLimit: 2500 },
  test: { include: ['src/**/*.test.ts'] },
});
