import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json "paths" so vitest resolves the same imports
      // the Next.js compiler resolves at build time.
      '@': path.resolve(import.meta.dirname),
      '@backend': path.resolve(import.meta.dirname, '../backend'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
