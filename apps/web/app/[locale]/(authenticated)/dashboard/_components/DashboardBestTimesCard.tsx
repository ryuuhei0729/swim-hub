"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { CheckCircleIcon, DocumentArrowUpIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import BestTimesTable, { type BestTimesTableEdit } from "@/components/profile/BestTimesTable";
import BestTimeInputGrid from "@/components/best-time-input/BestTimeInputGrid";
import { useBestTimeBulkInput } from "@/components/best-time-input/useBestTimeBulkInput";
import { useLeaveGuard } from "@/components/best-time-input/useLeaveGuard";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/** 登録できたことを知らせる表示を出しておく時間 */
const SUCCESS_MESSAGE_MS = 4000;

/**
 * ダッシュボードのベストタイム欄。
 * 2026-11-07 にマイページから見出し・一括入力・表をそのまま移した (マイページからは削除)。
 * 2026-11-09 に「次の大会」と横並びにしたので、見出し・余白・表を詰め、見出しと一括入力を表の上下の段に入れた (ユーザー指定)。
 * 2026-11-11 に一括入力ページ (/bulk-besttime) をやめ、「一括入力」を押すとこの表がそのまま
 * 入力モードに変わるようにした (mobile と同じ仕様)。
 */
export default function DashboardBestTimesCard() {
  const { supabase, user } = useAuth();
  const t = useTranslations("mypage");
  const tEdit = useTranslations("mypage.bestTimesTable.edit");
  const tBulk = useTranslations("bulkBestTime");
  const tDashboard = useTranslations("dashboard.bestTimes");
  const { data: bestTimes = [], isLoading, isError } = useBestTimesQuery(supabase, {
    userId: user?.id,
  });
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  // 年齢別ポイント比較用の区分。生の birthday はテーブルコンポーネントへ渡さない
  // (必要なのは区分だけ。生年月日は gender より機微度が高い)
  const ageCategory = useMemo(() => resolveAgeCategory(profile?.birthday), [profile?.birthday]);

  const bulk = useBestTimeBulkInput();
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // 破棄の確認。proceed は「破棄する」を選んだ後に続ける操作 (別ページへの移動など)
  const [discardPrompt, setDiscardPrompt] = useState<{ proceed?: () => void } | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const exitEditing = useCallback(() => {
    bulk.reset();
    setIsEditing(false);
  }, [bulk]);

  const handleCancel = () => {
    if (bulk.enteredCount === 0) {
      exitEditing();
      return;
    }
    setDiscardPrompt({});
  };

  // 入力が残ったまま別のページへ移ろうとしたら、破棄してよいか確かめる
  useLeaveGuard(isEditing && bulk.enteredCount > 0, (proceed) => setDiscardPrompt({ proceed }));

  const handleConfirmDiscard = () => {
    const proceed = discardPrompt?.proceed;
    setDiscardPrompt(null);
    exitEditing();
    proceed?.();
  };

  const handleSave = async () => {
    const created = await bulk.save();
    if (created === null) return;
    setSuccessMessage(tBulk("success.registered", { n: created }));
    exitEditing();
  };

  const title = (
    <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
      <TrophyIcon className="h-5 w-5 text-yellow-500" aria-hidden="true" />
      {t("bestTime.title")}
    </h2>
  );
  const bulkInputButton = (
    <button
      type="button"
      onClick={() => {
        setSuccessMessage(null);
        setIsEditing(true);
      }}
      disabled={isLoading}
      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
    >
      <DocumentArrowUpIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      {t("bulkInput")}
    </button>
  );

  const saveDisabled = bulk.records.length === 0 || bulk.saving;
  const edit: BestTimesTableEdit | undefined = isEditing
    ? {
        render: ({ poolType, isRelaying }) => (
          <>
            <BestTimeInputGrid
              key={`${poolType}_${isRelaying ? 1 : 0}`}
              bestTimes={bestTimes}
              poolType={poolType}
              isRelaying={isRelaying}
              inputs={bulk.inputs}
              onUpdateCell={bulk.updateCell}
              onClearCell={bulk.clearCell}
              disabled={bulk.saving}
            />
            {bulk.saveError && (
              <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {bulk.saveError}
              </p>
            )}
          </>
        ),
        footer: (
          <>
            <span className="text-xs text-gray-500">
              {tEdit("inputCount", { count: bulk.records.length })}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                data-testid="best-times-edit-cancel"
                onClick={handleCancel}
                disabled={bulk.saving}
                className="h-8 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {tEdit("cancel")}
              </button>
              <button
                type="button"
                data-testid="best-times-edit-save"
                onClick={handleSave}
                disabled={saveDisabled}
                className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {bulk.saving ? tBulk("button.registering") : tEdit("register", { count: bulk.records.length })}
              </button>
            </div>
          </>
        ),
      }
    : undefined;

  // 入力モード中は画面全体を暗くし、このカードだけを浮かせて目立たせる。
  // 暗い部分を押したらキャンセルと同じ (入力があれば破棄の確認、無ければそのまま入力モードを抜ける)。
  // 重なり順: ヘッダー z-40 / サイドバー z-50 < 暗幕 z-60 < このカード z-70 < 確認ダイアログ z-100
  const backdrop =
    isEditing && typeof document !== "undefined"
      ? createPortal(
          <button
            type="button"
            data-testid="best-times-edit-backdrop"
            aria-label={tEdit("exitByBackdrop")}
            onClick={handleCancel}
            className="fixed inset-0 z-[60] cursor-default bg-black/40"
          />,
          document.body,
        )
      : null;

  // 見出しは表の上の段 (水路の切り替え・引き継ぎと同じ行)、一括入力は表の下の段 (点数化の右) に出す
  // (2026-11-09 ユーザー指定)。表を出せない読み込み中・エラー時はここで並べる
  return (
    <section
      className={`bg-white rounded-lg shadow p-4 sm:p-5 ${isEditing ? "relative z-[70] ring-2 ring-blue-500" : ""}`}
      data-testid="dashboard-best-times"
    >
      {backdrop}
      {successMessage && (
        <p
          role="status"
          className="mb-3 flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
        >
          <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
          {successMessage}
        </p>
      )}
      {isLoading || (isError && !isEditing) ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            {title}
            {bulkInputButton}
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded bg-gray-100" aria-busy="true" />
          ) : (
            <p className="text-sm text-red-600">{tDashboard("loadError")}</p>
          )}
        </>
      ) : (
        <BestTimesTable
          bestTimes={bestTimes}
          gender={profile?.gender}
          ageCategory={ageCategory}
          title={title}
          footerAction={bulkInputButton}
          edit={edit}
        />
      )}

      <ConfirmDialog
        isOpen={discardPrompt !== null}
        title={tEdit("discardTitle")}
        message={tEdit("discardMessage", { count: bulk.enteredCount })}
        confirmLabel={tEdit("discardConfirm")}
        cancelLabel={tEdit("keepEditing")}
        variant="danger"
        // 押し間違いの Enter で入力が消えないよう、最初は「入力を続ける」にフォーカスを当てる
        initialFocus="cancel"
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardPrompt(null)}
      />
    </section>
  );
}
