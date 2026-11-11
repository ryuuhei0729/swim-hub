"use client";

// =============================================================================
// useBestTimeBulkInput - ホームのベストタイム表を入力モードにしたときの入力値と登録処理
// =============================================================================
//
// 2026-11-10 に一括入力画面 (BulkBestTimeScreen) をやめ、ホームの表がそのまま入力モードに
// 切り替わる形にした。登録の手順 (records.id をクライアントで決めて upsert し、途中で失敗しても
// 再登録で二重にならない) は旧画面のものをそのまま移している。

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RecordAPI } from "@apps/shared/api/records";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useAuth } from "@/contexts/AuthProvider";
import { useBulkRecordIds } from "@/hooks/useBulkRecordIds";
import {
  computeMatrixRecords,
  type BestTimeInputMap,
  type BestTimeRecordDraft,
  type CellInput,
} from "./styleOptions";

const EMPTY_CELL: CellInput = { time: "", note: "" };

export interface BestTimeBulkInput {
  inputs: BestTimeInputMap;
  /** 登録対象 (形式が正しいタイムのあるマスだけ) */
  records: BestTimeRecordDraft[];
  updateCell: (key: string, field: "time" | "note", value: string) => void;
  clearCell: (key: string) => void;
  /** 入力をすべて捨て、次の入力で新しい records.id を使うようにする */
  reset: () => void;
  saving: boolean;
  saveError: string | null;
  /** 登録できたら登録件数を、できなかったら null を返す */
  save: () => Promise<number | null>;
}

export function useBestTimeBulkInput(): BestTimeBulkInput {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bulkRecordIds = useBulkRecordIds();

  const [inputs, setInputs] = useState<BestTimeInputMap>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const recordAPI = useMemo(() => (supabase ? new RecordAPI(supabase) : null), [supabase]);
  const records = useMemo(() => computeMatrixRecords(inputs), [inputs]);

  const updateCell = useCallback((key: string, field: "time" | "note", value: string) => {
    setInputs((prev) => {
      const updated = { ...(prev[key] ?? EMPTY_CELL), [field]: value };
      const next = { ...prev };
      // タイム・備考とも空になったマスはマップから除く (件数に数えない)
      if (!updated.time && !updated.note) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
  }, []);

  const clearCell = useCallback((key: string) => {
    setInputs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setInputs({});
    setSaveError(null);
    bulkRecordIds.reset();
  }, [bulkRecordIds]);

  const save = useCallback(async (): Promise<number | null> => {
    if (!recordAPI || savingRef.current || records.length === 0) return null;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      // マス (種目 × 水路 × 引き継ぎ区分) ごとに records.id を固定し、再登録でも二重にしない
      const keyFor = (r: BestTimeRecordDraft) =>
        `${r.styleId}_${r.poolType}_${r.isRelaying ? 1 : 0}`;
      // 前回の (途中で失敗した) 登録で保存済みだが、その後入力を消したマスの記録を削除する
      const staleIds = bulkRecordIds.staleSavedIds(records.map(keyFor));
      for (const staleId of staleIds) {
        await recordAPI.deleteRecord(staleId);
      }
      bulkRecordIds.forget(staleIds);

      const result = await recordAPI.createBulkRecords(
        records.map((r) => ({
          id: bulkRecordIds.idFor(keyFor(r)),
          style_id: r.styleId,
          time: r.time,
          is_relaying: r.isRelaying,
          note: r.note,
          pool_type: r.poolType,
        })),
      );
      bulkRecordIds.markSaved(result.savedIds);

      if (result.errors.length > 0) {
        setSaveError(t("bulkBestTime.error.partialFailure", { errors: result.errors.join(", ") }));
        return null;
      }

      // ホームのベストタイム表・大会タブの記録一覧 (大会未紐付けの記録)・カレンダーを最新化
      await queryClient.invalidateQueries({ queryKey: recordKeys.bestTimes(user?.id) });
      await queryClient.invalidateQueries({ queryKey: recordKeys.lists() });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      return result.created;
    } catch (error) {
      setSaveError(toUserFacingMessage(error, t("bulkBestTime.error.registerFailed")));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [recordAPI, records, bulkRecordIds, queryClient, user?.id, t]);

  return { inputs, records, updateCell, clearCell, reset, saving, saveError, save };
}
