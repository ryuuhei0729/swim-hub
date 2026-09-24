"use client";

import React from "react";

// =============================================================================
// ランキング絞り込みのラジオボタン群 (個人種目 / リレー 共用)
// =============================================================================
// `<select>` から置き換えたもの。**実際の <input type="radio"> を使う。**
// `role="radio"` を手で組むと矢印キー移動・グループ内フォーカス管理・
// スクリーンリーダーの「n / m 個目」読み上げを全部自分で実装することになるが、
// ネイティブの radio + name グルーピングならブラウザが全部やる。
//
// 見た目は「視覚的に隠した input + スタイル付き label」の pill。
// ⚠️ 隠し方は `sr-only` 相当 (absolute + w-px h-px + overflow-hidden) に限る。
//    `display:none` / `visibility:hidden` はキーボードフォーカスを奪うので、
//    Tab でグループに入れなくなり矢印キー選択もできなくなる。
// =============================================================================

export interface FilterRadioOption {
  /** input の value。呼び出し側は onChange で受けた文字列を実データと突き合わせる */
  value: string;
  label: string;
}

interface FilterRadioGroupProps {
  /**
   * input の `name`。同一ページ内で一意にすること (radio のグルーピング単位)。
   * `id` と data-testid の接頭辞も兼ねる。
   */
  name: string;
  /** `<legend>` に出す項目名 (「種目」「距離」等) */
  legend: string;
  /**
   * 選択肢。**外側の配列が視覚的な1行**に対応する (1行に収める項目は
   * `[options]` のように1要素で渡す)。
   *
   * ⚠️ 行を分けても `<fieldset>` と `name` は**1つのまま**である。
   * 行ごとに fieldset を分けると radio group が2つになり、矢印キーで行を跨げず
   * 「1つの選択」という意味論が壊れる。ここは `flex flex-wrap` の div を
   * 行数ぶん並べるだけなので、radio のグルーピングは `name` に閉じている
   * (ブラウザは同じ name の radio を DOM 順に巡回するため、行を跨いで
   * 矢印キーが効く)。
   */
  optionRows: readonly (readonly FilterRadioOption[])[];
  /** 現在選択されている value。どの option にも一致しない場合は未選択になる */
  value: string;
  /**
   * 選択変更。**value は string のまま渡す。**
   * 数値や union 型への確定は呼び出し側が実データと突き合わせて行う
   * (`as` キャストで検証を迂回させないため)。
   */
  onChange: (value: string) => void;
}

/**
 * `<legend>` のスタイル。旧 select 版の FILTER_LABEL_CLASS と同じ見た目。
 *
 * ⚠️ **この文字列を書き写さないこと。** 期間の絞り込みだけは `<select>` なので
 * `<legend>` ではなく `<label>` を使うが、**同じクラス文字列を読む**
 * (`RankingFilters.tsx`)。片方だけ触ると絞り込みの見出しが1つだけ違う見た目に
 * なる (`COMPACT_SELECT_CLASS` を1箇所に集約したのと同じ理由)。
 */
export const FILTER_LEGEND_CLASS = "mb-1 block text-xs font-medium text-gray-600";

/**
 * pill の配色は既存のトグル (`/time-level` の水路切替) と同じ
 * `bg-blue-600 text-white` / `bg-white text-gray-600`。新しい配色を作らない。
 *
 * - 折り返し: 距離は種目によって最大7択 (Fr は 25〜1500m) になるので `flex-wrap`。
 *   横スクロール (`overflow-x-auto`) にはしない — 隠れた選択肢に気付けない
 * - フォーカス: `peer-focus-visible` で input のフォーカスをラベルのリングに写す。
 *   `:focus` ではなく `:focus-visible` なのでクリック選択ではリングが出ない
 *   (旧 select の `focus:ring-2 focus:ring-blue-500` と同じ色・太さ)
 * 🚨 タップ標的の高さ — `min-h-9` と `py-2` のどちらも縮めないこと。
 *   置き換え前の `<select>` は `h-9` = **36px 固定**だった。これを下回らせない。
 *
 *   ⚠️ `<label>` は globals.css の
 *   `@media (max-width:768px){input,select,textarea{font-size:16px!important}}`
 *   の**対象外**である。select はこの 16px 強制に耐えるために h-9 を必要としていたが、
 *   label は指定どおりの font-size で描かれるので padding だけでは 36px に届かない:
 *     〜639px: text-xs 12px × line-height 1.333 = 16px + py-2 (8px×2) + border 2px = **34px**
 *     640px〜: text-sm 14px × 1.4286      = 20px + py-2 (8px×2) + border 2px = **38px**
 *   よって `min-h-9` (36px) を**下限**として足し、`flex items-center justify-center` で
 *   テキストを中央に寄せる。これで 36px / 38px になり全帯域で select 時代と同等以上。
 *   (640px 以上は 38px > 36px なので min-h-9 は効かない = 不自然に高くならない)
 *
 *   `py-1.5` に戻すと 30px / 34px、`min-h-9` を外すと 34px / 38px に下がる。
 *   このフィルタは最大5グループのピルを連続タップするモバイルが主戦場なので、
 *   WCAG 2.5.8 (24px) を満たしていても置き換え前より小さくしてはいけない。
 *   実測値は下の「375px での折り返し」と同じハーネス (ビルド後 CSS + headless
 *   Chromium, 320/375/414/640/767/768/1280px) で計測している。
 *
 *   `flex` (block-level) を使い `inline-flex` にはしない。inline-flex は親の
 *   ブロック内に行ボックスを作り、line-height 由来の余白でラッパー div だけが
 *   ピルより高くなる。
 */
