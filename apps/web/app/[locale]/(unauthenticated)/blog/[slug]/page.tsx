import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TagIcon,
  ArrowRightIcon,
  CalendarIcon,
  ChevronRightIcon,
  HomeIcon,
} from "@heroicons/react/24/outline";
import { getAllSlugs, getPostBySlug } from "@/lib/blog";
import { marked } from "marked";
import type { Metadata } from "next";
import { safeJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/constants";

export const revalidate = 3600;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const post = getPostBySlug(slug);
    if (!post) return { title: "記事が見つかりません | SwimHub" };

    const url = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;

    return {
      title: `${post.title} | SwimHub ブログ`,
      description: post.description,
      alternates: { canonical: url },
      openGraph: {
        title: post.title,
        description: post.description,
        type: "article",
        locale: "ja_JP",
        url,
        siteName: "SwimHub",
        publishedTime: post.date,
        tags: post.tags,
        images: [
          { url: `${SITE_URL}/icon.png`, width: 512, height: 512, alt: post.title },
        ],
      },
      twitter: {
        card: "summary",
        title: post.title,
        description: post.description,
        images: [`${SITE_URL}/icon.png`],
      },
    };
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const contentHtml = await marked(post.content);

  const postUrl = `${SITE_URL}/blog/${encodeURIComponent(slug)}`;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Organization",
      name: "SwimHub",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "SwimHub",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl },
    image: `${SITE_URL}/icon.png`,
    keywords: post.tags.join(", "),
    inLanguage: "ja",
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "ブログ", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: postUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-50 to-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* パンくずリスト */}
        <nav aria-label="パンくずリスト" className="mb-6">
          <ol className="flex items-center text-sm text-gray-500 flex-wrap gap-1">
            <li className="flex items-center">
              <Link href="/" className="hover:text-blue-600 transition-colors flex items-center">
                <HomeIcon className="w-4 h-4" />
              </Link>
              <ChevronRightIcon className="w-3 h-3 mx-1.5 text-gray-400" />
            </li>
            <li className="flex items-center">
              <Link href="/blog" className="hover:text-blue-600 transition-colors">
                ブログ
              </Link>
              <ChevronRightIcon className="w-3 h-3 mx-1.5 text-gray-400" />
            </li>
            <li className="text-gray-700 font-medium truncate max-w-[200px] sm:max-w-none">
              {post.title}
            </li>
          </ol>
        </nav>

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
          <p className="text-lg font-semibold text-gray-900 mb-2">水泳の記録管理をもっと手軽に</p>
          <p className="text-sm text-gray-600 mb-6">
            SwimHub
            なら練習記録・大会記録をまとめて管理。成長を可視化して、次の目標につなげましょう。
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
  );
}
