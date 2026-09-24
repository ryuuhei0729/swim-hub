"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MapPinIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTimeBest } from "@/utils/formatters";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import Avatar from "@/components/ui/Avatar";
import BestTimeBadge from "@/components/ui/BestTimeBadge";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import { calcCumulativeTimes } from "@apps/shared/utils/relayEvents";
import type { RelayRecordWithLegs } from "@apps/shared/types";

interface RecordUser {
  name: string;
  profile_image_path: string | null;
}

interface SplitTimeEntry {
  id: string;
  distance: number;
  split_time: number;
}

interface StyleInfo {
  id: number;
  name_jp: string;
  name: string;
  style: string;
  distance: number;
}

interface RecordEntry {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  reaction_time: number | null;
  is_relaying: boolean;
  note: string | null;
  pool_type: number;
  users: RecordUser | RecordUser[] | null;
  styles: StyleInfo | StyleInfo[] | null;
  split_times: SplitTimeEntry[];
}

interface CompetitionDetail {
  id: string;
  title: string | null;
  date: string;
  place: string | null;
  pool_type: number;
  note: string | null;
}

interface TeamCompetitionRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
}

export function buildDisplaySplits(
  splitTimes: SplitTimeEntry[],
  raceDistance: number,
  recordTime: number,
): Array<{ distance: number; splitTime: number }> {
  const baseSplits = [...splitTimes]
    .sort((a, b) => a.distance - b.distance)
    .map((st) => ({ distance: st.distance, splitTime: st.split_time }));

  if (baseSplits.length === 0) return baseSplits;

  // ゴールタイムを最終splitとして追加（種目の距離と同じ距離のsplitがない場合）
  if (raceDistance && recordTime && recordTime > 0) {
    const hasGoalSplit = baseSplits.some((st) => st.distance === raceDistance);
    if (!hasGoalSplit) {
      return [...baseSplits, { distance: raceDistance, splitTime: recordTime }];
    }
  }

  return baseSplits;
}

function getUser(users: RecordUser | RecordUser[] | null | undefined): RecordUser | null {
  if (!users) return null;
  return Array.isArray(users) ? (users[0] ?? null) : users;
}

function getUserName(
  users: RecordUser | RecordUser[] | null | undefined,
  unknownLabel: string,
): string {
  return getUser(users)?.name || unknownLabel;
}

function getStyle(styles: StyleInfo | StyleInfo[] | null | undefined): StyleInfo | null {
  if (!styles) return null;
  if (Array.isArray(styles)) return styles[0] || null;
  return styles;
}

/**
 * タイム表示 + Best バッジ + スプリットトグルをまとめたセル。
 *
 * PM 最終仕様 (Critical-1 差し替え、旧「スプリットトグルと同じ行の1段下」案は撤回):
 * - Best バッジは新規カラムにしない。タイムと**同じ行・すぐ隣**に `inline-flex gap-1.5` で置く
 *   (ユーザー要望: 「タイムの近くに表示させたい」)。バッジがタイム行に常駐するため、
 *   スプリット0件でもバッジは自然に描画される (旧 Critical-2 の「両方無いときだけ省略」
 *   のための空スロット制御は不要になった)。
 * - スプリットトグルはタイム行の下に単独の行として残す (トグルのみ)。
 * - Best バッジは個人種目行・孤立リレー行の**両方**に出す (旧 `showBestBadge` フラグは
 *   削除した)。`isRelaying={record.is_relaying}` を素通しすれば
 *   `getListBestCandidates` が「引き継ぎありのベスト」と「通常スタートのベスト」を
 *   別系統で正しく比較するため、`relay_records` にバックフィル済みか否かという
 *   ユーザーから見えない内部状態でバッジの有無が変わる非対称を作らない
 *   (PM 実測: `records.is_relaying=true` の115行中112行が未バックフィルの孤児で、
 *   ここでバッジを隠すとほぼ全リレーレグでバッジが出なくなっていた)。
 *
 * PM 仕様変更 (SC5 差し替え): タイムの文字色・太さは順位・ベスト判定に関わらず一律で
 * `text-blue-600 font-bold`。赤字判定・行レベルの Best 候補取得は廃止した
 * (Best バッジの判定は `BestTimeBadge` 内部の shared 純関数呼び出しに一本化)。
 */
