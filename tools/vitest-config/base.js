import path from 'path'
import { defineConfig } from 'vitest/config'

export const createVitestConfig = (options = {}) => {
  const {
    name = 'default',
    environment = 'jsdom',
    setupFiles = [],
    include = ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude = ['node_modules', 'dist'],
    coverage = {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/__mocks__',
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
    alias = {},
  } = options

  return defineConfig({
    test: {
      name,
      globals: true,
      environment,
      setupFiles,
      include,
      exclude,
      coverage,
    },
    resolve: {
      alias,
    },
    esbuild: {
      target: 'node18',
    },
  })
}
