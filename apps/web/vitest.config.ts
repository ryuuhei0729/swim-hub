import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '../../tools/vitest-config/web.js'

export default defineConfig({
  plugins: [react()],
  ...createVitestConfig({
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'e2e/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/__mocks__',
        '**/__tests__/utils',
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
    alias: {
      '@': './',
      '@apps/shared': '../shared',
    },
  }),
})

