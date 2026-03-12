import React from 'react'
import Link from 'next/link'
import { TagIcon } from '@heroicons/react/24/outline'
import { BackButton } from '@/components/ui/BackButton'
import { getAllTags, getPostsByTag } from '@/lib/blog'
import type { Metadata } from 'next'

export const revalidate = 3600

interface TagPageProps {
  params: Promise<{ tag: string }>
}

export async function generateStaticParams() {
  const tags = getAllTags()
  return tags.map((tag) => ({ tag: encodeURIComponent(tag) }))
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag } = await params
  const decodedTag = decodeURIComponent(tag)
  return {
    title: `「${decodedTag}」の記事一覧 | SwimHub ブログ`,
    description: `「${decodedTag}」タグが付けられた水泳に関する記事の一覧です。`,
  }
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params
  const decodedTag = decodeURIComponent(tag)
  const posts = getPostsByTag(decodedTag)

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <BackButton />
          <div className="flex items-center mb-4">
            <TagIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">
              「{decodedTag}」の記事一覧
            </h1>
          </div>
          <p className="text-gray-600">
            「{decodedTag}」タグが付けられた記事が {posts.length} 件あります。
          </p>
        </div>

        {/* 記事一覧 */}
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            このタグの記事はまだありません。
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <h2 className="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                    {post.title}
                  </h2>
                  <time className="text-sm text-gray-500 whitespace-nowrap shrink-0">
                    {post.date}
                  </time>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-3">
                  {post.description}
                </p>
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((t) => (
                      <span
                        key={t}
                        className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                          t === decodedTag
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        <TagIcon className="w-3 h-3 mr-1" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* すべての記事を見るリンク */}
        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            すべての記事を見る
          </Link>
        </div>
      </div>
    </div>
  )
}
