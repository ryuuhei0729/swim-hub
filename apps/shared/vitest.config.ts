import path from "path";
import url from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    // モックの呼び出し履歴は各テスト前に自動で消す (テストファイル側で vi.clearAllMocks() を書かない)
    clearMocks: true,
    exclude: ["node_modules", "dist"],
    // jsdom の起動はファイルごとにかかり、DOM を使わないテストでは実行時間の大半を占める。
    // .ts は node、.tsx は jsdom で動かす。.ts で DOM が要るファイルは先頭に
    // `// @vitest-environment jsdom` を書く。
    // include は extends 時に親と連結されるので、親には置かず各 project に持たせる。
    projects: [
      {
        extends: true,
        test: {
          name: "shared",
          environment: "node",
          include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
        },
      },
      {
        extends: true,
        test: {
          name: "shared:dom",
          environment: "jsdom",
          include: ["**/*.{test,spec}.tsx"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData",
        "**/__mocks__",
      ],
      thresholds: {
        lines: 75,
        functions: 50,
        branches: 80,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./"),
    },
  },
  esbuild: {
    target: "node18",
  },
});
