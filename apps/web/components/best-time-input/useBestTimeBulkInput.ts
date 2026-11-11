"use client";

// =============================================================================
// useBestTimeBulkInput - ダッシュボードのベストタイム表を入力モードにしたときの入力値と登録処理
// =============================================================================
//
// 2026-11-11 に一括入力ページ (/bulk-besttime) をやめ、ダッシュボードの表がそのまま入力モードに
// 切り替わる形にした (mobile と同じ仕様)。
// マスごとに records.id をクライアントで決めて upsert するので、途中で一部だけ失敗して
// 登録し直しても二重にならない (mobile の useBulkRecordIds と同じ考え方)。

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { RecordAPI } from "@apps/shared/api/records";
import { dashboardKeys, recordKeys } from "@apps/shared/hooks/queries/keys";
import {
  computeMatrixRecords,
  type BestTimeInputMap,
  type BestTimeRecordDraft,
  type CellInput,
} from "@apps/shared/utils/bestTimeInputGrid";

const EMPTY_CELL: CellInput = { time: "", note: "" };

const recordKeyFor = (r: BestTimeRecordDraft) =>
  `${r.styleId}_${r.poolType}_${r.isRelaying ? 1 : 0}`;

export interface BestTimeBulkInput {
  inputs: BestTimeInputMap;
  /** 登録対象 (形式が正しいタイムのあるマスだけ) */
  records: BestTimeRecordDraft[];
  /** 何か入力のあるマスの数 (破棄の確認に使う) */
  enteredCount: number;
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
  const t = useTranslations("bulkBestTime");
  const queryClient = useQueryClient();

  const [inputs, setInputs] = useState<BestTimeInputMap>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  // マスのキー → records.id と、保存できた id
  const idByKeyRef = useRef(new Map<string, string>());
  const savedIdsRef = useRef(new Set<string>());

  const recordAPI = useMemo(() => (supabase ? new RecordAPI(supabase) : null), [supabase]);
  const records = useMemo(() => computeMatrixRecords(inputs), [inputs]);

  const updateCell = useCallback((key: string, field: "time" | "note", value: string) => {
    setInputs((prev) => {
      const updated = { ...(prev[key] ?? EMPTY_CELL), [field]: value };
      const next = { ...prev };
      // タイム・備考とも空になったマスは除く (件数に数えない)
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
    idByKeyRef.current.clear();
    savedIdsRef.current.clear();
  }, []);

  const save = useCallback(async (): Promise<number | null> => {
    if (!recordAPI || savingRef.current || records.length === 0) return null;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      // 前回の (途中で失敗した) 登録で保存済みだが、その後入力を消したマスの記録を削除する
      const currentKeys = new Set(records.map(recordKeyFor));
      for (const [key, id] of Array.from(idByKeyRef.current.entries())) {
        if (!currentKeys.has(key) && savedIdsRef.current.has(id)) {
          await recordAPI.deleteRecord(id);
          idByKeyRef.current.delete(key);
          savedIdsRef.current.delete(id);
        }
      }

      const idFor = (key: string) => {
        let id = idByKeyRef.current.get(key);
        if (!id) {
          id = crypto.randomUUID();
          idByKeyRef.current.set(key, id);
        }
        return id;
      };

      const result = await recordAPI.createBulkRecords(
        records.map((r) => ({
          id: idFor(recordKeyFor(r)),
          style_id: r.styleId,
          time: r.time,
          is_relaying: r.isRelaying,
          note: r.note,
          pool_type: r.poolType,
        })),
      );
      for (const id of result.savedIds) savedIdsRef.current.add(id);

      if (result.errors.length > 0) {
        setSaveError(t("error.partialFailure", { errors: result.errors.join(", ") }));
        return null;
      }

      // ダッシュボードのベストタイム表・大会の記録一覧 (大会未紐付けの記録)・カレンダーを最新化
      await queryClient.invalidateQueries({ queryKey: recordKeys.bestTimes(user?.id) });
      await queryClient.invalidateQueries({ queryKey: recordKeys.lists() });
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      return result.created;
    } catch (error) {
      console.error("ベストタイムの一括登録に失敗:", error);
      setSaveError(t("error.registerFailed"));
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [recordAPI, records, queryClient, user?.id, t]);

  return {
    inputs,
    records,
    enteredCount: Object.keys(inputs).length,
    updateCell,
    clearCell,
    reset,
    saving,
    saveError,
    save,
  };
}
