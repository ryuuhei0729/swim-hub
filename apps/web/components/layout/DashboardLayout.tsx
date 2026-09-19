"use client";

import React, { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import ScrollToTop from "./ScrollToTop";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ScrollToTop />

      {/* ヘッダー */}
      <Header onMenuClick={handleMenuClick} />

      {/* サイドバー（固定） */}
      <Sidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      {/* メインコンテンツエリア */}
      {/* ⚠️ 横方向のクリップは `overflow-x-hidden` を base に置き、`xl` 以上だけ
          **`xl:overflow-x-clip`** で上書きする。この2枚重ねには理由がある。

          `overflow-x: hidden` は CSS 仕様上もう一方の軸の `visible` を `auto` に
          昇格させるため、この div が**縦スクロールコンテナになる** (実測:
          computed overflow-y = auto)。高さは中身任せで実際にはスクロールしないので
          スクロールバーは出ないが、`position: sticky` の子は「スクロールしない
          スクロールポート」を基準にしてしまい、**ページをスクロールしても一切
          張り付かない** (実測: 1440px で sticky 要素が top -2856px まで流れる)。
          `overflow-x: clip` はスクロールコンテナを作らない (computed overflow-y =
          visible) ので、横方向のクリップだけを維持したまま sticky が機能する。

          **なぜ `xl` 限定なのか (無条件に clip にしないのか)。**
          `overflow-x: clip` は Safari 15 以前が非対応で、非対応環境では宣言が
          丸ごと破棄される。無条件に `clip` だけを書くと「1280px 以上のデスクトップで
          sticky が効く」という利得のために「古い Safari の**全幅・全認証ページ**で
          横クリップが失われてページに横スクロールが出る」リスクを負う形になり、
          リスクとベネフィットが非対称になる。sticky が必要なのは 1280px 以上だけ
          なので、影響帯域もそこに閉じる。
            - 1280px 未満 … `hidden` のまま = **変更前と完全に同一** (この帯域は
              sticky を使わないので失うものが無い)
            - 1280px 以上のモダンブラウザ … `xl:` の方が生成 CSS で後に出るので
              `clip` が勝ち、sticky が効く
            - 1280px 以上の Safari ≤15 … `overflow-x: clip` が無効値として宣言ごと
              破棄され base の `hidden` が残る → **横クリップは維持され、sticky だけが
              効かない** (グレースフルデグラデーション)

          横方向の挙動は hidden と clip で同じ (むしろ clip は JS の scrollLeft でも
          動かせないので「はみ出しは到達不能」がより厳密になる。実測: 全13幅で
          scrollLeft=9999 を代入しても 0)。

          最初の消費者は apps/web/components/team/rankings/RankingSplitLayout.tsx。
          ⚠️ `xl:overflow-x-clip` を外して `hidden` だけに戻すと、そちらの
          `xl:sticky` は**エラーも出さずに効かなくなる**。戻す場合は
          RankingSplitLayout の `xl:sticky xl:top-20` も同時に外すこと。 */}
      <div className="pt-16 lg:pl-64 overflow-x-hidden xl:overflow-x-clip">
        <main className="min-h-screen">
          <div className="max-w-7xl mx-auto py-4 sm:py-6 px-0 sm:px-4 lg:px-8">{children}</div>
        </main>

        {/* フッター */}
        <Footer />
      </div>
    </div>
  );
}
