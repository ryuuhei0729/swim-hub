import path from "path";
import url from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Root の React に統一して、複数の React インスタンスによる "Invalid hook call" を防ぐ
const rootReact = path.resolve(__dirname, "../../node_modules/react");
const rootReactDom = path.resolve(__dirname, "../../node_modules/react-dom");

export default defineConfig({
  test: {
    name: "shared",
    globals: true,
    environment: "jsdom",
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,tsx,mts,cts}"],
    exclude: ["node_modules", "dist"],
    deps: {
      inline: [
        "@testing-library/react",
      ],
    },
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
      "react": rootReact,
      "react-dom": rootReactDom,
    },
  },
  esbuild: {
    target: "node18",
  },
});
