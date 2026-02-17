import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/settings',
          '/mypage',
          '/attendance',
          '/schedule',
          '/competitions',
          '/competition',
          '/members',
          '/practice',
          '/goals',
          '/bulk-besttime',
          '/teams',
          '/teams-admin',
        ],
      },
    ],
    sitemap: 'https://swim-hub.app/sitemap.xml',
  }
}
