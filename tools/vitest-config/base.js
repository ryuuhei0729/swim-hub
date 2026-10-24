import path from "path";
import { defineConfig } from "vitest/config";

export const createVitestConfig = (options = {}) => {
  const {
    name = "default",
    environment = "jsdom",
    setupFiles = [],
    include = ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude = ["node_modules", "dist"],
    // モックの呼び出し履歴は各テスト前に自動で消す (テストファイル側で vi.clearAllMocks() を書かない)
    clearMocks = true,
    coverage = {
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
        lines: 50,
        functions: 30,
        branches: 50,
        statements: 50,
      },
    },
    alias = {},
    projects,
  } = options;

  return defineConfig({
    test: {
      globals: true,
      setupFiles,
      exclude,
      clearMocks,
      coverage,
      // projects に extends: true で継承させると include が連結されるので、projects を使うときは
      // name / environment / include を親に置かない
      ...(projects ? { projects } : { name, environment, include }),
    },
    resolve: {
      alias,
    },
    esbuild: {
      target: "node18",
    },
  });
};