function RecordTimeCell({
  record,
  styleInfo,
  recordDate,
}: {
  record: RecordEntry;
  styleInfo: StyleInfo | null;
  recordDate: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("teams.competitionRecordsModal");

  const formattedSplits = useMemo(
    () => buildDisplaySplits(record.split_times, styleInfo?.distance ?? 0, record.time),
    [record.split_times, styleInfo, record.time],
  );
  const hasSplits = formattedSplits.length > 0;

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <span className="text-blue-600 font-bold">{formatTimeBest(record.time)}</span>
        <BestTimeBadge
          recordId={record.id}
          userId={record.user_id}
          styleId={record.style_id}
          currentTime={record.time}
          recordDate={recordDate}
          poolType={record.pool_type}
          isRelaying={record.is_relaying}
          compact
        />
      </div>

      {hasSplits && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            {isOpen ? (
              <ChevronUpIcon className="h-3 w-3" />
            ) : (
              <ChevronDownIcon className="h-3 w-3" />
            )}
            {t("splitTimesLabel", { count: formattedSplits.length })}
          </button>
        </div>
      )}

      {isOpen && hasSplits && (
        <LapTimeDisplay splitTimes={formattedSplits} raceDistance={styleInfo?.distance ?? 0} />
      )}
    </>
  );
}

