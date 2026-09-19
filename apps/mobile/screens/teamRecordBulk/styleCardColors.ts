// =============================================================================
// 種目一覧カードの背景色 - canonical な SwimStyle コード基準の唯一の変換表
// =============================================================================
//
// 配色の意味づけの定義元は apps/web/components/team/member-management/components/
// MembersTimeTable.tsx (L39-52, ベストタイム表) だが、そのまま移植はしていない:
//
// - 定義元は「自由形」「平泳ぎ」等の日本語をキーにした Tailwind クラス名の対応表。
//   この画面は5ロケール対応で種目名は localizedStyleName により翻訳されるため、
//   日本語キーで引くと en/de/ko/zh で一切色が付かない (過去に web のメンバー管理表で
//   ベストタイムが全部「—」になった障害と同型の罠)。ここでは canonical な
//   SwimStyle コード ("Fr"/"Br"/"Ba"/"Fly"/"IM") をキーにする。
// - RN には Tailwind クラスが無いため、Tailwind のユーティリティクラスが表す
//   実際の色 (hex) をこの1箇所にのみ書き出す (web と mobile で色がずれないように)。
// - 定義元には `-100` (ヘッダー行) と `-50` (データセル、MembersTimeTable.tsx L249)
//   の2段階があり、実際に読むとセル自体の背景には薄い `-50` が使われている。
//   このカードもセル相当 (見出しではなく1件のデータ表示) であり、ユーザーの
//   要望も「ちょっと色つけたい」(控えめ) なので `-50` を採用する。
//
// hex 値は本リポジトリにインストール済みの tailwindcss (v4, oklch パレット) から
// 実際に解決される色を変換して書き出したもの (v3 の hex パレットとは一部異なる)。

import type { SwimStyle } from "@apps/shared/types";
import type { RelayKind } from "@apps/shared/types/relayRecord";

export const STYLE_CARD_BACKGROUND_HEX: Record<SwimStyle, string> = {
  Fr: "#FEFCE8", // bg-yellow-50 (自由形)
  Br: "#F0FDF4", // bg-green-50 (平泳ぎ)
  Ba: "#FEF2F2", // bg-red-50 (背泳ぎ)
  Fly: "#EFF6FF", // bg-blue-50 (バタフライ)
  IM: "#FDF2F8", // bg-pink-50 (個人メドレー)
};

/**
 * リレー種目カードの背景色。フリーリレーは自由形、メドレーリレーは
 * 個人メドレーと同じ色をユーザーが指定したため、`STYLE_CARD_BACKGROUND_HEX`
 * から導出する (色の対応表をここで複製しない)。
 */
export function relayCardBackgroundColor(relayKind: RelayKind): string {
  return relayKind === "medley" ? STYLE_CARD_BACKGROUND_HEX.IM : STYLE_CARD_BACKGROUND_HEX.Fr;
}
