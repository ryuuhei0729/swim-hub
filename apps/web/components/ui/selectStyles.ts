// =============================================================================
// コンパクトな <select> のボックス指定 (唯一の定義元)
// =============================================================================
// 表の上に並ぶ小さめの <select> (プルダウン) 共通のクラス文字列。
//
// もともとは `components/team/rankings/filterStyles.ts` にあり、ランキングの
// 絞り込み select と profile / member-detail の BestTimesTable が同じ指定を
// 別々に書き写していた。ランキングの絞り込みはラジオボタンに置き換わって
// select が無くなったため、**残った消費者 (BestTimesTable 2ファイル) が読む
// 場所**へ移した。下の根拠コメントはその2ファイルに重複して書かれていたもの
// で、ここが唯一の写しである。
//
// 🚨 このクラス文字列を BestTimesTable 側に書き戻さないこと。過去に
//    「同一指定を持つ箇所は3つ」という状態で片方だけ直され、640〜767px 帯で
//    ▼ の重なりが片側だけ再発している。
// =============================================================================

/**
 * 高さ・padding の根拠 (globals.css の
 * `@media (max-width:768px){input,select,textarea{font-size:16px!important}}`
 * との衝突対策。この !important は残す前提でボックス側を合わせる):
 *
 * Tailwind v4 の text-xs/text-sm は line-height をユニットレスの比率で定義する
 * (--text-xs--line-height: calc(1/0.75)=1.333, --text-sm--line-height: calc(1.25/0.875)=1.4286)。
 * 比率なので 16px 強制時は font-size と一緒にスケールし、想定より大きい line-height になる。
 * - 〜639px (text-xs, 16px 強制): line-height = 16 * 1.333 ≈ 21.33px
 * - 640〜767px (sm: が効くが 16px 強制はまだ効く text-sm): line-height = 16 * 1.4286 ≈ 22.86px (最大ケース)
 * - 768px〜 (実際の text-sm, 14px): line-height = 14 * 1.4286 = 20px
 * border-box なので box 内の中身が入る余地 = height - border(2px) - padding。
 * py-1 (padding 4px×2=8px) にすると必要高さは最大でも 22.86+8+2=32.86px。
 * h-9 (36px) はどの帯域でも上回る (余裕 3px 以上)。
 *
 * 水平方向 (pl-2 sm:pl-3 pr-7) の根拠:
 * @tailwindcss/forms が base レイヤーで select に ▼ の背景画像を敷く
 * (background-position: right .5rem center / background-size: 1.5em 1.5em、
 *  viewBox 0 0 20 20 / path M6 8l4 4 4-4 / stroke-width 1.5 round cap)。
 * 可視ストロークは padding-box 右端から 14.3px〜25.7px を占めるので
 * (768px 以下は font-size 16px 強制)、padding-right は 25.7px 以上が必要。
 * 実測 (built CSS + headless Chromium, 375/640/767/768/1280px):
 *   pr-6 = 24px → 1.7px 不足 / pr-7 = 28px → 2.3px の余裕
 * ⚠️ ブラウザ実測で見える余白 (約4.2px) はラベルの描画幅が intrinsic な
 * content-box より約1.9px 狭いことを含んだ値。**幾何的に保証されるのは 2.3px だけ**
 * なので、これより長いラベルを増やすなら pr-8 (32px) を検討すること。
 *
 * 🚨 padding-right を `px-*` で触ってはいけない。生成 CSS の宣言順が
 *    .px-2 → .pr-* → .sm\:px-3 なので **`sm:px-3` が `pr-*` に勝ち**、
 *    640px 以上で padding-right が 12px に戻って ▼ が最長ラベルに重なる
 *    (QA 実測: 640px/767px で 4/5 の select が重なった)。
 *    よって左右を分離し、padding-right は pr-7 の1クラスに集約する。
 *    `px-2 sm:px-3` + `pr-*` の形に戻さないこと。
 */
export const COMPACT_SELECT_CLASS =
  "h-9 py-1 pl-2 sm:pl-3 pr-7 border border-gray-300 rounded-md text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
