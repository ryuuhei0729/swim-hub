"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTimeBest } from "@apps/shared/utils/time";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import type { TeamRankingRow } from "@apps/shared/types";

interface RankingTableProps {
  rows: readonly TeamRankingRow[];
}

const HEADER_CLASS = "py-2 px-2 font-medium text-gray-700";

/**
 * ランキング表。
 *
 * 並び順は RPC の `ORDER BY time ASC` と `assignCompetitionRanks` が唯一の定義元であり、
 * 列ヘッダーによる並べ替えは提供しない。ランキングでは並び順そのものが機能なので、
 * ユーザー操作で並べ替えると付与済みの順位表示と表の順序が食い違って嘘になる。
 * (「自分の行を見つけたい」は将来「自分をハイライト」で解く)
 */
export default function RankingTable({ rows }: RankingTableProps) {
  const t = useTranslations("teams.ranking");
  const tWaPoints = useTranslations("teams.waPointsCompare");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${HEADER_CLASS} text-left w-12`}>{tWaPoints("rankLabel")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("col.name")}</th>
            <th className={`${HEADER_CLASS} text-right`}>{t("col.time")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("col.competition")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("col.date")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.recordId}
              className="border-b border-gray-100 last:border-b-0"
              data-testid={`team-rankings-row-${row.recordId}`}
            >
              <td className="py-2 px-2 font-semibold text-gray-700">{row.rank}</td>
              <td className="py-2 px-2">
                {/* プロフィール画像は出さない (ユーザー依頼)。RPC も avatar_path を
                    返さなくなっているので、ここに Avatar を戻すには
                    supabase/migrations/20260907000000 の RETURNS TABLE から
                    列を足し直す必要がある。

                    ⚠️ `truncate` (white-space:nowrap) だけでは**省略記号は出ない**。
                    `<td>` 内の block 要素は幅が確定しないため、nowrap は
                    「セルの min-content = 氏名の全幅」として効き、表が横に伸びる。
                    実測 (ビルド後 CSS + headless Chromium): 49文字級の氏名で
                    表の必要幅が 925px になり、`xl` の右カラム (444〜572px) では
                    **タイム列以降が全部隠れた**。ランキングの主データはタイムなので
                    これは後退。
                    そこで `xl` 以上だけ `max-w-40` (160px) で上限を与え、
                    はじめて `truncate` が効く状態にする。160px の根拠:
                      - 表の氏名以外の最小必要幅 = 253px。160 + 253 = 413px で
                        1280px 時のカラム幅 444px に収まる (残り 31px は大会名の
                        分割不能語の余裕。176px だと余裕が 15px、192px だと
                        1280px で日付列がはみ出す = 実測)
                      - 通常の氏名の実測最大は 142px ("Christopher Anderson")
                        なので、通常時は省略されない
                    ⚠️ **`xl:` 限定にすること。** 1280px 未満はユーザーが
                    「今のままでいい」と明言した帯域で、QA が全13幅で同一性を
                    実測証明している。
                    `title` で全文を残す。`aria-label` は付けない — CSS の
                    クリップは DOM のテキストを変えないので支援技術には全文が
                    読まれており、同じ文字列を aria-label で上書きするのは冗長。 */}
                <span className="block truncate text-gray-900 xl:max-w-40" title={row.displayName}>
                  {row.displayName}
                </span>
              </td>
              <td className="py-2 px-2 text-right font-bold text-blue-700 tabular-nums">
                {formatTimeBest(row.time)}
              </td>
              <td className="py-2 px-2 text-gray-700">
                {/* 一括登録の記録は大会を持たない。文言は `common.none` (mobile と同じキー) を
                    使う。ここに "-" 等をハードコードすると同じ行が web と mobile で
                    違う表示になる */}
                <span className="line-clamp-2 wrap-break-word">
                  {row.competitionTitle ?? tCommon("none")}
                </span>
              </td>
              <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                {/* 一括登録の記録は大会を持たないため competitionDate が null。その場合は
                    記録の作成日時にフォールバックする (根拠は TeamRankingRecord.recordCreatedAt
                    の docstring)。両方 null のときは formatDate が "-" を返す。 */}
                {formatDate(
                  row.competitionDate ?? row.recordCreatedAt,
                  "numeric",
                  locale as SupportedLocale,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
