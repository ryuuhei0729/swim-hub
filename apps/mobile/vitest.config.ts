// =============================================================================
// Vitest設定 - モバイルアプリ
// =============================================================================

import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '../../tools/vitest-config/base.js'

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
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
  resolve: {
    alias: {
      // パスエイリアス（トップレベルでも設定）
      '@': path.resolve(__dirname, './'),
      '@apps/shared': path.resolve(__dirname, '../shared'),
      // トップレベルでもエイリアスを設定（スコープ付きパッケージ用）
      '@react-native-community/netinfo': path.resolve(
        __dirname,
        './__mocks__/@react-native-community/netinfo.ts'
      ),
      // React Nativeを静的モックにエイリアス（Flow構文のパースエラーを回避）
      'react-native': path.resolve(__dirname, './__mocks__/react-native.ts'),
      // Reactを単一インスタンスに統一
      'react': path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@testing-library/react'],
  },
  esbuild: {
    jsx: 'automatic',
  },
})
