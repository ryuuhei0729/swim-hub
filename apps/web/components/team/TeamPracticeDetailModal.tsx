"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  XMarkIcon,
  MapPinIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTime, formatTimeAverage } from "@/utils/formatters";
import Avatar from "@/components/ui/Avatar";
import { toStyleCode } from "@apps/shared/utils/swimStyles";
import {
  buildPracticeMenuGroups,
  type MemberTimesRow,
  type PracticeMenuGroup,
  type PracticeTimesDetail,
} from "@apps/shared/utils/teamPracticeTimes";
import { useTranslations } from "next-intl";
import { TEAM_VIEW_QUERY_OPTIONS, teamDetailKeys } from "@/hooks/queries/teamDetailKeys";
import { fetchTeamPracticeDetail } from "@/hooks/queries/teamPracticeQueries";

const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
};

/** サークル (秒) を 1'30" の形にする */
function formatCircle(circle: number | null): string | null {
  if (!circle) return null;
  return `${Math.floor(circle / 60)}'${Math.floor(circle % 60)
    .toString()
    .padStart(2, "0")}"`;
}

interface TeamPracticeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  practiceId: string;
  /** 見出し (日付 + 練習名)。末尾に「のタイム」を付けて表示する */
  heading: string;
}

/**
 * 1 本ずつのタイムを 4 列のグリッドで並べる。5 本目からは次の行に折り返す。
 * その人の最速タイムは青い太字にする (入力が 2 本以上あるときだけ。1 本だけだと比べる相手がいない)。
 */
function TimesGrid({
  times,
  fastest,
  highlight,
}: {
  times: (number | null)[];
  fastest: number | null;
  highlight: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {times.map((time, index) => {
        const isFastest = highlight && time !== null && time === fastest;
        return (
          // 本数とセットの中の位置は固定なので index をキーにしてよい
          <div
            key={index}
            className={`rounded-md bg-gray-100 py-1.5 text-center text-sm tabular-nums ${
              isFastest ? "font-bold text-blue-600" : "text-gray-900"
            }`}
            data-fastest={isFastest ? "true" : undefined}
          >
            {time === null ? "-" : formatTime(time)}
          </div>
        );
      })}
    </div>
  );
}

