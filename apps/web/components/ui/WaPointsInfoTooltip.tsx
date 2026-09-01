"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface WaPointsInfoTooltipProps {
  /** info アイコンボタンの data-testid (呼び出し元ごとに一意な値を渡すこと) */
  buttonTestId: string;
  /** デスクトップ用ツールチップ (hover/focus 対象) の data-testid (省略可) */
  tooltipTestId?: string;
}

/**
 * WAポイントの算出方法を説明する info アイコン + ツールチップ。
 * デスクトップは hover / キーボードフォーカスで表示、モバイルはタップでトグルする。
 *
 * 文言は `teams.waPointsCompare` 名前空間 (infoAriaLabel / infoTooltip) を単一ソースとして
 * マイページ・メンバー詳細モーダルからも共用する。namespace 名がマイページ文脈と一致しないが、
 * 5言語分の文言を複製する保守負債より単一ソースを優先する PM 判断による。
 *
 * 呼び出し元は `relative` な (`relative inline-block` 等) ラッパー内で、
 * 説明対象のボタンと並べてこのコンポーネントを配置すること (絶対配置の基準はそのラッパー)。
 */
export const WaPointsInfoTooltip: React.FC<WaPointsInfoTooltipProps> = ({
  buttonTestId,
  tooltipTestId,
}) => {
  const t = useTranslations("teams.waPointsCompare");
  const [showInfo, setShowInfo] = useState(false);
  // インスタンスごとに一意な id (同一ページに複数配置されても aria-describedby の参照先が衝突しない)
  const reactId = useId();
  const tooltipId = `wa-points-info-tooltip-${reactId}`;

  return (
    <div className="absolute -top-1.5 -right-1.5 group/wainfo">
      <button
        type="button"
        data-testid={buttonTestId}
        aria-label={t("infoAriaLabel")}
        aria-describedby={tooltipId}
        onClick={() => setShowInfo((v) => !v)}
        onBlur={() => setShowInfo(false)}
        className="sm:pointer-events-none flex items-center justify-center h-4 w-4 rounded-full bg-white text-gray-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <InformationCircleIcon className="h-4 w-4" />
      </button>

      {/*
        デスクトップ: hover またはキーボードフォーカスで表示（Tab フォーカスでも出る）。
        aria-describedby はこの要素の id を常に参照する (常時マウントされているため参照が
        ダングリングにならない)。W3C の accessible description 計算では aria-describedby から
        直接参照された要素は hidden (display:none) でも除外されないため、CSS で非表示の間も
        スクリーンリーダーはこの説明文を読み上げる。
      */}
      <div
        id={tooltipId}
        role="tooltip"
        data-testid={tooltipTestId}
        className="hidden group-hover/wainfo:sm:block group-focus-within/wainfo:sm:block absolute z-20 top-full right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] p-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg leading-relaxed"
      >
        {t("infoTooltip")}
      </div>

      {/* モバイル: タップトグル */}
      {showInfo && (
        <div
          role="tooltip"
          className="sm:hidden absolute z-20 top-full right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] p-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg leading-relaxed"
        >
          {t("infoTooltip")}
        </div>
      )}
    </div>
  );
};
