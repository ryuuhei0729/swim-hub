import React from 'react'
import Link from 'next/link'
import { NewspaperIcon, TagIcon } from '@heroicons/react/24/outline'
import { BackButton } from '@/components/ui/BackButton'
import { getAllPosts } from '@/lib/blog'

export const revalidate = 3600

export const metadata = {
  title: 'ブログ | SwimHub',
  description: '水泳に関するお役立ち情報、練習のコツ、大会準備のヒントなどをお届けします。',
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <BackButton />
          <div className="flex items-center mb-4">
            <NewspaperIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">ブログ</h1>
          </div>
          <p className="text-gray-600">
            水泳に関するお役立ち情報、練習のコツ、大会準備のヒントなどをお届けします。
          </p>
        </div>

        {/* 記事一覧 */}
        {posts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            まだ記事がありません。
          </div>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <div
                key={post.slug}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                  <Link href={`/blog/${post.slug}`}>
                    <h2 className="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                      {post.title}
                    </h2>
                  </Link>
                  <time className="text-sm text-gray-500 whitespace-nowrap shrink-0">
                    {post.date}
                  </time>
                </div>
                <Link href={`/blog/${post.slug}`} className="block">
                  <p className="text-gray-600 text-sm leading-relaxed mb-3">
                    {post.description}
                  </p>
                </Link>
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/blog/tag/${encodeURIComponent(tag)}`}
                        className="inline-flex items-center text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        <TagIcon className="w-3 h-3 mr-1" />
                        {tag}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
