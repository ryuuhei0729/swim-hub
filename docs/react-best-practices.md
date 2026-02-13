# Vercel React Best Practices 診断レポート

> 診断日: 2026-02-13
> 対象: swim-hub (Next.js 15 / React 19 / App Router)
> 基準: [Vercel React Best Practices](https://github.com/vercel/react-best-practices) 57ルール

## 総合スコア

| カテゴリ | 優先度 | 評価 | 主な所見 |
|----------|--------|------|----------|
| Waterfall排除 | CRITICAL | **B** | `Promise.all`は広く使われているが、7箇所の未対応あり |
| Bundle最適化 | CRITICAL | **C** | barrel import問題・`optimizePackageImports`未設定 |
| Server-Side性能 | HIGH | **C** | `React.cache()`がほぼ未使用、`after()`未使用 |
| Client-Sideデータ取得 | MEDIUM-HIGH | **B+** | React Query設定は良好、一部rawクエリあり |
| Re-render最適化 | MEDIUM | **B** | useEffect内の派生state等、中程度の問題あり |
| Rendering性能 | MEDIUM | **A-** | 大きな問題なし |
| JavaScript性能 | LOW-MEDIUM | **A** | 特筆すべき問題なし |
| Advanced Patterns | LOW | **B** | `useTransition`未使用 |

## 改善アクション優先順位 TOP 10

| # | アクション | インパクト | 工数 | 詳細 |
|---|-----------|-----------|------|------|
| 1 | `next.config.mjs`に`optimizePackageImports`を追加 | **大** | 小 | [bundle-optimization.md](./best-practices/bundle-optimization.md#1-optimizepackageimports未設定) |
| 2 | `getServerUser()`等を`React.cache()`でラップ | **大** | 小 | [server-performance.md](./best-practices/server-performance.md#1-reactcache未使用) |
| 3 | `@/stores/index.ts`のbarrel importを直接importに変更 | **大** | 中 | [bundle-optimization.md](./best-practices/bundle-optimization.md#2-barrel-import問題) |
| 4 | `@/components/team/index.ts`のbarrel importを直接importに変更 | **大** | 中 | [bundle-optimization.md](./best-practices/bundle-optimization.md#2-barrel-import問題) |
| 5 | 未使用の`RecordProgressChart.tsx`（recharts）を削除 | **大** | 小 | [bundle-optimization.md](./best-practices/bundle-optimization.md#3-重量ライブラリの静的import) |
| 6 | `MetadataLoader.tsx`等の逐次awaitを`Promise.all`に | **中** | 小 | [waterfall-fixes.md](./best-practices/waterfall-fixes.md) |
| 7 | Google Calendar sync-allのN+1問題を修正 | **中** | 中 | [waterfall-fixes.md](./best-practices/waterfall-fixes.md#finding-3-high-google-calendar-sync-all--n1クエリ) |
| 8 | `ShareCardModal`を`next/dynamic`に変更 | **中** | 小 | [bundle-optimization.md](./best-practices/bundle-optimization.md#4-遅延読み込み候補) |
| 9 | `getCachedStyles()`に実際のキャッシュを実装 | **中** | 小 | [server-performance.md](./best-practices/server-performance.md#1-reactcache未使用) |
| 10 | フィルター処理等に`useTransition`を導入 | **小** | 小 | [rerender-optimization.md](./best-practices/rerender-optimization.md#4-usetransition未使用) |

## 各カテゴリ詳細

- [waterfall-fixes.md](./best-practices/waterfall-fixes.md) — Waterfall排除の詳細と修正例
- [bundle-optimization.md](./best-practices/bundle-optimization.md) — Bundle最適化の詳細と修正例
- [server-performance.md](./best-practices/server-performance.md) — Server-Side性能の詳細と修正例
- [rerender-optimization.md](./best-practices/rerender-optimization.md) — Re-render/Rendering/Client-Side最適化の詳細と修正例
