"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  PlusCircleIcon,
  PencilSquareIcon,
  MinusCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import BaseModal from "@/components/ui/BaseModal";

export interface EntryBulkConfirmRow {
  /** 行の一意キー (localId または entries.id) */
  key: string;
  targetUserName: string;
  styleLabel: string;
  /** 変更前のエントリータイム表示 (分:秒.コンマ秒)。無ければ null */
  beforeDisplay: string | null;
  /** 変更後のエントリータイム表示。削除行では null */
  afterDisplay: string | null;
  /** 仕様#4: ベストタイムのまま未編集の行を⚠️で明示 */
  showUneditedBestTimeWarning: boolean;
}

interface EntryBulkConfirmModalProps {
  isOpen: boolean;
  /** mobile TeamEntryBulkFormScreen.tsx と同じ4セクション構造。
      diffEntryRows の結果を唯一の真実として、呼び出し側でここに分類する */
  newRows: EntryBulkConfirmRow[];
  updatedRows: EntryBulkConfirmRow[];
  deletedRows: EntryBulkConfirmRow[];
  unchangedRows: EntryBulkConfirmRow[];
  submitting: boolean;
  /** キャンセルしてもフォーム状態 (EntryDraftRow[]) は保持したままモーダルだけ閉じる */
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmRowItem({ row, deleted }: { row: EntryBulkConfirmRow; deleted?: boolean }) {
  const t = useTranslations("competition.entries.confirmModal");
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            deleted ? "text-red-600 line-through" : "text-gray-900"
          }`}
        >
          {row.targetUserName} — {row.styleLabel}
        </p>
        <p className="text-xs text-gray-500">
          {row.beforeDisplay !== null && row.afterDisplay !== null ? (
            <>
              {row.beforeDisplay} → {row.afterDisplay}
            </>
          ) : (
            row.afterDisplay ?? row.beforeDisplay ?? "-"
          )}
        </p>
        {row.showUneditedBestTimeWarning && (
          <p className="text-xs text-yellow-700 mt-0.5">{t("unedittedBestTimeWarning")}</p>
        )}
      </div>
    </div>
  );
}

/**
 * 保存前の差分確認モーダル (仕様#3: 新規/更新/削除/変更なしの4分類を一覧表示)。
 * mobile TeamEntryBulkFormScreen.tsx:786-896 と同じ4セクション構造に揃える
 * (承認済みモックアップ: 新規/更新/変更なし[折りたたみ]の3〜4セクション表示)。
 * 既存 ConfirmDialog は message: string の単発表示のみのため転用せず、BaseModal をベースに新規実装する。
 */
export default function EntryBulkConfirmModal({
  isOpen,
  newRows,
  updatedRows,
  deletedRows,
  unchangedRows,
  submitting,
  onCancel,
  onConfirm,
}: EntryBulkConfirmModalProps) {
  const t = useTranslations("competition.entries.confirmModal");
  const tCommon = useTranslations("common");
  const [showUnchanged, setShowUnchanged] = useState(false);

  const isEmpty =
    newRows.length === 0 &&
    updatedRows.length === 0 &&
    deletedRows.length === 0 &&
    unchangedRows.length === 0;

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} title={t("title")} size="lg">
      <div className="max-h-[60vh] overflow-y-auto space-y-5">
        {isEmpty && (
          <p className="py-8 text-center text-sm text-gray-500">{t("statusUnchanged")}</p>
        )}

        {newRows.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-green-700 mb-2">
              <PlusCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("statusNew")} ({newRows.length})
            </h3>
            <div className="space-y-2">
              {newRows.map((row) => (
                <ConfirmRowItem key={row.key} row={row} />
              ))}
            </div>
          </section>
        )}

        {updatedRows.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-blue-700 mb-2">
              <PencilSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("statusUpdate")} ({updatedRows.length})
            </h3>
            <div className="space-y-2">
              {updatedRows.map((row) => (
                <ConfirmRowItem key={row.key} row={row} />
              ))}
            </div>
          </section>
        )}

        {deletedRows.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-red-700 mb-2">
              <MinusCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("statusDelete")} ({deletedRows.length})
            </h3>
            <div className="space-y-2">
              {deletedRows.map((row) => (
                <ConfirmRowItem key={row.key} row={row} deleted />
              ))}
            </div>
          </section>
        )}

        {unchangedRows.length > 0 && (
          <section>
            <button
              type="button"
              onClick={() => setShowUnchanged((prev) => !prev)}
              aria-expanded={showUnchanged}
              aria-controls="entry-bulk-confirm-unchanged-panel"
              className="flex items-center gap-1.5 text-sm font-bold text-gray-500 mb-2"
            >
              {t("statusUnchanged")} ({unchangedRows.length})
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-400">
                {t("toggleUnchanged")}
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${showUnchanged ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </button>
            {showUnchanged && (
              <div id="entry-bulk-confirm-unchanged-panel" className="space-y-2">
                {unchangedRows.map((row) => (
                  <ConfirmRowItem key={row.key} row={row} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ボタン */}
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {tCommon("cancel")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("confirmButton")}
        </button>
      </div>
    </BaseModal>
  );
}
