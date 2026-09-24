"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@apps/shared/utils/time";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { calcCumulativeTimes } from "@apps/shared/utils/relayEvents";
import { toStyleCode } from "@apps/shared/utils/swimStyles";
import type { TeamRelayRankingRow } from "@apps/shared/types";

interface RelayRankingTableProps {
  rows: readonly TeamRelayRankingRow[];
}

const HEADER_CLASS = "py-2 px-2 font-medium text-gray-700";

/** 表の列数。展開行の colSpan に使う (順位/種目/タイム/大会/日付/展開ボタン)。 */
const COLUMN_COUNT = 6;

/**
 * リレーランキング表。
 *
 * 並び順は RPC の `ORDER BY total_time ASC` と `assignCompetitionRanks` が唯一の
 * 定義元であり、列ヘッダーによる並べ替えは提供しない (個人種目版と同じ方針。
 * ランキングでは並び順そのものが機能なので、ユーザー操作で並べ替えると付与済みの
 * 順位表示と表の順序が食い違って嘘になる)。
 *
 * 行を展開するとレグごとの区間タイムと通算タイムを出す。
 * **通算タイムは `calcCumulativeTimes()` で導出する** — DB にも RPC の戻り値にも
 * 通算は持たない (二重に持つと leg_time との整合を別途保つ必要が出る)。
 */