function MemberRow({
  member,
  setCount,
  isSelf,
}: {
  member: MemberTimesRow;
  setCount: number;
  isSelf: boolean;
}) {
  const t = useTranslations("teams.practiceTimes");
  const [open, setOpen] = useState(false);
  const hasTimes = member.average !== null;
  const highlightFastest = member.recordedCount >= 2;

  const subParts: string[] = [];
  if (!hasTimes) {
    subParts.push(t("noTime"));
  } else {
    if (member.fastest !== null) {
      subParts.push(t("fastest", { time: formatTime(member.fastest) }));
    }
    if (member.recordedCount < member.totalCount) {
      subParts.push(
        t("recordedCount", { recorded: member.recordedCount, total: member.totalCount }),
      );
    }
  }

  const averageText = member.average === null ? "-" : formatTimeAverage(member.average);

  const mainContent = (
    <>
      <Avatar avatarUrl={member.avatarPath} userName={member.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-900">{member.name}</div>
        {subParts.length > 0 && (
          <div className="truncate text-xs text-gray-400">{subParts.join(" · ")}</div>
        )}
      </div>
      <div className="text-right">
        {hasTimes && <div className="text-[10px] leading-none text-gray-400">{t("averageLabel")}</div>}
        <div
          className={`tabular-nums ${
            hasTimes ? "text-sm font-bold text-gray-900" : "text-sm text-gray-400"
          }`}
        >
          {averageText}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`border-t border-emerald-50 first:border-t-0 ${isSelf ? "bg-blue-50" : ""}`}
      data-testid={`practice-times-row-${member.logId}`}
    >
      {hasTimes ? (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label={t("rowAria", { name: member.name, time: averageText })}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {mainContent}
          {open ? (
            <ChevronUpIcon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">
          {mainContent}
          {/* 開ける行と平均の列を揃えるため、矢印と同じ幅だけ空ける */}
          <span className="w-4 shrink-0" />
        </div>
      )}

      {open && hasTimes && (
        <div className="space-y-2.5 px-3 pb-3">
          {member.sets.map((set) => (
            <div key={set.setNumber} className="space-y-1">
              {setCount > 1 && (
                <div className="flex items-center justify-between px-0.5 text-xs text-emerald-800">
                  <span className="font-semibold">{t("setLabel", { set: set.setNumber })}</span>
                  {set.average !== null && (
                    <span className="tabular-nums">
                      {t("setAverage", { time: formatTimeAverage(set.average) })}
                    </span>
                  )}
                </div>
              )}
              <TimesGrid
                times={set.times}
                fastest={member.fastest}
                highlight={highlightFastest}
              />
            </div>
          ))}
          {member.note && (
            <div className="flex items-start gap-1.5 px-0.5 text-xs text-gray-600">
              <PencilSquareIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
              <span>{member.note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuGroupCard({
  group,
  currentUserId,
  getStyleLabel,
}: {
  group: PracticeMenuGroup;
  currentUserId: string | undefined;
  getStyleLabel: (style: string) => string;
}) {
  const t = useTranslations("teams.practiceTimes");
  const tUnits = useTranslations("common.units");

  const menuParts = [
    `${group.distance}m × ${group.repCount}${tUnits("reps")}` +
      (group.setCount > 1 ? ` × ${group.setCount}${tUnits("sets")}` : ""),
    formatCircle(group.circle),
    getStyleLabel(group.style),
    group.swimCategory && group.swimCategory !== "Swim" ? group.swimCategory : null,
  ].filter((part): part is string => !!part);

  return (
    <div className="space-y-2.5 rounded-lg bg-emerald-50 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 rounded-full bg-emerald-600" />
        <h4 className="flex-1 text-base font-semibold text-emerald-900">{menuParts.join("  ")}</h4>
        <span className="text-sm text-emerald-600">
          {t("memberCount", { count: group.members.length })}
        </span>
      </div>

      {group.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {group.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: tag.color, color: getTextColor(tag.color) }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-emerald-100 bg-white">
        {group.members.map((member) => (
          <MemberRow
            key={member.logId}
            member={member}
            setCount={group.setCount}
            isSelf={!!currentUserId && member.userId === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * チーム練習のタイム一覧モーダル (チームメンバーなら admin/非admin 問わず閲覧できる)。
 * mobile の TeamPracticeTimesModal と同じ見せ方で、メニューごとにメンバーを平均タイムの
 * 速い順に並べ、行を押すと 1 本ずつのタイムが開く。
 * メニューのまとめ方・並べ替えは packages/shared/utils/teamPracticeTimes.ts を mobile と共用する。
 */
export default function TeamPracticeDetailModal({
  isOpen,
  onClose,
  practiceId,
  heading,
}: TeamPracticeDetailModalProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("teams.practiceTimes");
  const tDetail = useTranslations("teams.practiceDetailModal");
  const tCommon = useTranslations("common");

  const swimStyles = useMemo(
    () => ({
      Fr: tDetail("swimStyles.Fr"),
      Ba: tDetail("swimStyles.Ba"),
      Br: tDetail("swimStyles.Br"),
      Fly: tDetail("swimStyles.Fly"),
      IM: tDetail("swimStyles.IM"),
    }),
    [tDetail],
  );

  // practice_logs.style は CHECK 制約の無い自由記述列で legacy な小文字行が混在し得るため、
  // toStyleCode() で正規化してから Record を引く(生の "fr" のまま引くとキーが無く
  // 翻訳されない生文字列がそのまま表示される)。
  const getStyleLabel = (styleValue: string): string => {
    const code = toStyleCode(styleValue);
    return (code && (swimStyles as Record<string, string>)[code]) || styleValue;
  };

  // 開くたびに再取得するが (staleTime 0)、前回開いたときの内容があれば先に表示する
  const practiceQuery = useQuery({
    queryKey: teamDetailKeys.practiceDetail(practiceId),
    queryFn: () =>
      fetchTeamPracticeDetail<PracticeTimesDetail>(supabase, practiceId, tDetail("dataNotFound")),
    enabled: isOpen,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });
  const practice = practiceQuery.data ?? null;
  // 読み込み表示 / エラーは表示できる内容が無いときだけ出す
  const loading = !practice && practiceQuery.isPending;
  const error = !practice && practiceQuery.isError ? t("loadError") : null;
  const fetchError = practiceQuery.error;
  useEffect(() => {
    if (fetchError) console.error("チーム練習タイムの取得エラー:", fetchError);
  }, [fetchError]);

  const unknownUser = t("unknownUser");
  const menuGroups = useMemo(
    () => buildPracticeMenuGroups(practice?.practice_logs ?? [], unknownUser),
    [practice, unknownUser],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${heading}${t("titleSuffix")}`}
          className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="truncate text-lg font-medium text-gray-900">
                {heading}
                {t("titleSuffix")}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label={tCommon("close")}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
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

            {practice && !loading && !error && (
              <>
                {/* 練習基本情報 */}
                {(practice.place || practice.note) && (
                  <div className="flex items-center gap-4 mb-4 flex-wrap text-sm text-gray-600">
                    {practice.place && (
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {practice.place}
                      </span>
                    )}
                    {practice.note && (
                      <span className="flex items-center gap-1">
                        <PencilSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {practice.note}
                      </span>
                    )}
                  </div>
                )}

                {/* ログなし */}
                {menuGroups.length === 0 && (
                  <div className="text-center py-8 text-gray-500">{t("empty")}</div>
                )}

                {/* メニューごとのセクション */}
                <div className="space-y-4">
                  {menuGroups.map((group) => (
                    <MenuGroupCard
                      key={group.key}
                      group={group}
                      currentUserId={user?.id}
                      getStyleLabel={getStyleLabel}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
