import path from 'path'
import { createVitestConfig } from './base.js'

export { createVitestConfig }

export default createVitestConfig({
  name: 'shared',
  environment: 'jsdom',
  include: ['**/*.{test,spec}.{js,mjs,cjs,ts,tsx,mts,cts}'],
  exclude: ['node_modules', 'dist'],
  coverage: {
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
      lines: 75,
      functions: 50,
      branches: 80,
      statements: 75,
    },
  },
  alias: {
    '@shared': path.resolve(process.cwd(), './'),
  },
})
