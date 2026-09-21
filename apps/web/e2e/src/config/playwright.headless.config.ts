/**
 * headless 実行用の派生 config (QA 追加)。
 *
 * 既存の playwright.config.ts は
 *   headless: process.env.CI ? true : false
 * のためローカル実行では headed になり、ブラウザウィンドウが開いて作業の邪魔になる。
 * Playwright CLI には `--headless` フラグが存在しない (`--headed` のみ) ので、
 * CLI からは headless を強制できない。
 *
 * 既存 config は他セッションと共有しており今スプリントの Deliverable でもないため
 * 書き換えず、この派生 config で `use.headless` だけを上書きする。
 *
 *   pnpm -C apps/web exec playwright test \
 *     --config e2e/src/config/playwright.headless.config.ts
 *
 * CI 環境変数は設定しないこと。設定すると基底 config の
 * `reuseExistingServer: !process.env.CI` が false になり、
 * 既存の dev server (:3000) と衝突して起動に失敗する。
 *
 * ★★ ハーネスとしての限界 (必ず読め) ★★
 * `reuseExistingServer: true` のままなので、**:3000 で既に動いている dev server を
 * そのまま掴む**。それが誰の・どのリビジョンのサーバーかは保証されない。
 * 実際、QA の検証実行は「QA 自身が起動していない :3000」に対して行われた。
 *
 * 専用ポートに逃がすことは**できない**: Next.js は同一ディレクトリで 2 つ目の
 * dev server を `⨯ Another next dev server is already running.` で拒否する
 * (`PORT=3100 pnpm -C apps/web dev` が exit 1 になることを実測済み)。
 * したがって「今動いているサーバーが検証対象のコードを配信しているか」は
 * 実行者が責任を持って確認すること。行 testid が見つからない等で落ちた場合、
 * まずサーバーの鮮度を疑え。
 */
import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    headless: true,
  },
  projects: baseConfig.projects?.map((project) => ({
    ...project,
    use: { ...project.use, headless: true },
  })),
});
