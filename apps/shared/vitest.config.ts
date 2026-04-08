import path from "path";
import url from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: "shared",
    globals: true,
    environment: "jsdom",
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,tsx,mts,cts}"],
    exclude: ["node_modules", "dist"],
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
