"use client";

import React, { useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { Style } from "@apps/shared/types";
import { styleIdToCodeKey, buildSwimStyleLabel } from "@/utils/swimStyle";
import { buildRelayEvents } from "./relayEvents";
import {
  buildStyleEntriesFromExisting,
  applyEntryAdditionsToStyleEntries,
  stampExistingEntryTimeReferences,
} from "./buildStyleEntries";
import {
  planEntryAdditionsForRecords,
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@swim-hub/shared/utils/entryRecordMerge";
import type { TeamGoalTarget } from "@apps/shared/types/goalTargets";
import type { BestTime } from "@apps/shared/types/ui";
import RecordPageHeader from "./RecordPageHeader";
import RecordStyleList from "./RecordStyleList";
import RecordStyleDetail from "./RecordStyleDetail";
import { countEntryUsersByStyleId } from "./styleListCards";
import { buildRecordEventPath, type RecordEventSelection } from "./recordEventSelection";
import type {
  EntryWithUser,
  RecordCompetition,
  RecordTeamMember,
  RecordWithDetails,
} from "./types";

interface RecordClientProps {
  teamId: string;
  competitionId: string;
  competition: RecordCompetition;
  teamName: string;
  members: RecordTeamMember[];
  existingRecords: RecordWithDetails[];
  styles: Style[];
  /** 大会エントリー（記録入力の初期反映用） */
  entries: EntryWithUser[];
  /**
   * user_id → その選手のベストタイム一覧（両水路・引き継ぎ込み）。
   * 参考バッジの表示にのみ使う。入力値のプリフィルには**絶対に使わない**。
   */
  bestTimesByUser: Record<string, BestTime[]>;
  /** 大会内メンバーの目標 (status 未絞り)。省略・空なら目標バッジを出さない */
  goalTargets?: TeamGoalTarget[];
  /**
   * 開いている種目 (URL の ?style= / ?relay=)。null・省略なら種目一覧を出す。
   * styles マスター / RELAY_EVENTS に無い種目は一覧として扱う。
   */
  selection?: RecordEventSelection | null;
}

const EMPTY_GOAL_TARGETS: TeamGoalTarget[] = [];

/**
 * チーム大会記録の代理入力 (管理者専用)。mobile と同じく2段の組み立てにする:
 *   1. 種目一覧 (個人22種目 + リレー7種目のカード。入力済みの人数を表示)
 *   2. 種目を選ぶと、その種目のメンバーの記録を入力して種目ごとに保存する
 * どちらを出すかは URL のクエリ (selection) で決める。
 */
export default function RecordClient({
  teamId,
  competitionId,
  competition,
  teamName: _teamName,
  members,
  existingRecords,
  styles,
  entries,
  bestTimesByUser,
  goalTargets = EMPTY_GOAL_TARGETS,
  selection = null,
}: RecordClientProps) {
  const router = useRouter();
  const t = useTranslations("teams");
  const tRecords = useTranslations("competition.records");
  const tStyles = useTranslations("practice.styles");
  const locale = useLocale();

  /** style_id から翻訳済み種目ラベルを組み立てる。未知種目は name_jp をそのまま返す */
  const styleLabel = useCallback(
    (style: Pick<Style, "id" | "distance" | "name_jp">): string => {
      const codeKey = styleIdToCodeKey(style.id);
      if (codeKey) {
        return buildSwimStyleLabel(style.distance, tStyles(codeKey), locale);
      }
      return style.name_jp;
    },
    [tStyles, locale],
  );

  const relayEvents = useMemo(
    () =>
      buildRelayEvents({
        ba: tStyles("Ba"),
        br: tStyles("Br"),
        fly: tStyles("Fly"),
        fr: tStyles("Fr"),
        legLabel: (num, style) => tRecords("relayLegLabel", { num, style }),
        freeRelaySuffix: tRecords("freeRelaySuffix"),
        medleyRelaySuffix: tRecords("medleyRelaySuffix"),
      }),
    [tStyles, tRecords],
  );

  // 大会全体の既存記録をフォームの形 (StyleEntry) にし、エントリーのうち既存記録が無い
  // (user_id, style_id) の組だけを初期行として足す (既存記録を優先。リレーの組には触れない)。
  // 既存記録由来の行にも参考表示 (entryTimeReference) を後付けして、申告タイムと
  // 結果タイムを見比べられるようにする。
  const unknownUserLabel = t("competitionRecordsModal.unknownUser");
  const styleEntries = useMemo(() => {
    const base = buildStyleEntriesFromExisting(existingRecords, styles);
    const entryRows: EntryRowForRecordMerge[] = entries.map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      style_id: entry.style_id,
      entry_time: entry.entry_time,
      note: entry.note,
      userName: entry.users?.name || unknownUserLabel,
    }));
    const plans = planEntryAdditionsForRecords(entryRows, base, styles);
    const merged = applyEntryAdditionsToStyleEntries(base, plans);
    return stampExistingEntryTimeReferences(merged, buildEntryTimeReferenceLookup(entryRows));
  }, [existingRecords, styles, entries, unknownUserLabel]);

  const entryUserCountByStyleId = useMemo(() => countEntryUsersByStyleId(entries), [entries]);

  // 開いている種目の見出し。マスターに無い種目 (不正な URL) は一覧に戻す
  const selectedTitle = useMemo((): string | null => {
    if (!selection) return null;
    if (selection.kind === "relay") {
      return relayEvents.find((r) => r.id === selection.relayEventId)?.label ?? null;
    }
    const style = styles.find((s) => s.id === selection.styleId);
    return style ? styleLabel(style) : null;
  }, [selection, relayEvents, styles, styleLabel]);

  if (selection && selectedTitle !== null) {
    return (
      <RecordStyleDetail
        // 種目を切り替えたら入力状態を作り直す
        key={selection.kind === "relay" ? `relay:${selection.relayEventId}` : `style:${selection.styleId}`}
        teamId={teamId}
        competitionId={competitionId}
        competition={competition}
        members={members}
        existingRecords={existingRecords}
        styles={styles}
        allStyleEntries={styleEntries}
        selection={selection}
        title={selectedTitle}
        relayEvents={relayEvents}
        bestTimesByUser={bestTimesByUser}
        goalTargets={goalTargets}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <RecordPageHeader
          backLabel={t("record.backButton")}
          onBack={() => router.push(`/teams-admin/${teamId}?tab=competitions`)}
          title={t("record.pageTitle")}
          subtitle={tRecords("subtitle")}
          competition={competition}
        />
        <RecordStyleList
          styles={styles}
          styleEntries={styleEntries}
          poolType={competition.pool_type}
          entryUserCountByStyleId={entryUserCountByStyleId}
          styleLabel={styleLabel}
          onSelect={(next) => router.push(buildRecordEventPath(teamId, competitionId, next))}
        />
      </div>
    </div>
  );
}