const PILL_BASE_CLASS =
  "flex min-h-9 items-center justify-center select-none rounded-md border px-2.5 py-2 " +
  "text-xs sm:text-sm font-medium transition-colors " +
  "peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-1";

/**
 * 状態ごとの配色。
 *
 * disabled の分岐は持たない。**この絞り込みに操作できない状態が無い**ため
 * (種目マスターの取得中は絞り込みを描画せず、取得に失敗してもリレーは選べる。
 * 根拠は `@apps/shared/utils/rankingEventAxis` の
 * `buildDefaultRankingFilterState` の docstring)。
 *
 * ⚠️ disabled を戻すなら `peer-disabled:` と `hover:` を同じ要素に混ぜないこと。
 * どちらが勝つかが生成 CSS の宣言順に依存する (BestTimesTable の `sm:px-3` が
 * `pr-7` に勝った前科と同じ罠)。以前はここで分岐させて hover を含むクラスを
 * そもそも付けない形にしていた。
 */
function pillStateClass(isSelected: boolean): string {
  return isSelected
    ? "cursor-pointer border-blue-600 bg-blue-600 text-white"
    : "cursor-pointer border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900";
}

export default function FilterRadioGroup({
  name,
  legend,
  optionRows,
  value,
  onChange,
}: FilterRadioGroupProps) {
  // 空の行は描かない。行の div だけが残ると、次の行に付く `mt-1.5` の分だけ
  // 余白が増えて見える (種目マスターが取れず個人種目の行が0件になる経路で起きる)。
  // **testid の添字は元の行番号を維持する** — 行が消えたときに残った行の testid が
  // ずれると、QA の「リレーは row-1」という参照が静かに別の行を指す。
  const visibleRows = optionRows
    .map((options, index) => ({ options, index }))
    .filter((row) => row.options.length > 0);

  return (
    // min-w-0 は fieldset の既定 min-width:min-content を打ち消すため。
    // これが無いと最長の pill 行がグリッド/flex セルを押し広げて溢れる。
    <fieldset className="min-w-0" data-testid={name}>
      <legend className={FILTER_LEGEND_CLASS}>{legend}</legend>
      {visibleRows.map((row, position) => (
        // 行が2つ以上あるときだけ行間を空ける。1行しかないグループの見た目は
        // 行対応にする前と同じ (mt が付かない)。
        <div
          key={row.index}
          className={`flex flex-wrap gap-1.5${position > 0 ? " mt-1.5" : ""}`}
          data-testid={`${name}-row-${row.index}`}
        >
          {row.options.map((option) => {
            const isSelected = option.value === value;
            const inputId = `${name}-${option.value}`;
            return (
              // relative: sr-only の input は position:absolute なので、
              // 位置の基準をこのラッパーに閉じ込める (ページ先頭に飛ばさない)
              <div key={option.value} className="relative">
                <input
                  type="radio"
                  id={inputId}
                  name={name}
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onChange(option.value)}
                  data-testid={`${name}-option-${option.value}`}
                  // sr-only = absolute + w-px h-px + overflow-hidden + clip。
                  // フォーカス可能なまま視覚的にだけ隠す (display:none は不可)
                  className="peer sr-only"
                />
                <label
                  htmlFor={inputId}
                  className={`${PILL_BASE_CLASS} ${pillStateClass(isSelected)}`}
                >
                  {option.label}
                </label>
              </div>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