export default function TeamCompetitionRecordsModal({
  isOpen,
  onClose,
  competitionId,
  competitionTitle,
}: TeamCompetitionRecordsModalProps) {
  const { supabase } = useAuth();
  const t = useTranslations("teams.competitionRecordsModal");
  // リレー種目ラベル・レグ表示は既存のランキング画面の文言を流用する
  // (CLAUDE.md「種目コードの canonical」節と同じ理由で、二重管理にしない)。
  const tRelay = useTranslations("teams.ranking");
  const [competition, setCompetition] = useState<CompetitionDetail | null>(null);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [relayRecords, setRelayRecords] = useState<RelayRecordWithLegs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRelayIds, setExpandedRelayIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [compResult, recordsResult, relayResult] = await Promise.all([
          supabase
            .from("competitions")
            .select("id, title, date, place, pool_type, note")
            .eq("id", competitionId)
            .single(),
          supabase
            .from("records")
            .select(
              `
              id,
              user_id,
              style_id,
              time,
              reaction_time,
              is_relaying,
              note,
              pool_type,
              users!records_user_id_fkey (
                name,
                profile_image_path
              ),
              styles (
                id,
                name_jp,
                name,
                style,
                distance
              ),
              split_times (
                id,
                distance,
                split_time
              )
            `,
            )
            .eq("competition_id", competitionId)
            .order("time", { ascending: true }),
          TeamRelayRecordsAPI.getByCompetition(supabase, competitionId),
        ]);

        if (compResult.error) throw compResult.error;
        if (recordsResult.error) throw recordsResult.error;

        setCompetition(compResult.data as CompetitionDetail);
        setRecords((recordsResult.data || []) as unknown as RecordEntry[]);
        setRelayRecords(relayResult);
      } catch (err) {
        console.error("大会記録の取得エラー:", err);
        setError(t("loadError"));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen, competitionId, supabase, t]);

  // relay_records に取り込まれたレグの元 records.id。個人種目一覧から除外するために使う
  // (is_relaying の値に関わらず除外する。第1泳者は is_relaying=false でもここに載る)。
  const relayLegRecordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const relay of relayRecords) {
      for (const leg of relay.legs) {
        if (leg.recordId) ids.add(leg.recordId);
      }
    }
    return ids;
  }, [relayRecords]);

  const sortedRelayRecords = useMemo(
    () => [...relayRecords].sort((a, b) => a.totalTime - b.totalTime),
    [relayRecords],
  );

  const toggleRelayExpanded = (relayRecordId: string) => {
    setExpandedRelayIds((current) => {
      const next = new Set(current);
      if (next.has(relayRecordId)) {
        next.delete(relayRecordId);
      } else {
        next.add(relayRecordId);
      }
      return next;
    });
  };

  // 種目ごとにグルーピング (個人・リレー両方の生 records を含む。表示側で絞り込む)
  const recordsByStyle = useMemo(() => {
    const grouped: Record<number, { style: StyleInfo; records: RecordEntry[] }> = {};

    for (const record of records) {
      const styleInfo = getStyle(record.styles);
      if (!styleInfo) continue;

      let entry = grouped[record.style_id];
      if (!entry) {
        entry = { style: styleInfo, records: [] };
        grouped[record.style_id] = entry;
      }
      entry.records.push(record);
    }

    // 種目名でソート
    return Object.values(grouped).sort((a, b) => a.style.name_jp.localeCompare(b.style.name_jp));
  }, [records]);

  if (!isOpen) return null;

  const poolTypeLabel = competition?.pool_type === 1 ? t("poolTypeLong") : t("poolTypeShort");
  const recordDate = competition?.date ?? null;

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">{competitionTitle}{t("titleSuffix")}</h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {loading && (
              <div className="text-center py-8">
                <div className="text-sm text-gray-500">{t("loading")}</div>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            )}

            {!loading && !error && (
              <>
                {/* 大会基本情報 */}
                {competition && (
                  <div className="flex items-center gap-4 mb-4 flex-wrap text-sm text-gray-600">
                    {competition.place && (
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {competition.place}
                      </span>
                    )}
                    <span>{poolTypeLabel}</span>
                    {competition.note && (
                      <span className="flex items-center gap-1">
                        <PencilSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {competition.note}
                      </span>
                    )}
                  </div>
                )}

                {/* 記録なし */}
                {records.length === 0 && relayRecords.length === 0 && (
                  <div className="text-center py-8 text-gray-500">{t("empty")}</div>
                )}

                {/* 種目ごとの記録 */}
                <div className="space-y-6">
                  {recordsByStyle.map(({ style, records: styleRecords }) => {
                    // リレー (relay_records) に取り込まれたレグは個人一覧から除外する
                    // (現行バグの修正: 第1泳者は is_relaying=false のため従来はここに
                    //  混入していた)。
                    const individualRecords = styleRecords
                      .filter((r) => !r.is_relaying && !relayLegRecordIds.has(r.id))
                      .sort((a, b) => a.time - b.time);
                    // relay_records に紐づかない is_relaying 行は従来どおり平置きで表示する
                    // (Success Criteria 4: 消失させない)。
                    const orphanRelayRecords = styleRecords
                      .filter((r) => r.is_relaying && !relayLegRecordIds.has(r.id))
                      .sort((a, b) => a.time - b.time);
                    const visibleCount = individualRecords.length + orphanRelayRecords.length;

                    if (visibleCount === 0) return null;

                    return (
                      <div key={style.id} className="bg-blue-50 rounded-lg p-4">
                        {/* 種目ヘッダー */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-5 bg-blue-500 rounded-full" />
                          <h4 className="text-base font-semibold text-blue-800">{style.name_jp}</h4>
                          <span className="text-sm text-blue-600">({visibleCount}件)</span>
                        </div>

                        {/* 記録テーブル */}
                        <div className="bg-white rounded-lg border border-blue-200 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-blue-200 bg-blue-50/50">
                                <th className="py-2 px-3 font-medium text-blue-800 w-10">
                                  <span className="sr-only">{t("photoLabel")}</span>
                                </th>
                                <th className="text-left py-2 px-3 font-medium text-blue-800">
                                  {t("nameLabel")}
                                </th>
                                <th className="text-center py-2 px-3 font-medium text-blue-800">
                                  {t("timeLabel")}
                                </th>
                                <th className="text-center py-2 px-3 font-medium text-blue-800 hidden sm:table-cell">
                                  {t("rtLabel")}
                                </th>
                                <th className="text-center py-2 px-3 font-medium text-blue-800 hidden sm:table-cell">
                                  {t("noteLabel")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {individualRecords.map((record) => {
                                const styleInfo = getStyle(record.styles);
                                const user = getUser(record.users);
                                return (
                                  <tr
                                    key={record.id}
                                    className="border-b border-blue-100 last:border-b-0"
                                  >
                                    <td className="py-2 px-3">
                                      <Avatar
                                        avatarUrl={user?.profile_image_path ?? null}
                                        userName={getUserName(record.users, t("unknownUser"))}
                                        size="sm"
                                      />
                                    </td>
                                    <td className="py-2 px-3 text-gray-900">
                                      {getUserName(record.users, t("unknownUser"))}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <RecordTimeCell
                                        record={record}
                                        styleInfo={styleInfo}
                                        recordDate={recordDate}
                                      />
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                      {record.reaction_time ? record.reaction_time.toFixed(2) : "-"}
                                    </td>
                                    <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                      {record.note || "-"}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* relay_records に紐づかないリレー記録 (バックフィル未対象の旧データ)。
                                  Best バッジは個人種目行と同じく表示する (PM 裁定: バックフィル
                                  済みか否かというユーザーから見えない内部状態でバッジの有無を
                                  変えない)。`isRelaying={record.is_relaying}` (常に true) を
                                  素通しすることで、getListBestCandidates が引き継ぎありのベスト
                                  と正しく比較する。 */}
                              {orphanRelayRecords.length > 0 && (
                                <>
                                  <tr className="bg-gray-50">
                                    <td
                                      colSpan={5}
                                      className="py-2 px-3 text-xs font-medium text-gray-500"
                                    >
                                      {t("relay")}
                                    </td>
                                  </tr>
                                  {orphanRelayRecords.map((record) => {
                                    const styleInfo = getStyle(record.styles);
                                    const user = getUser(record.users);
                                    return (
                                      <tr
                                        key={record.id}
                                        className="border-b border-blue-100 last:border-b-0"
                                      >
                                        <td className="py-2 px-3">
                                          <Avatar
                                            avatarUrl={user?.profile_image_path ?? null}
                                            userName={getUserName(record.users, t("unknownUser"))}
                                            size="sm"
                                          />
                                        </td>
                                        <td className="py-2 px-3 text-gray-900">
                                          {getUserName(record.users, t("unknownUser"))}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <RecordTimeCell
                                            record={record}
                                            styleInfo={styleInfo}
                                            recordDate={recordDate}
                                          />
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                          {record.reaction_time
                                            ? record.reaction_time.toFixed(2)
                                            : "-"}
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-600 hidden sm:table-cell">
                                          {record.note || "-"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* リレー (relay_records): 1チーム=1行。展開すると各泳者の区間/通算タイム */}
                  {sortedRelayRecords.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 bg-blue-500 rounded-full" />
                        <h4 className="text-base font-semibold text-blue-800">{t("relay")}</h4>
                        <span className="text-sm text-blue-600">
                          ({sortedRelayRecords.length}件)
                        </span>
                      </div>

                      <div className="bg-white rounded-lg border border-blue-200 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-blue-200 bg-blue-50/50">
                              <th className="py-2 px-3 font-medium text-blue-800 w-28">
                                <span className="sr-only">{t("photoLabel")}</span>
                              </th>
                              <th className="text-left py-2 px-3 font-medium text-blue-800">
                                {tRelay("relay.col.event")}
                              </th>
                              <th className="text-center py-2 px-3 font-medium text-blue-800">
                                {tRelay("relay.col.time")}
                              </th>
                              <th className="text-right py-2 px-3 font-medium text-blue-800 w-10">
                                <span className="sr-only">{tRelay("relay.col.legs")}</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedRelayRecords.map((relay) => {
                              const isExpanded = expandedRelayIds.has(relay.id);
                              // 通算タイムはレグの区間タイムから導出する (配列順に完全に
                              // 依存するので、API 境界の toRelayRecordWithLegs が
                              // legIndex 昇順を確定させている)
                              const cumulatives = calcCumulativeTimes(
                                relay.legs.map((leg) => leg.legTime),
                              );
                              const eventLabel = tRelay("relay.eventLabel", {
                                distance: relay.legDistance,
                                legCount: relay.legCount,
                                kind: tRelay(`relay.kind.${relay.relayKind}`),
                              });

                              return (
                                <React.Fragment key={relay.id}>
                                  {/* 行全体をクリック可能にする (ラベル/タイム部分をクリックしても
                                      展開できるように)。チーム行に「その人のベスト」概念は無いため
                                      赤字判定・Best バッジは適用しない (裁定3)。
                                      ⚠️ 姉妹コンポーネント `rankings/RelayRankingTable.tsx` は
                                      実 `<button>` だけをインタラクティブにするパターンだが、
                                      本モーダルは意図的にこちらを採用していない。ここは行の面積が
                                      広く (アバタースタック+種目名+タイム)、ボタンだけをタップ対象に
                                      すると特にモバイル幅で誤タップ・操作性低下が起きるため、行全体
                                      (`<tr role="button">`) をタップ対象にした (PM 裁定: 維持)。 */}
                                  <tr
                                    className="border-b border-blue-100 cursor-pointer hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                                    data-testid={`team-competition-relay-row-${relay.id}`}
                                    onClick={() => toggleRelayExpanded(relay.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        toggleRelayExpanded(relay.id);
                                      }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                    aria-expanded={isExpanded}
                                    aria-controls={`team-competition-relay-legs-${relay.id}`}
                                    aria-label={
                                      isExpanded ? tRelay("relay.collapse") : tRelay("relay.expand")
                                    }
                                  >
                                    <td className="py-2 px-3">
                                      {/* 4人のアバターを重ね合わせたスタック表示。
                                          `-ml-3` は sibling combinator (`space-x-*`) を
                                          使わず要素ごとに直接付与する (Tailwind v4 で
                                          `space-x-*`/`space-y-*` が特異度0になる問題を
                                          避けるため)。 */}
                                      <div className="flex items-center">
                                        {relay.legs.map((leg, i) => (
                                          <div
                                            key={leg.id}
                                            className={i === 0 ? "relative" : "relative -ml-3"}
                                            style={{ zIndex: relay.legs.length - i }}
                                          >
                                            <Avatar
                                              avatarUrl={leg.profileImagePath}
                                              userName={leg.userName ?? t("unknownUser")}
                                              size="sm"
                                              className="ring-2 ring-white"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-gray-900 whitespace-nowrap">
                                      {eventLabel}
                                    </td>
                                    {/* SC5 改訂: 「1位以外の記録も全部青字」はチーム総合タイムも
                                        対象 (mobile relayTotalTime と同じ扱い)。太字は 1位強調とは
                                        無関係の「総合タイムを目立たせる」既存の意図のまま残す。 */}
                                    <td className="py-2 px-3 text-center font-bold text-blue-600 tabular-nums">
                                      {formatTimeBest(relay.totalTime)}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      {/* 視覚的な開閉インジケーター。行 (tr) 側が実体の
                                          クリック/キーボード操作対象なので、二重のフォーカス
                                          ストップ・二重トグルを避けるためこのボタン自体は
                                          アクセシビリティツリーから外し (tabIndex=-1,
                                          aria-hidden)、クリックは stopPropagation で
                                          行の onClick と競合しないようにする。 */}
                                      <button
                                        type="button"
                                        data-testid={`team-competition-relay-toggle-${relay.id}`}
                                        tabIndex={-1}
                                        aria-hidden="true"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleRelayExpanded(relay.id);
                                        }}
                                        className="inline-flex items-center justify-center rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                      >
                                        {isExpanded ? (
                                          <ChevronUpIcon className="h-4 w-4" />
                                        ) : (
                                          <ChevronDownIcon className="h-4 w-4" />
                                        )}
                                      </button>
                                    </td>
                                  </tr>

                                  {isExpanded && (
                                    <tr
                                      id={`team-competition-relay-legs-${relay.id}`}
                                      data-testid={`team-competition-relay-legs-${relay.id}`}
                                      className="border-b border-blue-100 bg-gray-50"
                                    >
                                      <td colSpan={4} className="px-3 py-3">
                                        {relay.legs.length === 0 ? (
                                          // レグが1件も無いリレー記録 (親だけ残った異常データ)
                                          <p className="text-xs text-gray-500">
                                            {tRelay("relay.noLegs")}
                                          </p>
                                        ) : (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="text-gray-500">
                                                <th className="py-1 px-2 w-10">
                                                  <span className="sr-only">{t("photoLabel")}</span>
                                                </th>
                                                <th className="py-1 px-2 text-left font-medium">
                                                  {tRelay("relay.legHeader.swimmer")}
                                                </th>
                                                <th className="py-1 px-2 text-left font-medium">
                                                  {tRelay("relay.legHeader.style")}
                                                </th>
                                                <th className="py-1 px-2 text-right font-medium">
                                                  {tRelay("relay.legHeader.legTime")}
                                                </th>
                                                <th className="py-1 px-2 text-right font-medium">
                                                  {tRelay("relay.legHeader.cumulative")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {relay.legs.map((leg, index) => {
                                                const swimmerName =
                                                  leg.userName ?? tRelay("relay.retiredMember");
                                                const legLabel = tRelay("relay.legLabel", {
                                                  num: leg.legIndex + 1,
                                                });
                                                // Best バッジはレグの userId / recordId が
                                                // null (退会 / records 行削除済み) の場合は
                                                // 非表示にフォールバックする (PM 裁定3。
                                                // 下記 JSX で `leg.userId && leg.recordId` を
                                                // 直接判定式に書き、TS の narrowing を効かせる
                                                // ことで `as` キャストを避ける)。
                                                // アバターは mobile (RowAvatar) と揃え、
                                                // null でも非表示にせずイニシャル等の
                                                // 既存フォールバックを表示する。
                                                return (
                                                  <tr key={leg.id} className="text-gray-700">
                                                    <td className="py-1 px-2">
                                                      <Avatar
                                                        avatarUrl={leg.profileImagePath}
                                                        userName={leg.userName ?? t("unknownUser")}
                                                        size="sm"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2">
                                                      <span
                                                        className="block truncate"
                                                        title={`${legLabel} / ${swimmerName}`}
                                                      >
                                                        {legLabel} / {swimmerName}
                                                      </span>
                                                    </td>
                                                    <td className="py-1 px-2">
                                                      {leg.styleNameJp ?? "-"}
                                                    </td>
                                                    <td className="py-1 px-2 text-right tabular-nums">
                                                      <div className="inline-flex items-center gap-1.5">
                                                        <span className="text-blue-600 font-bold">
                                                          {formatTimeBest(leg.legTime)}
                                                        </span>
                                                        {leg.userId && leg.recordId && (
                                                          <BestTimeBadge
                                                            recordId={leg.recordId}
                                                            userId={leg.userId}
                                                            styleId={leg.styleId}
                                                            currentTime={leg.legTime}
                                                            recordDate={recordDate}
                                                            poolType={relay.poolType}
                                                            isRelaying
                                                            compact
                                                          />
                                                        )}
                                                      </div>
                                                    </td>
                                                    <td className="py-1 px-2 text-right tabular-nums font-medium">
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
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
