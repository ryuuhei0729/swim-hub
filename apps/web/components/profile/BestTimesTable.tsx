"use client";

import React, { useState, useMemo } from "react";
import { CalendarIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { formatTimeBest, formatDate } from "../../utils/formatters";
import { WaPointsInfoTooltip } from "../ui/WaPointsInfoTooltip";
import {
  DISTANCES,
  STYLES,
  STYLE_KEY_MAP,
  isInvalidCombination,
} from "@apps/shared/utils/swimStyles";
import {
  getBestWaPointsForCandidates,
  type Gender,
  type WaPointsCellCandidate,
} from "@apps/shared/utils/waPoints";
import {
  AGE_CATEGORY_ORDER,
  getBestDomesticPointsForCandidates,
  type AgeCategory,
  type CompareMetric,
} from "@apps/shared/utils/domesticRecords";
import { isNewRecord } from "@apps/shared/utils/bestTimeBadge";
import { COMPACT_SELECT_CLASS } from "@/components/ui/selectStyles";

export interface BestTime {
  id: string;
  time: number;
  created_at: string | null;
  pool_type: number; // 0: 短水路, 1: 長水路
  is_relaying: boolean;
  note?: string; // 備考（一括登録時に使用）
  style: {
    name_jp: string;
    distance: number;
  };
  competition?: {
    title: string | null;
    date: string;
  };
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string;
    time: number;
    created_at: string | null;
    note?: string;
    competition?: {
      title: string | null;
      date: string;
    };
  };
}

type TabType = "all" | "short" | "long";

interface BestTimesTableProps {
  bestTimes: BestTime[];
  gender?: number; // 0: 男性, 1: 女性, undefined/その他: 不明 (ポイント表示は常に「—」)
  // resolveAgeCategory() の判定結果 (呼び出し元で算出)。birthday 自体は渡さない
  // (必要なのは区分だけ。生年月日は gender より機微度が高い)。null/undefined は「未設定」
  ageCategory?: AgeCategory | null;
  /** 上の段の左端に出す見出し (水路の切り替え・引き継ぎの左) */
  title?: React.ReactNode;
  /** 下の段に出す操作 (点数化ボタンの右、凡例の左)。ダッシュボードでは一括入力 */
  footerAction?: React.ReactNode;
  /**
   * 入力モード (ダッシュボードの一括入力)。渡すと表の代わりに render の結果を出し、下の段は footer にする。
   * 水路は「ALL」を外して短水路/長水路だけにし (登録には水路が必ず要る)、
   * 「引き継ぎ」のチェックで引き継ぎタイムの入力に切り替える。見出しと切り替えの行はそのまま使う。
   */
  edit?: BestTimesTableEdit;
}

export interface BestTimesTableEdit {
  render: (ctx: { poolType: 0 | 1; isRelaying: boolean }) => React.ReactNode;
  footer: React.ReactNode;
}

// セルの data-testid を組み立てる (例: 自由形100m -> "best-times-cell-Fr-100")
const cellTestId = (style: string, distance: number) =>
  `best-times-cell-${STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP]}-${distance}`;

