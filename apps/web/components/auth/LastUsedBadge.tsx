"use client";

import { useTranslations } from "next-intl";

interface LastUsedBadgeProps {
  /** ボタンの aria-describedby から参照する id */
  id: string;
  testId?: string;
}

/**
 * ログインボタン右上に重ねる「直近で利用」バッジ。親要素に relative が必要。
 * 単独では読み上げず (aria-hidden)、ボタンの aria-describedby 経由で説明として読ませる。
 */
export const LastUsedBadge: React.FC<LastUsedBadgeProps> = ({ id, testId }) => {
  const t = useTranslations("auth.signin");
  return (
    <span
      id={id}
      aria-hidden="true"
      data-testid={testId}
      className="pointer-events-none absolute -top-2.5 right-3 z-10 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold leading-4 text-white shadow-sm"
    >
      {t("lastUsed")}
    </span>
  );
};
