/* global process */
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

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
    optimizePackageImports: [
      "@heroicons/react/24/outline",
      "@heroicons/react/24/solid",
      "date-fns",
    ],
  },

  // Turbopack 設定（Next.js 16 デフォルト、bundle-analyzer の webpack 設定との共存用）
  turbopack: {},

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

export default analyzer(nextConfig);
