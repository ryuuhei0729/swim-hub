/* global process */
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // セキュリティヘッダーは middleware.ts で設定（OpenNext の routingHandler との互換性のため）

  // 実機スマホから dev サーバーを開くための許可オリジン（dev 専用・本番ビルドには影響しない）
  // - 192.168.0.13:   同一 Wi-Fi 時の LAN IP（`pnpm dev:lan`）
  // - 100.67.68.119:  この Mac の tailnet IP（別回線から http で直接叩く場合）
  // - *.ts.net:       Tailscale の MagicDNS 名（`tailscale serve` 経由の https）
  allowedDevOrigins: ["192.168.0.13", "100.67.68.119", "*.ts.net"],

  // TypeScript設定
  typescript: {
    ignoreBuildErrors: false,
  },

  // 環境変数
  env: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT || "development",
  },

  // NOTE: serverExternalPackages は Cloudflare Workers では使用不可
  // （ランタイムに node_modules がないため external モジュールを解決できない）

  // バンドル最適化: barrel importを自動的に直接importに変換
  // Next.js 16 では experimental 内に配置
  experimental: {
    // Next 16 の dev DevTools 用デバッグチャネル (既定 true)。
    // next/dist/client/dev/debug-channel.js が TransformStream の writer を
    // IndexedDB 復元経路で二重に close/write するため、iOS Safari 実機で
    // "stream is closing or closed" / "Cannot close a writable stream..." が出る。
    // アプリ側は stream API を一切使っておらず、dev 専用機能なので無効化する。
    reactDebugChannel: false,
    optimizePackageImports: [
      "@heroicons/react/24/outline",
      "@heroicons/react/24/solid",
      "date-fns",
    ],
  },

  // Turbopack 設定（Next.js 16 デフォルト、bundle-analyzer の webpack 設定との共存用）
  // next-intl v3 + Turbopack 環境では plugin の alias 注入が一部効かないため、
  // `next-intl/config` を i18n/request.ts に解決する alias を明示的に追加する。
  turbopack: {
    resolveAlias: {
      "next-intl/config": "./i18n/request.ts",
    },
  },

  // 画像設定
  images: {
    // Cloudflare Workers環境では画像最適化が利用できないため無効化
    unoptimized: true,
    // 最新フォーマットを優先
    formats: ["image/avif", "image/webp"],
    // Next.js 16: quality={100} を使用するコンポーネントがあるため明示指定
    qualities: [100, 75],
    // レスポンシブ画像のサイズ設定
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
      // ローカル環境のSupabase用設定
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      // Cloudflare R2
      {
        protocol: "https",
        hostname: "*.r2.dev",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default analyzer(withNextIntl(nextConfig));
