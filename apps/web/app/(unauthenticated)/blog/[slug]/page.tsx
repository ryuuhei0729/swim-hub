import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, TagIcon, ArrowRightIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { getAllSlugs, getPostBySlug } from '@/lib/blog'
import { marked } from 'marked'
import type { Metadata } from 'next'

export const revalidate = 3600

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const post = getPostBySlug(slug)
    if (!post) return { title: '記事が見つかりません | SwimHub' }

    return {
      title: `${post.title} | SwimHub ブログ`,
      description: post.description,
    }
  })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const contentHtml = await marked(post.content)

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* 戻るリンク */}
        <Link
          href="/blog"
          className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 transition-colors mb-8"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1.5" />
          ブログ一覧に戻る
        </Link>

        {/* 記事ヘッダー */}
        <header className="mb-8">
          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full"
                >
                  <TagIcon className="w-3 h-3 mr-1" />
                  {tag}
                </span>
              ))}
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
            {post.title}
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CalendarIcon className="w-4 h-4" />
            <time>{post.date}</time>
          </div>
        </header>

        {/* 記事本文 */}
        <article
          className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-8 sm:px-10 sm:py-10
            prose sm:prose-lg prose-gray max-w-none"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        {/* CTA */}
        <div className="mt-10 bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">
            水泳の記録管理をもっと手軽に
          </p>
          <p className="text-sm text-gray-600 mb-6">
            SwimHub なら練習記録・大会記録をまとめて管理。成長を可視化して、次の目標につなげましょう。
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            無料で始める
            <ArrowRightIcon className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>
    </div>
  )
}
