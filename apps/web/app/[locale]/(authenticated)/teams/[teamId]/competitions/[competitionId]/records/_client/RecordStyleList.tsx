"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { SwimStyle } from "@apps/shared/types";
import type { RelayKind } from "@apps/shared/types/relayRecord";
import type { StyleEntry, StyleLookup } from "./buildStyleEntries";
import type { RecordEventSelection } from "./recordEventSelection";
import {
  buildIndividualStyleCards,
  buildRelayStyleCards,
  groupConsecutive,
} from "./styleListCards";

/**
 * 種目カードの背景色 (泳法ごと)。mobile の styleCardColors.ts と同じ配色
 * (定義元は components/team/member-management/components/MembersTimeTable.tsx の -50 段)。
 */
const STYLE_CARD_BG_CLASS: Record<SwimStyle, string> = {
  Fr: "bg-yellow-50",
  Br: "bg-green-50",
  Ba: "bg-red-50",
  Fly: "bg-blue-50",
  IM: "bg-pink-50",
};

const isSwimStyle = (key: string): key is SwimStyle => key in STYLE_CARD_BG_CLASS;

/** リレーはフリーリレー=自由形、メドレーリレー=個人メドレーと同じ色 (mobile と同じ) */
const relayCardBgClass = (relayKind: RelayKind): string =>
  relayKind === "medley" ? STYLE_CARD_BG_CLASS.IM : STYLE_CARD_BG_CLASS.Fr;

const CARD_CLASS =
  "flex flex-col items-start rounded-lg border border-gray-200 px-3 py-2 text-left shadow-sm transition hover:border-blue-400 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500";

// 列が多いと「100m自由形」「100mメドレーリレー」が単語の途中で折り返すので、4列までにする
const GROUP_GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2";

interface RecordStyleListProps<S extends StyleLookup> {
  styles: readonly S[];
  /** 既存記録 + エントリー由来行をマージ済みの StyleEntry (大会全体) */
  styleEntries: readonly StyleEntry[];
  poolType: number;
  entryUserCountByStyleId: ReadonlyMap<number, number>;
  /** 個人種目のカード見出し (翻訳済みの「距離+泳法」) */
  styleLabel: (style: S) => string;
  onSelect: (selection: RecordEventSelection) => void;
}

/**
 * 大会記録の代理入力 - 種目一覧 (個人22種目 + リレー7種目のカード)。
 * mobile の TeamRecordStyleListScreen と同じく、カードに入力済みの人数 (リレーはチーム数)
 * とエントリー人数を出し、押すとその種目の入力画面を開く。
 */
export default function RecordStyleList<S extends StyleLookup>({
  styles,
  styleEntries,
  poolType,
  entryUserCountByStyleId,
  styleLabel,
  onSelect,
}: RecordStyleListProps<S>) {
  const t = useTranslations("teams");
  const tRecords = useTranslations("competition.records");

  const individualGroups = useMemo(
    () =>
      groupConsecutive(
        buildIndividualStyleCards(styles, styleEntries, poolType, entryUserCountByStyleId).filter(
          (card) => card.visible,
        ),
        (card) => card.groupKey,
      ),
    [styles, styleEntries, poolType, entryUserCountByStyleId],
  );
  const relayGroups = useMemo(
    () =>
      groupConsecutive(
        buildRelayStyleCards(styleEntries, poolType).filter((card) => card.visible),
        (card) => card.relayKind,
      ),
    [styleEntries, poolType],
  );

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">
          {t("record.individualEvents")}
        </h2>
        <div className="space-y-2">
          {individualGroups.map((group) => (
            <div key={group[0]?.groupKey} className={GROUP_GRID_CLASS}>
              {group.map((card) => (
                <button
                  key={card.styleId}
                  type="button"
                  data-testid={`record-style-card-${card.styleId}`}
                  onClick={() => onSelect({ kind: "individual", styleId: card.styleId })}
                  className={`${CARD_CLASS} ${
                    isSwimStyle(card.groupKey) ? STYLE_CARD_BG_CLASS[card.groupKey] : "bg-white"
                  }`}
                >
                  <span className="text-sm font-semibold text-gray-900">
                    {styleLabel(card.style)}
                  </span>
                  {card.filledCount > 0 ? (
                    <span className="mt-1 text-xs font-semibold text-blue-600">
                      {t("recordList.filledCountIndividual", { n: card.filledCount })}
                    </span>
                  ) : (
                    <span className="mt-1 text-xs text-gray-400">{t("recordList.emptyLabel")}</span>
                  )}
                  {card.entryCount > 0 && (
                    <span className="mt-0.5 text-[11px] text-gray-500">
                      {t("recordList.entryCountLabel", { n: card.entryCount })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">{t("record.relayLabel")}</h2>
        <div className="space-y-2">
          {relayGroups.map((group) => (
            <div key={group[0]?.relayKind} className={GROUP_GRID_CLASS}>
              {group.map((card) => {
                // 個人種目の「距離+種目名」に揃える (例: 200mフリーリレー)
                const totalDistance = card.legDistance * card.legCount;
                const label =
                  card.relayKind === "medley"
                    ? `${totalDistance}m${tRecords("medleyRelaySuffix")}`
                    : `${totalDistance}m${tRecords("freeRelaySuffix")}`;
                return (
                  <button
                    key={card.relayEventId}
                    type="button"
                    data-testid={`record-relay-card-${card.relayEventId}`}
                    onClick={() => onSelect({ kind: "relay", relayEventId: card.relayEventId })}
                    className={`${CARD_CLASS} ${relayCardBgClass(card.relayKind)}`}
                  >
                    <span className="text-sm font-semibold text-gray-900">{label}</span>
                    {card.groupCount > 0 ? (
                      <span className="mt-1 text-xs font-semibold text-blue-600">
                        {t("recordList.filledCountRelay", { n: card.groupCount })}
                      </span>
                    ) : (
                      <span className="mt-1 text-xs text-gray-400">
                        {t("recordList.emptyLabel")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