export default function RelayRankingTable({ rows }: RelayRankingTableProps) {
  const t = useTranslations("teams.ranking");
  const tWaPoints = useTranslations("teams.waPointsCompare");
  const tCommon = useTranslations("common");
  // レグの泳法は **正式名** (`practice.styles`: Freestyle / Backstroke / ...) を使う。
  // ⚠️ mobile の `RelayRankingList` は同じ列に **略称** (`practice.styleAbbrev`:
  //    Fr / Ba / Br / Fly) を使っており、この非対称は**意図的**である:
  //    mobile は泳法列が `width: 64` 固定で en `Breaststroke` / de `Schmetterling` が
  //    確実に省略されるため略称が必要。こちらは `<table>` で列が自動幅なので
  //    省略されず、正式名のままでよい。
  //    🚨 web/mobile パリティ監査で「同じ列の文言が違う」差異として拾っても
  //    **揃えないこと。** 揃えると mobile 側で泳法名が省略される
  //    (このプロジェクトには実際にパリティ監査の慣習があり、
  //     docs/web-mobile-feature-gap.md が古い前提のまま差異を「欠陥」として
  //     扱っていた実例がある)。
  const tStyles = useTranslations("practice.styles");
  const locale = useLocale();

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const toggleExpanded = (relayRecordId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(relayRecordId)) {
        next.delete(relayRecordId);
      } else {
        next.add(relayRecordId);
      }
      return next;
    });
  };

  /**
   * レグの泳法ラベル。`styles.style` は canonical なタイトルケースだが、
   * 旧ケーシング (小文字) の行が DB に残っていても拾えるよう `toStyleCode()` で
   * 正規化する。正規化できない値は生の文字列をそのまま出す
   * (`as SwimStyle` のキャストで検証を迂回しない)。
   */
  const styleLabel = (style: string): string => {
    const code = toStyleCode(style);
    return code ? tStyles(code) : style;
  };

  const eventLabel = (row: TeamRelayRankingRow): string =>
    t("relay.eventLabel", {
      distance: row.legDistance,
      legCount: row.legCount,
      kind: t(`relay.kind.${row.relayKind}`),
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`${HEADER_CLASS} text-left w-12`}>{tWaPoints("rankLabel")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("relay.col.event")}</th>
            <th className={`${HEADER_CLASS} text-right`}>{t("relay.col.time")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("relay.col.competition")}</th>
            <th className={`${HEADER_CLASS} text-left`}>{t("relay.col.date")}</th>
            <th className={`${HEADER_CLASS} text-right w-10`}>
              <span className="sr-only">{t("relay.col.legs")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExpanded = expandedIds.has(row.relayRecordId);
            // 通算タイムはレグの区間タイムから導出する (配列順に完全に依存するので、
            // API 境界の toRankingLegs が legIndex 昇順を確定させている)
            const cumulatives = calcCumulativeTimes(row.legs.map((leg) => leg.legTime));

            return (
              <React.Fragment key={row.relayRecordId}>
                <tr
                  className="border-b border-gray-100"
                  data-testid={`team-relay-rankings-row-${row.relayRecordId}`}
                >
                  <td className="py-2 px-2 font-semibold text-gray-700">{row.rank}</td>
                  <td className="py-2 px-2 text-gray-900 whitespace-nowrap">{eventLabel(row)}</td>
                  <td className="py-2 px-2 text-right font-bold text-blue-700 tabular-nums">
                    {formatTimeBest(row.totalTime)}
                  </td>
                  <td className="py-2 px-2 text-gray-700">
                    {/* 大会に紐づかないリレー記録の文言は `common.none` (mobile と同じキー)。
                        ここに "-" 等をハードコードすると同じ行が web と mobile で違う表示になる。
                        ⚠️ 現状 competitionTitle が null になる行は存在しない
                        (根拠は TeamRelayRankingRecord.competitionId の docstring)。
                        「大会に紐づかないリレー記録の直接入力」の予約として残している */}
                    <span className="line-clamp-2 wrap-break-word">
                      {row.competitionTitle ?? tCommon("none")}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                    {/* 大会に紐づかない記録は competitionDate が null なので作成日時に
                        フォールバックする。両方 null のときは formatDate が "-" を返す。
                        ⚠️ 現状このフォールバックを通る行は存在しない (同上の予約) */}
                    {formatDate(
                      row.competitionDate ?? row.relayCreatedAt,
                      "numeric",
                      locale as SupportedLocale,
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      type="button"
                      data-testid={`team-relay-rankings-toggle-${row.relayRecordId}`}
                      aria-expanded={isExpanded}
                      aria-controls={`team-relay-rankings-legs-${row.relayRecordId}`}
                      aria-label={isExpanded ? t("relay.collapse") : t("relay.expand")}
                      onClick={() => toggleExpanded(row.relayRecordId)}
                      className="inline-flex items-center justify-center rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                </tr>

                {isExpanded && (
                  <tr
                    id={`team-relay-rankings-legs-${row.relayRecordId}`}
                    data-testid={`team-relay-rankings-legs-${row.relayRecordId}`}
                    className="border-b border-gray-100 bg-gray-50"
                  >
                    <td colSpan={COLUMN_COUNT} className="px-2 py-3">
                      {row.legs.length === 0 ? (
                        // レグが1件も無いリレー記録 (親だけ残った異常データ)。
                        // 行そのものは順位の母集団なので落とさず、ラップだけ空状態にする
                        <p className="text-xs text-gray-500">{t("relay.noLegs")}</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="py-1 px-2 text-left font-medium">
                                {t("relay.legHeader.swimmer")}
                              </th>
                              <th className="py-1 px-2 text-left font-medium">
                                {t("relay.legHeader.style")}
                              </th>
                              <th className="py-1 px-2 text-right font-medium">
                                {t("relay.legHeader.legTime")}
                              </th>
                              <th className="py-1 px-2 text-right font-medium">
                                {t("relay.legHeader.cumulative")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.legs.map((leg, index) => {
                              // 「第N泳者 / 氏名」。表示と `title` で同じ文字列を使う
                              // (2箇所に組み立てを書くと片方だけ変わる)
                              const swimmerLabel = `${t("relay.legLabel", {
                                num: leg.legIndex + 1,
                              })} / ${leg.displayName ?? t("relay.retiredMember")}`;
                              return (
                                <tr key={leg.legId} className="text-gray-700">
                                  <td className="py-1 px-2">
                                    {/* プロフィール画像は出さない (ユーザー依頼)。RPC の
                                      legs も avatarPath を返さなくなっている。
                                      退会した泳者は名前が無いので代替文言を出す
                                      (空文字にしない)

                                      `xl:max-w-40` + `title` は個人種目版
                                      (`./RankingTable.tsx` のメンバー列) と同じ理由・
                                      同じ値。このサブ表は親の `overflow-x-auto` を
                                      共有しているので、長い氏名を放置すると
                                      **親の「大会/日付/ラップ」列まで押し出す**
                                      (実測: 49文字級で親表の必要幅 796px、
                                       `xl` の右カラム 444〜572px では 6 列が隠れた)。 */}
                                    <span
                                      className="block truncate xl:max-w-40"
                                      title={swimmerLabel}
                                    >
                                      {swimmerLabel}
                                    </span>
                                  </td>
                                  <td className="py-1 px-2">{styleLabel(leg.style)}</td>
                                  <td className="py-1 px-2 text-right tabular-nums">
                                    {formatTimeBest(leg.legTime)}
                                  </td>
                                  <td className="py-1 px-2 text-right tabular-nums font-medium">
                                    {/* index は row.legs.map の添字なので cumulatives
                                      (同じ配列から 1:1 生成) の範囲内。型上は保証
                                      されないので undefined を明示的に扱う */}
                                    {(() => {
                                      const cumulative = cumulatives[index];
                                      return cumulative === undefined
                                        ? "-"
                                        : formatTimeBest(cumulative);
                                    })()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
