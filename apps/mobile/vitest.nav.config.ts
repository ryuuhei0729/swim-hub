import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({ jsxRuntime: "automatic" })],
  test: {
    name: "mobile-nav",
    environment: "jsdom",
    setupFiles: ["./__tests__/navigation-integration/setup.ts"],
    include: ["**/__tests__/navigation-integration/**/*.test.tsx"],
    server: { deps: { inline: [/@react-navigation/, /react-native-web/] } },
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@apps/shared": path.resolve(__dirname, "../shared"),
      "react-native": "react-native-web",
      "react-native-safe-area-context": path.resolve(__dirname, "./__tests__/navigation-integration/__stubs__/safe-area-context.tsx"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@apps/shared": path.resolve(__dirname, "../shared"),
      "react-native": "react-native-web",
      "react-native-safe-area-context": path.resolve(__dirname, "./__tests__/navigation-integration/__stubs__/safe-area-context.tsx"),
      react: path.resolve(__dirname, "../../node_modules/react"),
      "react-dom": path.resolve(__dirname, "../../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
});
