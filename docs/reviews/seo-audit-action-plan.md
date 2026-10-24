# SwimHub SEO監査 アクションプラン

**監査日:** 2026-02-13
**対象:** SwimHub（Next.js App Router / Cloudflare Workers）

---

## 総合評価

基本的なSEO基盤（メタデータ、robots、sitemap、OG画像、セキュリティヘッダー）は整備済み。残りは構造化データやトップページのSSR化など、より高度な最適化が中心。

---

## P3: Low（長期的改善）

### 3. `/support` ページに FAQPage schema を追加する

- **ファイル:** `apps/web/app/(unauthenticated)/support/page.tsx`
- **理由:** FAQ形式のコンテンツがあれば、Google検索結果にFAQリッチリザルトが表示される可能性がある

### 4. フッターリンクの充実

- サービス紹介ページ、ブログ、使い方ガイドなど、公開コンテンツを増やしてSEO対象ページを拡大

---

## 現状で良好な点（変更不要）

- ルートlayoutにtitle / description / keywordsが設定済み
- `metadataBase` / canonical URL 設定済み
- OG画像・Twitter Card 設定済み
- `robots.ts` / `sitemap.ts` 設定済み
- セキュリティヘッダー（X-Frame-Options, X-Content-Type-Options 等）設定済み
- JSON-LD構造化データ（WebApplication / Organization）設定済み
- トップページがServer Component化済み（静的コンテンツはSSR配信）
- 各公開ページにメタデータ設定済み
- `lang="ja"` が正しく設定
- Google Search Console verification済み
- 見出し構造（H1 → H2）が論理的
- 画像のalt属性が適切に設定
- プライバシーポリシー / 利用規約 / サポートページが存在（E-E-A-Tシグナル）
- Next.js Google Fontsによるフォント最適化
- `priority` 属性でLCP画像の読み込みを最適化

---

## 対応チェックリスト

- [x] ~~P0-1: `robots.ts` 作成~~
- [x] ~~P0-2: `sitemap.ts` 作成~~
- [x] ~~P0-3: `metadataBase` 設定~~
- [x] ~~P1-4: OG画像設定（アイコン流用）~~
- [x] ~~P1-5: トップページServer Component化~~
- [x] ~~P1-6: JSON-LD構造化データ追加~~
- [x] ~~P2-7: 各ページのメタデータ追加~~
- [x] ~~P2-8: セキュリティヘッダー追加~~
- [x] ~~P2-9: Twitter Card設定~~
- [ ] P3-10: FAQPage schema追加
- [ ] P3-11: フッターリンク充実
