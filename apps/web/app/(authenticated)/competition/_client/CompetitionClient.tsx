"use client";

import React, { useState, useMemo, useTransition } from "react";
import dynamic from "next/dynamic";
import { TrophyIcon, PencilIcon, TrashIcon, ShareIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import BestTimeBadge from "@/components/ui/BestTimeBadge";
import Pagination from "@/components/ui/Pagination";
import type { RecordLogFormData } from "@/components/forms/record-log/types";

const RecordLogForm = dynamic(() => import("@/components/forms/RecordLogForm"), { ssr: false });

const ShareCardModal = dynamic(
  () =>
    import("@/components/share/ShareCardModal").then((mod) => ({ default: mod.ShareCardModal })),
  { ssr: false },
);
import type { CompetitionShareData } from "@/components/share";
import { format, isAfter, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import {
  useRecordsQuery,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useReplaceSplitTimesMutation,
} from "@apps/shared/hooks/queries/records";
import type { Record, Competition, Style } from "@apps/shared/types";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useCompetitionRecordStore } from "@/stores/form/competitionRecordStore";

interface CompetitionClientProps {
  styles: Style[];
}

/**
 * 大会記録ページのインタラクティブ部分を担当するClient Component
 * 記録データはHydrationBoundaryでReact Queryキャッシュに注入済み
 */
export default function CompetitionClient({ styles }: CompetitionClientProps) {
  const { supabase } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [showShareModal, setShowShareModal] = useState(false);
  const [_isPending, startTransition] = useTransition();

  // Zustandストア
  const {
    filterStyle,
    includeRelay,
    filterPoolType,
    filterFiscalYear,
    setFilterStyle,
    setIncludeRelay,
    setFilterPoolType,
    setFilterFiscalYear,
  } = useCompetitionStore();

  // フィルター変更ハンドラー（useTransitionでUI応答性を維持 + ページリセット）
  const handleFilterStyleChange = (value: string) => {
    startTransition(() => {
      setFilterStyle(value);
      setCurrentPage(1);
    });
  };
  const handleIncludeRelayChange = (value: boolean) => {
    startTransition(() => {
      setIncludeRelay(value);
      setCurrentPage(1);
    });
  };
  const handleFilterPoolTypeChange = (value: string) => {
    startTransition(() => {
      setFilterPoolType(value);
      setCurrentPage(1);
    });
  };
  const handleFilterFiscalYearChange = (value: string) => {
    startTransition(() => {
      setFilterFiscalYear(value);
      setCurrentPage(1);
    });
  };

  const {
    isFormOpen,
    editingData,
    selectedRecord,
    showDetailModal,
    openForm,
    closeForm,
    openDetailModal,
    closeDetailModal,
    setStyles,
  } = useCompetitionRecordStore();

  // サーバー側から取得したデータをストアに設定（初回のみ）
  const initializedRef = React.useRef(false);
  if (!initializedRef.current) {
    setStyles(styles);
    initializedRef.current = true;
  }

  // 大会記録を取得（HydrationBoundaryで注入済みキャッシュから取得 + リアルタイム更新）
  const {
    records = [],
    isLoading: loading,
    error,
    refetch: _refetch,
  } = useRecordsQuery(supabase, {});

  // ミューテーションフック
  const updateRecordMutation = useUpdateRecordMutation(supabase);
  const deleteRecordMutation = useDeleteRecordMutation(supabase);
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase);

  // サーバー側で取得した初期データとリアルタイム更新されたデータを統合
  // React Queryのキャッシュを使用
  const displayRecords = records;

  // 今日の日付（時刻を0時0分0秒にリセット）
  const today = startOfDay(new Date());

  // 出場したことのある種目IDを抽出（ユニーク）
  const participatedStyleIds = useMemo(() => {
    const styleIds = new Set<number>();
    displayRecords.forEach((record: Record) => {
      if (record.style_id) {
        styleIds.add(record.style_id);
      }
    });
    return Array.from(styleIds);
  }, [displayRecords]);

  // 出場したことのある種目だけをフィルタリング
  const participatedStyles = useMemo(() => {
    return styles.filter((style: Style) => participatedStyleIds.includes(style.id));
  }, [styles, participatedStyleIds]);

  // 年度を取得する関数（4月1日〜3月31日が1年度）
  const getFiscalYear = (date: Date): number => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    if (month >= 4) {
      return year; // 4月以降はその年が年度
    } else {
      return year - 1; // 1-3月は前年が年度
    }
  };

  // 出場したことのある年度を抽出（ユニーク）
  const participatedFiscalYears = useMemo(() => {
    const years = new Set<number>();
    displayRecords.forEach((record: Record) => {
      const competition = record.competition as Competition;
      if (competition?.date) {
        const fiscalYear = getFiscalYear(new Date(competition.date));
        years.add(fiscalYear);
      }
    });
    return Array.from(years).sort((a, b) => b - a); // 降順でソート
  }, [displayRecords]);

  // フィルタリングロジック
  const filteredRecords = displayRecords.filter((record: Record) => {
    // 日付フィルタリング：今日より未来の日付は除外
    const competition = record.competition as Competition;
    if (competition?.date) {
      const competitionDate = startOfDay(new Date(competition.date));
      if (isAfter(competitionDate, today)) {
        return false;
      }
    }

    // 年度フィルタ
    if (filterFiscalYear) {
      const competition = record.competition as Competition;
      if (competition?.date) {
        const fiscalYear = getFiscalYear(new Date(competition.date));
        const filterYear = parseInt(filterFiscalYear);
        if (fiscalYear !== filterYear) {
          return false;
        }
      } else {
        return false; // 日付がない場合は除外
      }
    }

    // 種目フィルタ
    if (filterStyle) {
      const recordStyleId = record.style_id;
      const filterStyleId = parseInt(filterStyle);

      if (recordStyleId !== filterStyleId) {
        return false;
      }
    }

    // リレーフィルタ
    if (!includeRelay && record.is_relaying) {
      return false;
    }

    // プール種別フィルタ（records.pool_type を使用）
    if (filterPoolType === "long" && record.pool_type !== 1) {
      return false;
    }
    if (filterPoolType === "short" && record.pool_type !== 0) {
      return false;
    }

    return true;
  });

  // 日付の降順でソート
  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const dateA = new Date(a.competition?.date || a.created_at);
      const dateB = new Date(b.competition?.date || b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredRecords]);

  // ページング適用
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedRecords.slice(startIndex, endIndex);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedRecords.length / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // ページトップにスクロール
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEditRecord = async (record: Record) => {
    openForm(record);
  };

  const handleViewRecord = (record: Record) => {
    openDetailModal(record);
  };

  // React Query mutation状態から派生（手動のsetLoadingは不要）
  const isAnyMutating =
    updateRecordMutation.isPending ||
    deleteRecordMutation.isPending ||
    replaceSplitTimesMutation.isPending;

  const handleDeleteRecord = async (recordId: string) => {
    if (confirm("この大会記録を削除しますか？")) {
      try {
        await deleteRecordMutation.mutateAsync(recordId);
      } catch (error) {
        console.error("削除エラー:", error);
      }
    }
  };

  const handleRecordSubmit = async (dataList: RecordLogFormData[]) => {
    try {
      // /competitionページは編集のみなので、常にeditingDataからcompetitionIdを取得
      let competitionId: string | null = null;
      if (editingData && typeof editingData === "object" && editingData !== null) {
        if ("competition_id" in editingData && typeof editingData.competition_id === "string") {
          competitionId = editingData.competition_id;
        } else if (
          "competitionId" in editingData &&
          typeof editingData.competitionId === "string"
        ) {
          competitionId = editingData.competitionId;
        }
      }

      if (!competitionId) {
        throw new Error("Competition ID が見つかりません");
      }

      // 配列の最初の要素を処理（編集モードでは通常1つの記録のみ）
      const formData = dataList[0];
      if (!formData) {
        throw new Error("記録データが見つかりません");
      }

      const recordInput = {
        style_id: parseInt(formData.styleId),
        time: formData.time,
        video_path: formData.videoPath || null,
        note: formData.note || null,
        is_relaying: formData.isRelaying || false,
        competition_id: competitionId || null,
        reaction_time:
          formData.reactionTime && formData.reactionTime.trim() !== ""
            ? parseFloat(formData.reactionTime)
            : null,
      };

      if (editingData && editingData.id) {
        // 更新処理
        await updateRecordMutation.mutateAsync({
          id: editingData.id,
          updates: recordInput,
        });

        // スプリットタイム更新（空配列でも常に呼び出して既存のスプリットタイムを削除可能にする）
        const splitTimesData = (formData.splitTimes || []).map((st) => ({
          distance: st.distance,
          split_time: st.splitTime,
        }));

        await replaceSplitTimesMutation.mutateAsync({
          recordId: editingData.id,
          splitTimes: splitTimesData,
        });
      }

      closeForm();
    } catch (error) {
      console.error("大会記録の保存に失敗しました:", error);
    }
  };

  if (loading || isAnyMutating) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">大会記録</h1>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const errorMessage =
    error?.message ||
    updateRecordMutation.error?.message ||
    deleteRecordMutation.error?.message ||
    replaceSplitTimesMutation.error?.message;

  if (errorMessage && !loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">大会記録</h1>
          <div className="text-red-600">エラーが発生しました: {errorMessage}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">大会記録</h1>
            <p className="text-gray-600">大会での記録を管理・分析します。</p>
          </div>
        </div>
      </div>

      {/* フィルタリングセクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* 期間フィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">期間</label>
            <select
              value={filterFiscalYear}
              onChange={(e) => handleFilterFiscalYearChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべての期間</option>
              {participatedFiscalYears.map((year) => (
                <option key={year} value={year.toString()}>
                  {year}年度
                </option>
              ))}
            </select>
          </div>

          {/* 種目フィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">種目</label>
            <select
              value={filterStyle}
              onChange={(e) => handleFilterStyleChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべての種目</option>
              {participatedStyles.map((style: Style) => (
                <option key={style.id} value={style.id}>
                  {style.name_jp}
                </option>
              ))}
            </select>
          </div>

          {/* プール種別フィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">プール種別</label>
            <select
              value={filterPoolType}
              onChange={(e) => handleFilterPoolTypeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              <option value="short">短水路(25m)</option>
              <option value="long">長水路(50m)</option>
            </select>
          </div>

          {/* リレーフィルタ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">引き継ぎ記録</label>
            <div className="flex items-center h-10">
              <input
                type="checkbox"
                id="includeRelay"
                checked={includeRelay}
                onChange={(e) => handleIncludeRelayChange(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="includeRelay" className="ml-2 text-sm text-gray-700">
                引き継ぎ記録を含める
              </label>
            </div>
          </div>

          {/* クリアボタン */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">クリア</label>
            <Button
              variant="outline"
              onClick={() => {
                startTransition(() => {
                  setFilterStyle("");
                  setIncludeRelay(true);
                  setFilterPoolType("");
                  setFilterFiscalYear("");
                  setCurrentPage(1);
                });
              }}
              className="w-full text-sm"
            >
              フィルタをリセット
            </Button>
          </div>
        </div>
      </div>

      {/* 大会記録一覧（表形式） */}
      <div className="bg-white rounded-lg shadow">
        {displayRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">大会記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">最初の大会記録を作成しましょう。</p>
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">該当する記録がありません</h3>
            <p className="mt-1 text-sm text-gray-500">
              選択した条件に一致する大会記録が見つかりませんでした。
            </p>
            <div className="mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  startTransition(() => {
                    setFilterStyle("");
                    setIncludeRelay(true);
                    setFilterPoolType("");
                    setFilterFiscalYear("");
                    setCurrentPage(1);
                  });
                }}
                className="text-sm"
              >
                フィルタをリセット
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      大会名
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      種目
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      記録
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      プール
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedRecords.map((record: Record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleViewRecord(record)}
                      tabIndex={0}
                      role="button"
                      aria-label="大会記録詳細を表示"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleViewRecord(record);
                        }
                      }}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(record.competition as Competition)?.date
                          ? format(new Date((record.competition as Competition).date), "MM/dd", {
                              locale: ja,
                            })
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(record.competition as Competition)?.title || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(record.competition as Competition)?.place || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(record.style as Style)?.name_jp || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.time ? (
                          <>
                            {formatTimeBest(record.time)}
                            {record.is_relaying && (
                              <span className="font-bold text-red-600 ml-1">R</span>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {record.pool_type === 1
                          ? "長水路"
                          : record.pool_type === 0
                            ? "短水路"
                            : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditRecord(record);
                            }}
                            className="flex items-center space-x-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            <span>編集</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRecord(record.id);
                            }}
                            disabled={isAnyMutating}
                            className="flex items-center space-x-1 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <TrashIcon className="h-4 w-4" />
                            <span>{deleteRecordMutation.isPending ? "削除中..." : "削除"}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ページング */}
        {sortedRecords.length > pageSize && (
          <div className="mt-4 pt-4 px-5 sm:px-6 pb-6 border-t border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sortedRecords.length}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* フォームモーダル */}
      <RecordLogForm
        isOpen={isFormOpen}
        onClose={() => {
          closeForm();
        }}
        onSubmit={handleRecordSubmit}
        competitionId={
          editingData && typeof editingData === "object" && "competition_id" in editingData
            ? (editingData.competition_id as string | null) || ""
            : editingData && typeof editingData === "object" && "competitionId" in editingData
              ? (editingData.competitionId as string | null | undefined) || ""
              : ""
        }
        editData={
          editingData && typeof editingData === "object" && "style_id" in editingData
            ? {
                id: editingData.id,
                styleId: editingData.style_id,
                time: editingData.time,
                isRelaying: editingData.is_relaying,
                splitTimes: editingData.split_times?.map((st) => ({
                  distance: st.distance,
                  splitTime: st.split_time,
                })),
                note: editingData.note ?? undefined,
                videoPath: editingData.video_path ?? undefined,
              }
            : null
        }
        isLoading={isAnyMutating}
        styles={styles.map((style) => ({
          id: style.id.toString(),
          nameJp: style.name_jp,
          distance: style.distance,
        }))}
      />

      {/* 詳細モーダル */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-70 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => {
                closeDetailModal();
              }}
            ></div>

            {/* モーダルコンテンツ */}
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              {/* ヘッダー */}
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">大会記録詳細</h3>
                  <button
                    onClick={() => {
                      closeDetailModal();
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {/* 大会記録セクション */}
                <div className="mb-6">
                  <h4 className="text-md font-semibold text-blue-700 mb-3 flex items-center">
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録
                  </h4>
                  <div className="space-y-3">
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900 mb-2">
                          {selectedRecord.style?.name_jp || "記録"}:{" "}
                          {selectedRecord.time ? (
                            <>
                              {formatTimeBest(selectedRecord.time)}
                              {selectedRecord.is_relaying && (
                                <span className="font-bold text-red-600 ml-1">R</span>
                              )}
                            </>
                          ) : (
                            "-"
                          )}
                        </h5>
                        {selectedRecord.competition && (
                          <p className="text-sm text-gray-600 mb-1">
                            🏆 {selectedRecord.competition.title || "大会"}
                          </p>
                        )}
                        {selectedRecord.competition?.place && (
                          <p className="text-sm text-gray-600 mb-1">
                            📍 {selectedRecord.competition.place}
                          </p>
                        )}
                        {selectedRecord.pool_type != null && (
                          <p className="text-sm text-gray-600 mb-1">
                            🏊‍♀️ {selectedRecord.pool_type === 1 ? "長水路(50m)" : "短水路(25m)"}
                          </p>
                        )}
                        {selectedRecord.time && (
                          <div className="flex items-center gap-2 mb-1">
                            <div className="relative text-lg font-semibold text-blue-700 pr-20">
                              <span className="inline-block">
                                ⏱️ {formatTimeBest(selectedRecord.time)}
                                {selectedRecord.is_relaying && (
                                  <span className="font-bold text-red-600 ml-1">R</span>
                                )}
                              </span>
                              {selectedRecord.reaction_time != null &&
                                typeof selectedRecord.reaction_time === "number" && (
                                  <span
                                    className="absolute -bottom-0.5 right-0 text-[10px] text-gray-500 font-normal whitespace-nowrap"
                                    data-testid="record-reaction-time-display"
                                  >
                                    R.T {selectedRecord.reaction_time.toFixed(2)}
                                  </span>
                                )}
                            </div>
                            <BestTimeBadge
                              recordId={selectedRecord.id}
                              styleId={selectedRecord.style_id}
                              currentTime={selectedRecord.time}
                              recordDate={selectedRecord.competition?.date}
                              poolType={selectedRecord.pool_type}
                              isRelaying={selectedRecord.is_relaying}
                            />
                          </div>
                        )}
                        {selectedRecord.note && (
                          <p className="text-sm text-gray-600 mt-2">💭 {selectedRecord.note}</p>
                        )}

                        {/* 距離別Lap表示 */}
                        {selectedRecord.split_times && selectedRecord.split_times.length > 0 && (
                          <div className="mt-3">
                            <LapTimeDisplay
                              splitTimes={(() => {
                                const baseSplits = selectedRecord.split_times.map((st) => ({
                                  distance: st.distance,
                                  splitTime: st.split_time,
                                }));
                                const raceDistance = selectedRecord.style?.distance;
                                const recordTime = selectedRecord.time;
                                if (raceDistance && recordTime && recordTime > 0) {
                                  const hasGoalSplit = baseSplits.some(
                                    (st) => st.distance === raceDistance,
                                  );
                                  if (!hasGoalSplit) {
                                    return [
                                      ...baseSplits,
                                      { distance: raceDistance, splitTime: recordTime },
                                    ];
                                  }
                                }
                                return baseSplits;
                              })()}
                              raceDistance={selectedRecord.style?.distance}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* フッター */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-2">
                <button
                  type="button"
                  className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-800 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
                  onClick={() => setShowShareModal(true)}
                >
                  <ShareIcon className="h-4 w-4 mr-2" />
                  シェア
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={() => {
                    closeDetailModal();
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* シェアカードモーダル */}
      {showShareModal && selectedRecord && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          type="competition"
          data={
            {
              competitionName: selectedRecord.competition?.title || "大会",
              date: selectedRecord.competition?.date
                ? format(new Date(selectedRecord.competition.date), "yyyy年M月d日", { locale: ja })
                : "",
              place: selectedRecord.competition?.place || "",
              poolType: selectedRecord.pool_type === 1 ? "long" : "short",
              eventName: selectedRecord.style?.name_jp || "",
              raceDistance: selectedRecord.style?.distance || 0,
              time: selectedRecord.time,
              reactionTime: selectedRecord.reaction_time ?? undefined,
              splitTimes: selectedRecord.split_times,
              isBestTime: false, // TODO: ベストタイム判定を追加
              userName: "", // TODO: ユーザー名を取得
              teamName: undefined,
            } as CompetitionShareData
          }
        />
      )}
    </div>
  );
}
