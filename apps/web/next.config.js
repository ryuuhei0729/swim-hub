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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig
