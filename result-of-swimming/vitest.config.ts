import path from "path";
import url from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 依存ゼロのため専用 node_modules を持たない。
// swim-hub ルートの vitest / tsc をそのまま使う (npx が上位 node_modules を解決する)。
export default defineConfig({
  test: {
    name: "result-of-swimming",
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@shared/racePace": path.resolve(__dirname, "../apps/shared/utils/racePace"),
      "@fixtures": path.resolve(__dirname, "./fixtures"),
    },
  },
});
