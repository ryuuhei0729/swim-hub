import js from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @ryuuhei0729/swimhub-oauth は React/JSX に依存しないプラットフォーム非依存のロジック層
// (mobile は expo-*、web は next/server 型のみを使用) のため、
// apps/shared/eslint.config.mjs を参考にしつつ react / react-hooks プラグインは
// 含めない最小限の構成にする。
export default [
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: __dirname,
        project: ["./tsconfig.json"],
      },
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "error",
      "no-var": "error",
      "no-undef": "off",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "*.config.js", "*.config.ts", "*.config.mjs"],
  },
];
