// =============================================================================
// Vitest設定 - モバイルアプリ
// =============================================================================

import path from 'path'
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '../../tools/vitest-config/base.js'

export default defineConfig({
  ...createVitestConfig({
    name: 'mobile',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.expo', 'web-build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.expo/',
        'web-build/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/__mocks__',
        '**/__tests__',
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
    alias: {
      '@': path.resolve(__dirname, './'),
      '@apps/shared': path.resolve(__dirname, '../shared'),
    },
  }),
})
