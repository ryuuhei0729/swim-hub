import { defineConfig } from "vitest/config";
import { createVitestConfig } from "../../tools/vitest-config/base.js";

// @ryuuhei0729/swimhub-oauth はブラウザ/RN の DOM 実装に依存しない純粋なロジック層
// (mobile 側は expo-web-browser / expo-auth-session を vi.mock で完全に差し替え、
// web 側は next/server の NextRequest/NextResponse が Node ネイティブの
// fetch 実装だけで完結する) ため、jsdom を必要とせず environment: "node" とする。
export default defineConfig({
  ...createVitestConfig({
    name: "oauth",
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.config.*", "**/__mocks__"],
      thresholds: {
        lines: 75,
        functions: 50,
        branches: 80,
        statements: 75,
      },
    },
  }),
});