export default function BestTimesTable({
  bestTimes,
  gender,
  ageCategory,
  title,
  footerAction,
  edit,
}: BestTimesTableProps) {
  const t = useTranslations("mypage.bestTimesTable");
  const tStyles = useTranslations("practice.styles");
  const tStyleAbbrev = useTranslations("practice.styleAbbrev");
  const locale = useLocale();
  // ja 以外のロケールではプルダウンUI自体を出さない (既存の WA トグルのみ)
  const showCompareMetricPicker = locale === "ja";
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false);
  // 比較指標の初期選択は常に WA
  const [compareMetric, setCompareMetric] = useState<CompareMetric>("wa");
  // 年齢区分の手動上書き。
  // undefined = ユーザーがまだ操作していない (prop の自動判定結果に追従し続ける)
  // null      = ユーザーが明示的に「未設定」を選んだ (以後 prop が変わっても追従しない)
  // AgeCategory = ユーザーが明示的にいずれかの区分を選んだ
  // この3値を区別しないと、prop 側 (誕生日の後発設定・修正) が変わっても
  // セレクトが古い値のまま固まる (未操作なのに「未設定」で固定される) バグになる。
  const [ageCategoryOverride, setAgeCategoryOverride] = useState<AgeCategory | null | undefined>(
    undefined,
  );
  // ユーザー未操作の間は prop (呼び出し元の自動判定結果) にそのまま追従する。
  // prop の undefined と null はどちらも「区分不明」を意味し業務的な衝突が無いため、
  // ここでの `??` は安全 (対して override 自体を `??` で畳むと「未設定を選んだ」と
  // 「まだ選んでいない」が区別できなくなるため、上の状態変数では undefined/null を分けている)。
  const effectiveAgeCategory: AgeCategory | null =
    ageCategoryOverride === undefined ? (ageCategory ?? null) : ageCategoryOverride;
  const [isWaPointsMode, setIsWaPointsMode] = useState<boolean>(false);

  const styleHeaderBgClass: Record<string, string> = {
    自由形: "bg-yellow-100",
    平泳ぎ: "bg-green-100",
    背泳ぎ: "bg-red-100",
    バタフライ: "bg-blue-100", // 紺色系はTailwindではblue系で代替
    個人メドレー: "bg-pink-100",
  };

  const styleCellBgClass: Record<string, string> = {
    自由形: "bg-yellow-50",
    平泳ぎ: "bg-green-50",
    背泳ぎ: "bg-red-50",
    バタフライ: "bg-blue-50",
    個人メドレー: "bg-pink-50",
  };

  // タブごとにフィルタリングされたベストタイムを取得
  const filteredBestTimes = useMemo(() => {
    if (activeTab === "short") {
      // 短水路タブ: pool_type === 0 のみ
      return bestTimes.filter((bt) => bt.pool_type === 0);
    } else if (activeTab === "long") {
      // 長水路タブ: pool_type === 1 のみ
      return bestTimes.filter((bt) => bt.pool_type === 1);
    } else {
      // ALLタブ: そのまま返す（getBestTimeで比較処理）
      return bestTimes;
    }
  }, [bestTimes, activeTab]);

  const getBestTime = (style: string, distance: number): BestTime | null => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`;

    if (activeTab === "all") {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = [];

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0,
      );

      shortCourseTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 1,
      );

      longCourseTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const candidates: BestTime[] = [];

      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName);

      matchingTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    }
  };

  // ポイント表示用のセル取得関数 (WA / 日本記録 / 年齢別の3指標に対応)
  // 候補は「非リレー記録のみ」とし、includeRelaying の状態から完全に独立させる
  // (getBestTime とは意図的に別関数にし、既存のタイム表示アルゴリズムへの回帰を避ける)。
  // ALLタブでは短水路/長水路を問わず「最高得点」の候補を選ぶ (最速タイムではない)。
  const getPointsCell = (
    style: string,
    distance: number,
  ): { points: number; poolType: number } | null => {
    // gender が男女いずれでもない (undefined 含む) 場合は常に「—」。例外は投げない
    if (gender !== 0 && gender !== 1) return null;

    const dbStyleName = `${distance}m${style}`;
    // ALLタブは短水路/長水路の両方から候補を集める。短水路/長水路タブは既にpool_typeで絞られている
    const source = activeTab === "all" ? bestTimes : filteredBestTimes;

    const candidates: WaPointsCellCandidate[] = source
      .filter((bt) => bt.style.name_jp === dbStyleName && !bt.is_relaying)
      .map((bt) => ({ time: bt.time, poolType: bt.pool_type === 1 ? 1 : 0 }));

    const styleKey = STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP];

    if (compareMetric === "nr") {
      // 「日本記録ポイント」= category="general" のショートカット (別テーブル・別経路は無い)
      const result = getBestDomesticPointsForCandidates(
        candidates,
        "general",
        gender as Gender,
        styleKey,
        distance,
      );
      return result === null ? null : { points: result.points, poolType: result.poolType };
    }

    if (compareMetric === "age") {
      // birthday 未設定 (区分「未設定」) は既存の「gender undefined なら常に—」と対称に「—」
      if (effectiveAgeCategory === null) return null;
      const result = getBestDomesticPointsForCandidates(
        candidates,
        effectiveAgeCategory,
        gender as Gender,
        styleKey,
        distance,
      );
      return result === null ? null : { points: result.points, poolType: result.poolType };
    }

    const result = getBestWaPointsForCandidates(candidates, gender as Gender, styleKey, distance);
    return result === null ? null : { points: result.points, poolType: result.poolType };
  };

  // タイム表示用のヘルパー関数
  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTimeBest(bestTime.time);
    const suffixes: string[] = [];

    // ALLタブの場合、長水路ならLを追加
    if (activeTab === "all" && bestTime.pool_type === 1) {
      suffixes.push("L");
    }

    // 引き継ぎありのタイムの場合、Rを追加
    if (bestTime.is_relaying) {
      suffixes.push("R");
    }

    return {
      main: timeStr,
      suffix: suffixes.join(""),
    };
  };

  const tabs = [
    { id: "all", label: "ALL" },
    { id: "short", label: t("shortCourse") },
    { id: "long", label: t("longCourse") },
  ];

  if (edit) {
    // 「ALL」のまま入力モードに入ったら短水路から始める (activeTab 自体は書き換えず、戻ったら ALL のまま)
    const editTab: "short" | "long" = activeTab === "long" ? "long" : "short";
    return (
      <div className="@container">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {title}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:ml-auto">
            <div className="inline-flex rounded-md bg-gray-100 p-0.5" role="group">
              {(
                [
                  { id: "short", label: t("shortCourse") },
                  { id: "long", label: t("longCourse") },
                ] as const
              ).map((tab) => {
                const isActive = tab.id === editTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`best-times-edit-pool-${tab.id}`}
                    aria-pressed={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 py-1">
              <input
                type="checkbox"
                data-testid="best-times-edit-relay-toggle"
                checked={includeRelaying}
                onChange={(e) => setIncludeRelaying(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-700">{t("includeRelayCompact")}</span>
            </label>
          </div>
        </div>
        {edit.render({ poolType: editTab === "long" ? 1 : 0, isRelaying: includeRelaying })}
        <div className="mt-2 flex flex-wrap items-center gap-2">{edit.footer}</div>
      </div>
    );
  }

  if (bestTimes.length === 0) {
    return (
      <div>
        {title && <div className="mb-2">{title}</div>}
        <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            />
          </svg>
        </div>
        <p className="text-gray-600">{t("noRecords")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("noRecordsDetail")}</p>
        </div>
        {footerAction}
      </div>
    );
  }

  // 表の文字サイズ・余白は画面幅ではなくこの枠の幅で切り替える (@lg = 512px, @xl = 576px)。
  // ダッシュボードでは「次の大会」と横並びになり、画面が広くても表の幅は半分程度になるため
  return (
    <div className="@container">
      {/* 上の段: 見出し・水路の切り替え・引き継ぎ (2026-11-09 ユーザー指定) */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {title}
        {/* 水路の切り替えと引き継ぎは、PC (lg 以上) では右に寄せる (2026-11-09 ユーザー指定) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:ml-auto">
          <div className="inline-flex rounded-md bg-gray-100 p-0.5" role="group">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5" title={t("includeRelay")}>
            <input
              type="checkbox"
              checked={includeRelaying}
              onChange={(e) => setIncludeRelaying(e.target.checked)}
              aria-label={t("includeRelay")}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700">{t("includeRelayCompact")}</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-none sm:rounded-xl shadow border-y sm:border border-gray-300 -mx-4 sm:mx-0">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-0.5 @lg:px-2 py-0.5 @lg:py-1 text-left text-[9px] @lg:text-xs font-semibold text-gray-700 border-r border-gray-300 w-[32px] @lg:w-[52px] h-[24px] @lg:h-[32px]">
                {t("distanceHeader")}
              </th>
              {STYLES.map((style) => (
                <th
                  key={style}
                  className={`px-0.5 @lg:px-1 @xl:px-2 py-0.5 @lg:py-1 text-center text-[9px] @lg:text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 h-[24px] @lg:h-[32px] ${styleHeaderBgClass[style]}`}
                >
                  <span className="@lg:hidden">{tStyleAbbrev(STYLE_KEY_MAP[style])}</span>
                  <span className="hidden @lg:inline">{tStyles(STYLE_KEY_MAP[style])}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {DISTANCES.map((distance, rowIdx) => (
              <tr key={distance}>
                <td
                  className={`px-0.5 @lg:px-2 py-0.5 @lg:py-1 text-[9px] @lg:text-xs font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 w-[32px] @lg:w-[52px] h-[30px] @lg:h-[36px] ${rowIdx > 0 ? "border-t border-gray-300" : ""}`}
                >
                  {distance}m
                </td>
                {STYLES.map((style) => {
                  const bestTime = !isWaPointsMode ? getBestTime(style, distance) : null;
                  const pointsCell = isWaPointsMode ? getPointsCell(style, distance) : null;
                  // New 判定は大会実施日が基準。一括登録 (competition なし) は対象外
                  const isNew = isNewRecord(bestTime?.competition?.date);
                  return (
                    <td
                      key={style}
                      data-testid={cellTestId(style, distance)}
                      className={`px-0.5 @lg:px-2 py-0.5 @lg:py-1 text-center text-[9px] @lg:text-xs text-gray-900 border-r border-gray-300 last:border-r-0 h-[30px] @lg:h-[36px] ${rowIdx > 0 ? "border-t border-gray-300" : ""} ${isInvalidCombination(style, distance) ? "bg-gray-200" : styleCellBgClass[style]}`}
                    >
                      {isWaPointsMode ? (
                        pointsCell ? (
                          <span className="font-semibold text-xs @lg:text-sm @xl:text-base text-gray-900">
                            {pointsCell.points}
                            {activeTab === "all" && pointsCell.poolType === 1 && (
                              <span className="text-[8px] @lg:text-xs ml-0.5 @lg:ml-1">L</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-block text-gray-300">—</span>
                        )
                      ) : bestTime ? (
                        <div
                          className={`group relative inline-block pt-1 ${isNew ? "pr-4 @lg:pr-5" : ""}`}
                        >
                          {isNew && (
                            <span className="absolute -top-0.5 -right-2 @lg:-right-3 text-[8px] @lg:text-[9px] bg-red-500 text-white px-1 py-0.5 leading-none rounded-full shadow">
                              New
                            </span>
                          )}
                          {/* 通常表示：ベストタイム */}
                          <span
                            className={`font-semibold text-xs @lg:text-sm @xl:text-base ${isNew ? "text-red-600" : "text-gray-900"}`}
                          >
                            {(() => {
                              const display = getTimeDisplay(bestTime);
                              return (
                                <>
                                  {display.main}
                                  {display.suffix && (
                                    <span className="text-[8px] @lg:text-xs ml-0.5 @lg:ml-1">
                                      {display.suffix}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </span>

                          {/* ホバー時の詳細情報 */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] @xl:text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                            <div className="flex items-center space-x-1 mb-1">
                              <CalendarIcon className="h-3 w-3" />
                              <span>{formatDate(bestTime.competition?.date ?? bestTime.created_at, "numeric")}</span>
                            </div>
                            {bestTime.competition ? (
                              <div className="text-blue-300">{bestTime.competition.title}</div>
                            ) : null}
                            {bestTime.note ? (
                              <div className="text-gray-400">{bestTime.note}</div>
                            ) : !bestTime.competition ? (
                              <div className="text-gray-400">{t("bulkEntryNote")}</div>
                            ) : null}
                            {/* 矢印 */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-block text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 下の段: 点数化・一括入力など・凡例 (2026-11-09 ユーザー指定)。比較指標はその下の行 */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative inline-block shrink-0">
          <button
            type="button"
            data-testid="best-times-wa-points-toggle"
            aria-pressed={isWaPointsMode}
            onClick={() => setIsWaPointsMode((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              isWaPointsMode
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {t("waPointsToggle")}
          </button>
          <WaPointsInfoTooltip
            buttonTestId="best-times-wa-points-info-button"
            ariaLabel={t("pointsInfoAriaLabel")}
            tooltipText={t("pointsInfo")}
          />
        </div>
        {footerAction}
        <span data-testid="best-times-legend" className="ml-auto text-xs text-red-600">
          {isWaPointsMode
            ? `※ ${t("legend.longCourse")}, ${t("legend.relayingExcludedFromWaPoints")}`
            : `※ ${t("legend.longCourse")}, ${t("legend.relaying")}`}
        </span>
      </div>
      {/* 比較指標 (WAポイント / 日本記録基準 / 区分記録基準) のプルダウン。点数化 ON かつ ja ロケール限定、
          初期選択は常に WA。点数化ボタンの行の下の行に出す (2026-11-11 ユーザー指定。以前は同じ行) */}
      {/*
        select のボックス指定 (h-9 / py-1 / pl-2 sm:pl-3 / pr-7) は
        `components/ui/selectStyles.ts` の COMPACT_SELECT_CLASS が唯一の定義元。
        ▼ の重なりと 640〜767px の高さ不足の根拠コメントはそこにある。
        🚨 ここにクラス文字列を書き戻さないこと (片方だけ直されて再発する)。
      */}
      {isWaPointsMode && showCompareMetricPicker && (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="best-times-compare-metric-row">
          <div className="relative inline-block shrink-0">
            <select
              data-testid="best-times-compare-metric-select"
              aria-label={t("compareMetricLabel")}
              value={compareMetric}
              onChange={(e) => setCompareMetric(e.target.value as CompareMetric)}
              className={COMPACT_SELECT_CLASS}
            >
              <option value="wa">{t("compareMetric.wa")}</option>
              <option value="nr">{t("compareMetric.nr")}</option>
              <option value="age">{t("compareMetric.age")}</option>
            </select>
            <WaPointsInfoTooltip
              buttonTestId="best-times-compare-metric-info-button"
              ariaLabel={t("compareMetricInfoAriaLabel")}
              tooltipText={t("compareMetricInfo")}
            />
          </div>

          {compareMetric === "age" && (
            <select
              data-testid="best-times-age-category-select"
              aria-label={t("ageCategoryLabel")}
              value={effectiveAgeCategory ?? "unset"}
              onChange={(e) =>
                setAgeCategoryOverride(
                  e.target.value === "unset" ? null : (e.target.value as AgeCategory),
                )
              }
              className={COMPACT_SELECT_CLASS}
            >
              <option value="unset">{t("ageCategoryUnset")}</option>
              {AGE_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {t(`ageCategory.${category}`)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
