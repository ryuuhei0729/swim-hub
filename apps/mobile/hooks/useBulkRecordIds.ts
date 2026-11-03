"use client";

// =============================================================================
// useBulkRecordIds - ベストタイム一括登録で、再保存しても二重登録しないための ID 管理
// =============================================================================
//
// 一括登録は 100 件ずつのバッチで INSERT する。低速回線では一部のバッチだけ保存でき、
// 残りが失敗することがある。利用者が再保存すると、保存済みのバッチが二重に登録されていた。
//
// 入力欄 (セル / 行) のキーごとに records.id をクライアントで決めて渡し、API 側で
// ID による upsert にする。再保存では保存済みの行が更新されるだけになる。
// 保存済みの行がその後フォームから消された場合は、削除対象として返す。

import { useCallback, useRef } from "react";
import { randomUUID } from "expo-crypto";

export interface BulkRecordIds {
  /** キーに対応する records.id (無ければ割り当てる) */
  idFor: (key: string) => string;
  /** API が返した保存済み ID を記録する */
  markSaved: (savedIds: readonly string[]) => void;
  /** 保存済みだが、現在のキー一覧に無くなった行の ID */
  staleSavedIds: (currentKeys: readonly string[]) => string[];
  /** 削除できた行を忘れる */
  forget: (ids: readonly string[]) => void;
}

export function useBulkRecordIds(): BulkRecordIds {
  const idByKeyRef = useRef(new Map<string, string>());
  const savedIdsRef = useRef(new Set<string>());

  const idFor = useCallback((key: string) => {
    let id = idByKeyRef.current.get(key);
    if (!id) {
      id = randomUUID();
      idByKeyRef.current.set(key, id);
    }
    return id;
  }, []);

  const markSaved = useCallback((savedIds: readonly string[]) => {
    for (const id of savedIds) savedIdsRef.current.add(id);
  }, []);

  const staleSavedIds = useCallback((currentKeys: readonly string[]) => {
    const current = new Set(currentKeys);
    const stale: string[] = [];
    for (const [key, id] of idByKeyRef.current) {
      if (!current.has(key) && savedIdsRef.current.has(id)) stale.push(id);
    }
    return stale;
  }, []);

  const forget = useCallback((ids: readonly string[]) => {
    const targets = new Set(ids);
    for (const [key, id] of Array.from(idByKeyRef.current.entries())) {
      if (targets.has(id)) {
        idByKeyRef.current.delete(key);
        savedIdsRef.current.delete(id);
      }
    }
  }, []);

  return { idFor, markSaved, staleSavedIds, forget };
}
