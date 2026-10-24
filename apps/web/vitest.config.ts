import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@apps/shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // モックの呼び出し履歴は各テスト前に自動で消す (テストファイル側で vi.clearAllMocks() を書かない)
    clearMocks: true,
    exclude: ["node_modules", "dist", ".next", "e2e"],
    // jsdom の起動はファイルごとにかかり、DOM を使わないテストでは実行時間の大半を占める。
    // .ts は node、.tsx は jsdom で動かす。.ts で DOM が要るファイルは先頭に
    // `// @vitest-environment jsdom` を書く。
    // include は extends 時に親と連結されるので、親には置かず各 project に持たせる。
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "node",
          include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
        },
      },
      {
        extends: true,
        test: {
          name: "web:dom",
          environment: "jsdom",
          include: ["**/*.{test,spec}.{jsx,tsx}"],
        },
      },
    ],
    server: {
      deps: {
        // next-intl v4 は ESM 専用だが、Next.js の最適化を壊さないため内部で
        // `next/navigation` を拡張子なしで import している。Node の ESM 解決では
        // 見つからないので、Vite に処理させる (next-intl 公式の Vitest 設定)。
        // https://github.com/vercel/next.js/issues/77200
        inline: ["next-intl"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        ".next/",
        "e2e/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "**/__mocks__",
        "**/__tests__/utils",
      ],
      thresholds: {
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
  },
  esbuild: {
    target: "node18",
  },
});
