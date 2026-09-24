"use client";

import React from "react";

interface RankingSplitLayoutProps {
  /** 左カラムに入る絞り込み UI (`RankingFilters` — 個人種目とリレーで共通の1つ) */
  filters: React.ReactNode;
  /** 右カラムに入る結果 (件数・注意書き・表・「さらに表示」・空状態・エラー) */
  results: React.ReactNode;
}

/**
 * ランキングの「絞り込み ↔ 結果」2カラムレイアウト。
 *
 * 種目ラジオで個人種目とリレーが切り替わるので、**このレイアウトは1回だけ描かれ、
 * 結果カラムの中身だけが入れ替わる** (絞り込みカラムは共通の `RankingFilters`)。
 *
 * - `xl` (1280px) 未満: 何もしない。絞り込みが上、結果が下の**縦積みのまま**
 *   (`xl:` 接頭辞しか付けないので、この帯域では素の `<div>` 3枚と等価)
 * - `xl` 以上: 左半分が絞り込み、右半分が結果
 *
 * **ブレークポイントを `xl` (1280px) にした理由 — `lg` では狭すぎる。**
 * このカードは `DashboardLayout` の内側にあり、`lg` 以上ではサイドバーが
 * `lg:pl-64` で **256px** を占める。さらに `px-8` (64px) と カードの `sm:p-6`
 * (48px) と `gap-6` (24px) が引かれるため、片側の実測幅は
 *   viewport 1024px → **316px** / 1280px → **444px** / 1536px 以上 → **572px**
 *   (max-w-7xl が効くので 1536px より広くしても 572px で止まる)
 * になる。一方、表が横スクロールせずに収まるのに必要な幅 (min-content) は
 * ビルド後 CSS + headless Chromium の実測で
 *   個人種目 (5列) = **394px** / リレー (6列) = **414px**
 * だった。つまり `lg` (316px) では 2カラムにした瞬間に表が横スクロールを始める
 * (縦積みなら 1024px でも 656px あって収まっていたので、**明確な後退**になる)。
 * `xl` の 444px なら両方の表が収まる。
 *
 * 1024〜1279px (iPad 横・小さめのウィンドウ) は縦積みのままになるが、
 * ユーザーの要望は「スマホサイズは今のままでよい / PC サイズは左右分割」であり、
 * 表が横スクロールする 2カラムより縦積みのほうが要望に近い。
 *
 * **JS でのブレークポイント判定 (`matchMedia` / `useMediaQuery`) は使わない。**
 * SSR で幅が分からないため初回描画が必ずどちらかに外れ、ハイドレーション後に
 * レイアウトが飛ぶ。CSS だけで切り替える。
 *
 * **左カラムは `xl` で sticky にする。** 50行表示すると表が数千px になり、
 * スクロールすると絞り込みが画面外に出て「左で選んで右で見る」という構成の
 * 利点が消える。`top` は **`xl:top-20` (80px)**: `Header.tsx` は
 * `fixed top-0` で **高さ 64px + border-b 1px = 下端 65px** (実測) なので、
 * 80px なら固定ヘッダーの下に 15px の余白を持って収まる。
 * `top-16` (64px) にすると 1px だけヘッダーの境界線に潜る。
 * `xl:self-start` は付けない — グリッド側に `xl:items-start` があり冗長。
 *
 * ⚠️ **この sticky は `DashboardLayout.tsx:70` の `xl:overflow-x-clip` に依存している。**
 * 同 div の base は `overflow-x-hidden` で、`xl` 以上だけ `clip` に上書きしている
 * (ブレークポイントがここと揃っているのは偶然ではない — sticky が必要な帯域だけ
 * `clip` にして、`clip` 非対応ブラウザで横クリップを失うリスクを広げないため)。
 * `overflow-x: hidden` は CSS 仕様で overflow-y を `auto` に昇格させ、同 div を
 * スクロールコンテナにする。するとこの sticky は「スクロールしないスクロールポート」を
 * 基準にしてしまい、**エラーも出さずに効かなくなる**
 * (実測: 1440px で top -2856px まで流れる)。
 * Safari 15 以前は `clip` 非対応で base の `hidden` が残るため、そこでは
 * **横クリップは維持されたまま sticky だけが効かない** (許容する)。
 *
 * ⚠️ `min-w-0` を両カラムから外さないこと。grid item の `min-width` は既定 `auto`
 * (= min-content) なので、表の `white-space: nowrap` な列や長い大会名が
 * **カラム幅を押し広げてグリッドを食い破る**。
 * このとき溢れた右端は横スクロールで読めるようにはならない —
 * **`DashboardLayout.tsx:70` の `overflow-x-hidden xl:overflow-x-clip` がページ全体の
 * 横方向の溢れをクリップするので、はみ出した分は切り落とされて到達不能になる**
 * (実測: 全13幅で `scrollLeft = 9999` を代入しても 0。`xl` 以上の `clip` は JS でも
 * 動かせないのでより厳密)。`min-w-0` で
 * 「中身ではなくトラック幅が幅を決める」に倒し、溢れは表側の
 * `overflow-x-auto` (= 表だけの横スクロール) に閉じ込めるのが唯一の正解。
 *
 * ⚠️ 個人種目とリレーで別々にクラス文字列を持たせないこと (この 1 箇所が定義元)。
 * 片方だけブレークポイントを変えると、種目を切り替えた瞬間に
 * レイアウトが変わる状態が静かに生まれる。
 */
export default function RankingSplitLayout({ filters, results }: RankingSplitLayoutProps) {
  return (
    <div className="xl:grid xl:grid-cols-2 xl:gap-6 xl:items-start">
      <div className="min-w-0 xl:sticky xl:top-20">{filters}</div>
      <div className="min-w-0">{results}</div>
    </div>
  );
}
