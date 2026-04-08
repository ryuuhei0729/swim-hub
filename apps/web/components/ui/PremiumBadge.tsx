"use client";

import React from "react";
import Link from "next/link";

interface PremiumBadgeProps {
  /** 表示するメッセージ */
  message: string;
  /** リンク先（デフォルト: /settings のサブスクリプションタブ） */
  href?: string;
  /** className の追加 */
  className?: string;
}

/**
 * Premium 誘導バッジコンポーネント
 *
 * Free ユーザーに対して Premium 機能であることを通知し、
 * サブスクリプション設定ページへ誘導するバッジ。
 */
export default function PremiumBadge({
  message,
  href = "/settings?tab=subscription",
  className = "",
}: PremiumBadgeProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 ${className}`}
    >
      {/* 王冠アイコン（SVG インライン） */}
      <svg
        className="h-5 w-5 shrink-0 text-amber-500"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.5 10l-2.5-6-2.5 6-5.73-1.42c-.8-.2-1.63.26-1.84 1.06-.21.8.26 1.64 1.06 1.84L8 13l-1.5 5h11L16 13l4.99-1.42c.8-.2 1.27-1.04 1.08-1.84v-.1z" />
      </svg>

      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">{message}</p>
        <Link
          href={href}
          className="mt-1 inline-block text-xs font-semibold text-amber-600 underline hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 rounded"
          tabIndex={0}
          role="link"
          aria-label="Premium にアップグレード"
        >
          Premium にアップグレード
        </Link>
      </div>
    </div>
  );
}
