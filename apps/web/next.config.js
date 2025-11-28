/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript設定
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // 環境変数
  env: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',
  },
  
  // 外部パッケージ設定
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // 画像設定
  images: {
    // 開発環境では画像最適化を無効化（ローカルSupabaseへのアクセス問題を回避）
    unoptimized: process.env.NODE_ENV === 'development',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // ローカル環境のSupabase用設定
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
