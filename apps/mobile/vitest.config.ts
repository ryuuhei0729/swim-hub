// =============================================================================
// Vitest設定 - モバイルアプリ
// =============================================================================

import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";
import { createVitestConfig } from "../../tools/vitest-config/base.js";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
  ],
  ...createVitestConfig({
    setupFiles: ["./vitest.setup.ts"],
    // jsdom の起動はファイルごとにかかり、DOM を使わないテストでは実行時間の大半を占める。
    // .ts は node、.tsx は jsdom で動かす。.ts で DOM が要るファイルは先頭に
    // `// @vitest-environment jsdom` を書く。
    projects: [
      {
        extends: true,
        test: {
          name: "mobile",
          environment: "node",
          include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
        },
      },
      {
        extends: true,
        test: {
          name: "mobile:dom",
          environment: "jsdom",
          include: ["**/*.{test,spec}.{jsx,tsx}"],
        },
      },
    ],
    // `__tests__/navigation-integration/` は **別プロジェクト** (vitest.nav.config.ts) で動かす。
    // あちらは react-navigation を実物で、`react-native` を `react-native-web` で解決して
    // BottomTabBar の実 onPress まで走らせるため、この設定 (RN 静的モック +
    // react-navigation スタブ) とは両立しない。
    //   実行: pnpm --filter @swim-hub/mobile test:nav
    exclude: ["node_modules", "dist", ".expo", "web-build", "**/__tests__/navigation-integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        ".expo/",
        "web-build/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/__mocks__",
        "**/__tests__",
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@apps/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  }),
  resolve: {
    alias: {
      // パスエイリアス（トップレベルでも設定）
      "@": path.resolve(__dirname, "./"),
      "@apps/shared": path.resolve(__dirname, "../../packages/shared"),
      // トップレベルでもエイリアスを設定（スコープ付きパッケージ用）
      "@react-native-community/netinfo": path.resolve(
        __dirname,
        "./__mocks__/@react-native-community/netinfo.ts",
      ),
      // React Nativeを静的モックにエイリアス（Flow構文のパースエラーを回避）
      "react-native": path.resolve(__dirname, "./__mocks__/react-native.ts"),
      // Reactを単一インスタンスに統一
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@testing-library/react"],
  },
  esbuild: {
    jsx: "automatic",
  },
});
