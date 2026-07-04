"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { StyleOption } from "@/components/forms/record-log/types";
import { styleIdToCodeKey, canStyleRelay, type StyleCodeKey } from "@/utils/swimStyle";

interface StyleChipSelectorProps {
  /** 選択肢となる種目一覧(距離・泳法を内部で導出) */
  styles: StyleOption[];
  /** 選択中の種目ID */
  value: string;
  /** 種目ID変更時のコールバック */
  onChange: (styleId: string) => void;
  disabled?: boolean;
  /** チップの data-testid 接頭辞(例: "entry-style-1") */
  testIdPrefix?: string;
  /** リレー区分。onToggleRelaying と併せて渡すとリレートグルを表示する */
  isRelaying?: boolean;
  onToggleRelaying?: (next: boolean) => void;
  /** リレートグルのラベル */
  relayLabel?: string;
}

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-md border text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
    active
      ? "bg-blue-600 border-blue-600 text-white"
      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
  }`;

/**
 * 距離チップ × 泳法チップで種目を選択するセレクタ。
 * 距離・泳法の組み合わせから種目ID(styleId)を逆引きして onChange に渡す。
 * 泳法チップのラベルは practice.styles 翻訳経由 (locale 対応)。
 * 一意性判定は nameJp 文字列ではなく CodeKey ベース。
 */
export default function StyleChipSelector({
  styles,
  value,
  onChange,
  disabled = false,
  testIdPrefix,
  isRelaying = false,
  onToggleRelaying,
  relayLabel,
}: StyleChipSelectorProps) {
  const tStyles = useTranslations("practice.styles");

  const currentStyle = styles.find((s) => s.id.toString() === value);
  const raceDistance = currentStyle?.distance;
  const currentCodeKey = currentStyle ? styleIdToCodeKey(currentStyle.id) : undefined;

  const distanceOptions = Array.from(new Set(styles.map((s) => s.distance))).sort((a, b) => a - b);

  // CodeKey の出現順を保持 (styles 配列の順序を尊重)
  const codeKeyOrder: StyleCodeKey[] = [];
  styles.forEach((s) => {
    const key = styleIdToCodeKey(s.id);
    if (key && !codeKeyOrder.includes(key)) codeKeyOrder.push(key);
  });

  /**
   * 距離 d × CodeKey ck の style を検索して id を返す。
   * name_jp ではなく id ベースで照合するため locale 非依存。
   */
  const findStyleIdBy = (d: number | undefined, ck: StyleCodeKey | undefined): string | undefined => {
    if (d === undefined || ck === undefined) return undefined;
    const found = styles.find((s) => s.distance === d && styleIdToCodeKey(s.id) === ck);
    return found ? found.id.toString() : undefined;
  };

  // 選択中の距離で入力可能な CodeKey のみ
  const codeKeysForCurrentDistance = codeKeyOrder.filter((ck) =>
    styles.some((s) => s.distance === raceDistance && styleIdToCodeKey(s.id) === ck),
  );

  // 距離未選択時は全泳法を表示し、種目チップを最初から見せる
  const codeKeysToShow =
    raceDistance !== undefined ? codeKeysForCurrentDistance : codeKeyOrder;

  const testId = (suffix: string) => (testIdPrefix ? `${testIdPrefix}-${suffix}` : undefined);

  const showRelayToggle =
    onToggleRelaying &&
    currentStyle != null &&
    canStyleRelay(currentStyle.id, currentStyle.distance);

  return (
    <div className="space-y-1.5" data-testid={testIdPrefix}>
      {/* 距離 */}
      <div className="flex flex-wrap gap-1">
        {distanceOptions.map((d) => {
          const isActive = raceDistance === d;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => {
                // 現在の CodeKey で同距離があればそれを、無ければその距離で選べる先頭 CodeKey を選ぶ
                const id =
                  findStyleIdBy(d, currentCodeKey ?? undefined) ??
                  findStyleIdBy(d, codeKeyOrder.find((ck) => findStyleIdBy(d, ck)));
                if (id) onChange(id);
              }}
              aria-pressed={isActive}
              className={chipClass(isActive)}
              data-testid={testId(`distance-${d}`)}
            >
              {d}m
            </button>
          );
        })}
      </div>
      {/* 泳法 — ラベルは practice.styles 翻訳 */}
      <div className="flex flex-wrap gap-1">
        {codeKeysToShow.map((ck) => {
          const isActive = currentCodeKey === ck;
          return (
            <button
              key={ck}
              type="button"
              disabled={disabled}
              onClick={() => {
                // 距離未選択ならその泳法が選べる先頭の距離を補う
                const targetDistance =
                  raceDistance ?? distanceOptions.find((d) => findStyleIdBy(d, ck) !== undefined);
                const id = findStyleIdBy(targetDistance, ck);
                if (id) onChange(id);
              }}
              aria-pressed={isActive}
              className={chipClass(isActive)}
              data-testid={testId(`stroke-${ck}`)}
            >
              {tStyles(ck)}
            </button>
          );
        })}
      </div>
      {/* リレー (オンオフトグル) */}
      {showRelayToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={isRelaying}
          disabled={disabled}
          onClick={() => onToggleRelaying(!isRelaying)}
          className="flex items-center gap-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid={testId("relay")}
        >
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              isRelaying ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isRelaying ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </span>
          {relayLabel && <span className="text-[10px] sm:text-sm text-gray-700">{relayLabel}</span>}
        </button>
      )}
    </div>
  );
}
