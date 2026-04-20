"use client";

import React, { useState, useCallback, useMemo } from "react";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts";
import { RecordAPI } from "@apps/shared/api/records";
import { parseTime } from "@apps/shared/utils/time";
import { QuestionMarkCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

// =============================================================================
// 型定義
// =============================================================================

export interface BestTimeEntry {
  key: string;
  styleId: number;
  poolType: number; // 0: 短水路, 1: 長水路
  isRelaying: boolean;
  time: string;
  note: string;
}

interface Step3BestTimeProps {
  entries: BestTimeEntry[];
  setEntries: React.Dispatch<React.SetStateAction<BestTimeEntry[]>>;
  /** スキップ (or 保存成功) 後に呼ばれる。非同期で失敗する可能性があるため Promise を返す */
  onSkip: () => Promise<void>;
  onBack: () => void;
  completing: boolean;
  completeError: string | null;
}

interface StyleOption {
  id: number;
  nameJp: string;
}

// =============================================================================
// 種目マスター
// =============================================================================

const STYLES: StyleOption[] = [
  { id: 1, nameJp: "25m 自由形" },
  { id: 2, nameJp: "50m 自由形" },
  { id: 3, nameJp: "100m 自由形" },
  { id: 4, nameJp: "200m 自由形" },
  { id: 5, nameJp: "400m 自由形" },
  { id: 6, nameJp: "800m 自由形" },
  { id: 7, nameJp: "1500m 自由形" },
  { id: 8, nameJp: "25m 平泳ぎ" },
  { id: 9, nameJp: "50m 平泳ぎ" },
  { id: 10, nameJp: "100m 平泳ぎ" },
  { id: 11, nameJp: "200m 平泳ぎ" },
  { id: 12, nameJp: "25m 背泳ぎ" },
  { id: 13, nameJp: "50m 背泳ぎ" },
  { id: 14, nameJp: "100m 背泳ぎ" },
  { id: 15, nameJp: "200m 背泳ぎ" },
  { id: 16, nameJp: "25m バタフライ" },
  { id: 17, nameJp: "50m バタフライ" },
  { id: 18, nameJp: "100m バタフライ" },
  { id: 19, nameJp: "200m バタフライ" },
  { id: 20, nameJp: "100m 個人メドレー" },
  { id: 21, nameJp: "200m 個人メドレー" },
  { id: 22, nameJp: "400m 個人メドレー" },
];

function genKey(): string {
  // ブラウザネイティブで一意なキーを生成。crypto.randomUUID は SSR では undefined になるが、
  // Step3BestTime は "use client" 且つユーザー操作起点でのみ呼ばれるため常に利用可能。
  return `bt-${crypto.randomUUID()}`;
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export default function Step3BestTime({
  entries,
  setEntries,
  onSkip,
  onBack,
  completing,
  completeError,
}: Step3BestTimeProps) {
  const { supabase } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const recordAPI = useMemo(() => {
    if (!supabase) return null;
    return new RecordAPI(supabase);
  }, [supabase]);

  // 重複検出: 種目 + 水路 + 引き継ぎ が完全一致するエントリーのキーを集める
  const duplicateKeys = useMemo(() => {
    const keys = new Set<string>();
    const seen = new Map<string, string>(); // compositeKey → entryKey
    for (const e of entries) {
      const composite = `${e.styleId}-${e.poolType}-${e.isRelaying}`;
      const existing = seen.get(composite);
      if (existing) {
        keys.add(existing);
        keys.add(e.key);
      } else {
        seen.set(composite, e.key);
      }
    }
    return keys;
  }, [entries]);

  const hasDuplicates = duplicateKeys.size > 0;

  // 種目セレクトで選択 → エントリー追加
  const handleAddStyle = useCallback(
    (styleId: number) => {
      if (styleId === 0) return;
      setEntries((prev) => [
        ...prev,
        {
          key: genKey(),
          styleId,
          poolType: 0,
          isRelaying: false,
          time: "",
          note: "",
        },
      ]);
    },
    [setEntries],
  );

  // エントリー更新
  const updateEntry = useCallback(
    (key: string, patch: Partial<BestTimeEntry>) => {
      setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    },
    [setEntries],
  );

  // エントリー削除
  const removeEntry = useCallback(
    (key: string) => {
      setEntries((prev) => prev.filter((e) => e.key !== key));
    },
    [setEntries],
  );

  // 登録して完了
  const handleSaveAndComplete = useCallback(async () => {
    if (!recordAPI) return;

    // タイム入力済みのエントリーだけ登録
    const validEntries = entries.filter((e) => {
      const t = parseTime(e.time);
      return t > 0;
    });

    setSaving(true);
    setSaveError(null);

    try {
      if (validEntries.length > 0) {
        const records = validEntries.map((e) => ({
          style_id: e.styleId,
          time: parseTime(e.time),
          is_relaying: e.isRelaying,
          note: e.note || null,
          pool_type: e.poolType,
        }));

        const result = await recordAPI.createBulkRecords(records);

        if (result.errors.length > 0) {
          setSaveError(`一部の登録に失敗しました: ${result.errors.join(", ")}`);
          setSaving(false);
          return;
        }
      }

      // 成功 (タイム未入力ならそのまま) → onboarding 完了へ
      // onSkip (handleComplete) は async で失敗しうるので await する
      await onSkip();
    } catch {
      setSaveError("登録に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }, [entries, recordAPI, onSkip]);

  const hasEntries = entries.length > 0;
  const allTimeFilled = hasEntries && entries.every((e) => parseTime(e.time) > 0);
  const isProcessing = saving || completing;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">ベストタイムを登録</h2>
        <p className="text-sm text-gray-500">後からいつでも追加・編集できます</p>
      </div>

      {(completeError || saveError) && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700" role="alert">
            {saveError || completeError}
          </p>
        </div>
      )}

      {hasDuplicates && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700" role="alert">
            重複する種目があります
          </p>
        </div>
      )}

      {/* 登録済みエントリー */}
      <div className="space-y-3">
        {entries.map((entry) => {
          const style = STYLES.find((s) => s.id === entry.styleId);
          return (
            <EntryRow
              key={entry.key}
              entry={entry}
              styleName={style?.nameJp ?? ""}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              disabled={isProcessing}
              isDuplicate={duplicateKeys.has(entry.key)}
            />
          );
        })}
      </div>

      {/* 種目追加セレクト */}
      <select
        value={0}
        onChange={(e) => handleAddStyle(Number(e.target.value))}
        disabled={isProcessing}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
      >
        <option value={0}>種目を追加...</option>
        {STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nameJp}
          </option>
        ))}
      </select>

      {/* ボタン */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isProcessing}
          className="flex-1"
        >
          戻る
        </Button>
        {hasEntries ? (
          <Button
            type="button"
            onClick={allTimeFilled ? handleSaveAndComplete : undefined}
            disabled={isProcessing || hasDuplicates || !allTimeFilled}
            className="flex-1"
          >
            {saving ? "登録中..." : completing ? "準備中..." : "保存して始める"}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onSkip}
            disabled={isProcessing}
            className="flex-1"
          >
            {completing ? "準備中..." : "スキップして始める"}
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// エントリー行コンポーネント
// =============================================================================

interface EntryRowProps {
  entry: BestTimeEntry;
  styleName: string;
  onUpdate: (key: string, patch: Partial<BestTimeEntry>) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
  isDuplicate: boolean;
}

function EntryRow({ entry, styleName, onUpdate, onRemove, disabled, isDuplicate }: EntryRowProps) {
  const [showTimeHint, setShowTimeHint] = useState(false);

  return (
    <div className={`rounded-lg p-3 space-y-2 border ${isDuplicate ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
      {/* ヘッダー: 種目名 + 削除 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">{styleName}</span>
        <button
          type="button"
          onClick={() => onRemove(entry.key)}
          disabled={disabled}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          aria-label={`${styleName}を削除`}
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* 入力フィールド: スマホ 2 行 / デスクトップ 1 行 */}
      <div className="space-y-1.5 sm:space-y-0 sm:grid sm:gap-1.5 sm:items-center" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr" }}>
        {/* 1行目 (スマホ): 水路 + 引き継ぎ / デスクトップ: そのまま */}
        <div className="grid grid-cols-2 gap-1.5 sm:contents">
          <select
            value={entry.poolType}
            onChange={(e) => onUpdate(entry.key, { poolType: Number(e.target.value) })}
            disabled={disabled}
            className="w-full px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={0}>短水路</option>
            <option value={1}>長水路</option>
          </select>

          <label className="flex items-center justify-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={entry.isRelaying}
              onChange={(e) => onUpdate(entry.key, { isRelaying: e.target.checked })}
              disabled={disabled}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            引き継ぎあり
          </label>
        </div>

        {/* 2行目 (スマホ): タイム + 備考 / デスクトップ: そのまま */}
        <div className="grid grid-cols-2 gap-1.5 sm:contents">
          <div className="relative">
            <input
              type="text"
              value={entry.time}
              onChange={(e) => onUpdate(entry.key, { time: e.target.value })}
              placeholder="1:23.45"
              disabled={disabled}
              className="w-full px-1.5 py-1 pr-6 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 group/hint">
              <button
                type="button"
                onClick={() => setShowTimeHint((v) => !v)}
                onBlur={() => setShowTimeHint(false)}
                className="sm:pointer-events-none"
              >
                <QuestionMarkCircleIcon className="w-3.5 h-3.5 text-gray-400" />
              </button>
              {/* デスクトップ: ? ホバーで表示 */}
              <div className="hidden group-hover/hint:sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 leading-relaxed">
                <p className="font-semibold mb-1">半角数字で入力</p>
                <p>1:23.45 / 23.45 / 23-45 / 1-23-45 など自由な形式で入力できます</p>
              </div>
              {/* スマホ: タップトグル、中央寄せ */}
              {showTimeHint && (
                <div className="sm:hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 leading-relaxed">
                  <p className="font-semibold mb-1">半角数字で入力</p>
                  <p>1:23.45 / 23.45 / 23-45 / 1-23-45 など自由な形式で入力できます</p>
                </div>
              )}
            </div>
          </div>

          <input
            type="text"
            value={entry.note}
            onChange={(e) => onUpdate(entry.key, { note: e.target.value })}
            placeholder="日付、大会名など"
            disabled={disabled}
            className="w-full px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
