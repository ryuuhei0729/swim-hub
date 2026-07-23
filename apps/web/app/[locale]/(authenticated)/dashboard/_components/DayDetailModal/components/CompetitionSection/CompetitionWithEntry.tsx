"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  PencilIcon,
  TrashIcon,
  MapPinIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import { EntryAPI } from "@swim-hub/shared/api/entries";
import { useRouter } from "next/navigation";
import ImageGallery, { GalleryImage } from "@/components/ui/ImageGallery";
import { resolveGalleryImages } from "@/lib/image-url";
import type { CompetitionWithEntryProps, CompetitionEntryDisplay } from "../../types";
import { hexToRgba, mixWithWhite, CALENDAR_COLOR_ALPHA } from "@apps/shared/utils/colorAlpha";
import { DEFAULT_COMPETITION_COLOR } from "@apps/shared/utils/calendarColorResolver";

// 色の明度に基づいてテキスト色を決定する関数(PracticeDetails.tsx/CompetitionDetails.tsx と同一アルゴリズム)
const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#FFFFFF";
};

export function CompetitionWithEntry({
  entryId: _entryId,
  competitionId,
  competitionName,
  place,
  note,
  styleId,
  styleName,
  entryTime,
  isTeamCompetition = false,
  deletedEntryIds,
  onAddRecord,
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onClose,
  color,
}: CompetitionWithEntryProps) {
  const router = useRouter();
  const { supabase } = useAuth();
  const t = useTranslations("dashboard");
  const wrapperColor = color ?? DEFAULT_COMPETITION_COLOR;
  // 未カスタマイズ(デフォルト色のまま)なら旧 Tailwind クラスをそのまま使い、
  // 既存ユーザーの見た目をピクセル一致で維持する。カスタム色時のみ動的着色する(C2/C5対応)。
  const isDefaultColor = wrapperColor === DEFAULT_COMPETITION_COLOR;
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>([]);
  const [entries, setEntries] = useState<CompetitionEntryDisplay[]>(() => {
    if (styleId && styleName) {
      return [
        {
          id: _entryId,
          styleId,
          styleName,
          entryTime,
          note,
        },
      ];
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [entryStatus, setEntryStatus] = useState<"before" | "open" | "closed" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchEntryData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setLoading(false);
          setAuthError(t("entry.authRequired"));
          router.replace("/login");
          return;
        }

        // competitionのentry_statusとimage_pathsを取得
        const { data: competitionData, error: competitionError } = await supabase
          .from("competitions")
          .select("entry_status, image_paths")
          .eq("id", competitionId)
          .single();

        if (cancelled) return;
        if (!competitionError && competitionData) {
          setEntryStatus(competitionData.entry_status || "before");

          // 画像の署名URL解決は本文表示をブロックしない（fire-and-forget）
          const imagePaths = (competitionData as { image_paths?: string[] }).image_paths || [];
          resolveGalleryImages("competition-images", imagePaths).then(
            (images: GalleryImage[]) => {
              if (cancelled) return;
              setCompetitionImages(images);
            },
          );
        }

        // EntryAPIを使用してエントリーを取得
        const allEntries = await entryApi.getEntriesByCompetition(competitionId);

        // 現在のユーザーのエントリーのみをフィルタリング
        const userEntries = allEntries.filter((entry) => entry.user_id === user.id);

        if (cancelled) return;
        if (userEntries && userEntries.length > 0) {
          const mapped = userEntries.map((entry) => {
            const style = entry.style;
            return {
              id: entry.id,
              styleId: entry.style_id,
              styleName: style?.name_jp || "",
              entryTime: entry.entry_time,
              note: entry.note,
            } as CompetitionEntryDisplay;
          });
          setEntries(mapped);
        } else if (entries.length === 0 && styleId && styleName) {
          setEntries([
            {
              id: _entryId,
              styleId,
              styleName,
              entryTime,
              note,
            },
          ]);
        }
      } catch (err) {
        console.error("エントリーデータの取得エラー:", err);
        if (!cancelled) setCompetitionImages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEntryData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, entryApi, deletedEntryIds?.length]);

  const entryInfoList = entries.map((entry) => ({
    styleId: entry.styleId,
    styleName: entry.styleName,
    entryTime: entry.entryTime ?? undefined,
  }));

  const handleAddRecordClick = () => {
    if (!onAddRecord) return;

    if (entryInfoList.length > 0) {
      onAddRecord({
        competitionId,
        entryDataList: entryInfoList,
      });
      onClose?.();
    } else {
      onAddRecord({ competitionId });
    }
  };

  const handleEditEntryClick = async () => {
    if (!onEditEntry) return;

    // チームcompetitionの場合、entry_statusをチェック
    if (isTeamCompetition) {
      // entry_statusがまだ取得されていない場合は取得
      if (entryStatus === null) {
        try {
          const { data: competitionData, error: competitionError } = await supabase
            .from("competitions")
            .select("entry_status")
            .eq("id", competitionId)
            .single();

          if (!competitionError && competitionData) {
            const status = competitionData.entry_status || "before";
            setEntryStatus(status);

            // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
            if (status !== "open") {
              const statusLabel = status === "before" ? t("entry.statusBefore") : t("entry.statusClosed");
              window.alert(t("entry.statusAlert", { status: statusLabel }));

              // record入力モーダルに遷移
              if (onAddRecord) {
                handleAddRecordClick();
              }
              return;
            }
          }
        } catch (err) {
          console.error("エントリーステータスの取得エラー:", err);
        }
      } else if (entryStatus !== "open") {
        // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
        const statusLabel = entryStatus === "before" ? t("entry.statusBefore") : t("entry.statusClosed");
        window.alert(t("entry.statusAlert", { status: statusLabel }));

        // record入力モーダルに遷移
        if (onAddRecord) {
          handleAddRecordClick();
        }
        return;
      }
    }

    if (entries.length === 0) {
      onEditEntry();
      return;
    }

    onEditEntry();
  };

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden ${isDefaultColor ? "border-blue-200" : ""}`}
      style={
        isDefaultColor
          ? undefined
          : { borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER) }
      }
    >
      {/* 大会情報ヘッダー */}
      <div
        className={`px-4 py-3 border-b ${isDefaultColor ? "bg-blue-50 border-blue-200" : ""}`}
        style={
          isDefaultColor
            ? undefined
            : {
                backgroundColor: mixWithWhite(
                  wrapperColor,
                  CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND,
                ),
                borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER),
              }
        }
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-gray-900" data-testid="competition-title-display">
              {competitionName || t("competition.defaultName")}
            </h5>
            {isTeamCompetition && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                チーム
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onEditCompetition && (
              <button
                onClick={() => onEditCompetition(competitionImages)}
                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title={t("entry.editCompetition")}
                data-testid="edit-competition-button"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
            {onDeleteCompetition && (
              <button
                onClick={onDeleteCompetition}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title={t("entry.deleteCompetition")}
                data-testid="delete-competition-button"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        {place && (
          <p
            className="text-sm text-gray-600 mt-1 flex items-center gap-1"
            data-testid="competition-place-display"
          >
            <MapPinIcon className="h-4 w-4 text-gray-400 shrink-0" aria-hidden="true" />
            {place}
          </p>
        )}
        {authError && (
          <p className="text-sm text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
            {authError}
          </p>
        )}
      </div>

      {/* エントリー情報ボックス */}
      <div className="p-2 sm:p-4">
        <div
          className={`border rounded-lg p-2 sm:p-4 mb-2 sm:mb-3 ${
            isDefaultColor ? "bg-orange-50 border-orange-200" : ""
          }`}
          style={
            isDefaultColor
              ? undefined
              : {
                  backgroundColor: mixWithWhite(
                    wrapperColor,
                    CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND,
                  ),
                  borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER),
                }
          }
          data-testid="entry-section"
        >
          <div className="flex items-center justify-between mb-1.5 sm:mb-3">
            <div className="flex items-center gap-1 sm:gap-2">
              <ClipboardDocumentListIcon
                className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${isDefaultColor ? "text-orange-700" : ""}`}
                style={isDefaultColor ? undefined : { color: wrapperColor }}
                aria-hidden="true"
              />
              <h6
                className={`text-xs sm:text-sm font-semibold ${isDefaultColor ? "text-orange-900" : ""}`}
                style={isDefaultColor ? undefined : { color: getTextColor(wrapperColor) }}
              >
                <span className="sm:hidden">{t("entry.entered")}</span>
                <span className="hidden sm:inline">{t("entry.enteredNoRecord")}</span>
              </h6>
            </div>
            <div className="flex items-center gap-1">
              {onEditEntry && (
                <button
                  onClick={handleEditEntryClick}
                  className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  title={t("entry.editEntry")}
                  data-testid="edit-entry-button"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-3 text-xs sm:text-sm">
            {loading ? (
              <p className="text-gray-500">{t("entry.loading")}</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-500">{t("entry.notFound")}</p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex flex-col gap-0.5 sm:gap-1 rounded-md border bg-white/70 px-2 sm:px-3 py-1.5 sm:py-2 shadow-sm ${
                    isDefaultColor ? "border-orange-200" : ""
                  }`}
                  style={
                    isDefaultColor
                      ? undefined
                      : { borderColor: hexToRgba(wrapperColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER) }
                  }
                  data-testid={`entry-summary-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-1 sm:gap-2">
                    <div>
                      <div className="flex items-baseline gap-1 sm:gap-2">
                        <span
                          className={`font-semibold min-w-[40px] sm:min-w-[72px] ${
                            isDefaultColor ? "text-orange-900" : ""
                          }`}
                          style={isDefaultColor ? undefined : { color: getTextColor(wrapperColor) }}
                        >
                          {t("entry.styleLabel")}
                        </span>
                        <span className="text-gray-900 font-medium">{entry.styleName}</span>
                      </div>
                      {entry.entryTime && entry.entryTime > 0 && (
                        <div className="flex items-baseline gap-1 sm:gap-2">
                          <span
                            className={`font-semibold min-w-[40px] sm:min-w-[72px] ${
                              isDefaultColor ? "text-orange-900" : ""
                            }`}
                            style={isDefaultColor ? undefined : { color: getTextColor(wrapperColor) }}
                          >
                            <span className="sm:hidden">{t("entry.entryLabel")}</span>
                            <span className="hidden sm:inline">{t("entry.entryTimeLabel")}</span>
                          </span>
                          <span className="text-gray-900 font-mono font-semibold">
                            {formatTimeBest(entry.entryTime)}
                          </span>
                        </div>
                      )}
                      {entry.note && entry.note.trim().length > 0 && (
                        <div className="flex items-baseline gap-1 sm:gap-2">
                          <span
                            className={`font-semibold min-w-[40px] sm:min-w-[72px] ${
                              isDefaultColor ? "text-orange-900" : ""
                            }`}
                            style={isDefaultColor ? undefined : { color: getTextColor(wrapperColor) }}
                          >
                            {t("entry.memoLabel")}
                          </span>
                          <span className="text-gray-700">{entry.note}</span>
                        </div>
                      )}
                    </div>
                    {onDeleteEntry && (
                      <button
                        onClick={() => onDeleteEntry(entry.id)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title={t("entry.deleteEntry")}
                        data-testid={`delete-entry-button-${entry.id}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* メモ */}
        {note && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">
            <p className="font-medium text-gray-700 mb-1">{t("entry.memoSection")}</p>
            <p className="text-gray-600">{note}</p>
          </div>
        )}

        {/* 記録追加ボタン */}
        <button
          onClick={handleAddRecordClick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium text-xs sm:text-base"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>{t("entry.addRecord")}</span>
        </button>

        {/* 添付画像 */}
        {competitionImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ImageGallery images={competitionImages} />
          </div>
        )}
      </div>
    </div>
  );
}
