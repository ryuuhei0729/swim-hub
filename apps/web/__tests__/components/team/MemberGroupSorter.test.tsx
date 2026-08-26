/**
 * MemberGroupSorter コンポーネントテスト
 *
 * Sprint Contract 検証観点:
 *   [V-14 補助] MemberGroupSorter 自体の Fragment 化 (wrapper div 撤去) を単体レベルで固定する。
 *              このコンポーネントは categories.length===0 のとき null を返し、それ以外は
 *              Fragment (wrapper div なし) を返す。呼び出し側 (TeamMemberManagement) が
 *              「WAポイントで比較」ボタンをこのコンポーネントの外側に配置できる前提を
 *              単体レベルで保証する (呼び出し側の統合テストは TeamMemberManagement.test.tsx)。
 *
 * モック方針: next-intl は NextIntlClientProvider + 実メッセージ JSON を使う
 * (MembersTimeTable.test.tsx の既存規約を踏襲)。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi } from "vitest";

import { MemberGroupSorter } from "../../../components/team/member-management/components/MemberGroupSorter";
import jaMessages from "@apps/shared/messages/ja.json";

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("MemberGroupSorter", () => {
  describe("[V-14 補助] categories.length === 0 のとき何も描画しない", () => {
    it("空配列の場合、render 結果のコンテナに子要素が一つも無い", () => {
      const { container } = renderWithLocale(
        <MemberGroupSorter categories={[]} activeCategory={null} onToggle={vi.fn()} />,
      );
      expect(container.childElementCount).toBe(0);
    });

    it("空配列の場合、「グループ表示:」ラベルは表示されない", () => {
      renderWithLocale(<MemberGroupSorter categories={[]} activeCategory={null} onToggle={vi.fn()} />);
      expect(screen.queryByText("グループ表示:")).not.toBeInTheDocument();
    });
  });

  describe("[Fragment化の回帰防止] categories が1件以上のとき、wrapper div ではなく直接要素を返す", () => {
    it("旧実装の wrapper div (className に mb-4 を含む div) が存在しない", () => {
      const { container } = renderWithLocale(
        <MemberGroupSorter
          categories={["catA", "catB"]}
          activeCategory={null}
          onToggle={vi.fn()}
        />,
      );
      // 旧実装: <div className="mb-4 flex items-center gap-2 flex-wrap"> でラップしていた。
      // Fragment 化後はこの wrapper div 自体が存在しない (レイアウトは呼び出し側に委譲される)。
      expect(container.querySelector("div.mb-4")).toBeNull();
      // ラベルとカテゴリボタンは (ラップ無しで) レンダリングされている
      expect(screen.getByText("グループ表示:")).toBeInTheDocument();
      expect(screen.getByText("catA")).toBeInTheDocument();
      expect(screen.getByText("catB")).toBeInTheDocument();
    });

    it("カテゴリ数と同数のボタンが厳密に存在する (2件)", () => {
      renderWithLocale(
        <MemberGroupSorter
          categories={["catA", "catB"]}
          activeCategory={null}
          onToggle={vi.fn()}
        />,
      );
      expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("getCategoryLabel が渡された場合、変換後のラベルで表示され toggle は元のカテゴリ値で呼ばれる", async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      renderWithLocale(
        <MemberGroupSorter
          categories={["__gender__"]}
          activeCategory={null}
          onToggle={onToggle}
          getCategoryLabel={(c) => (c === "__gender__" ? "性別" : c)}
        />,
      );
      const button = screen.getByRole("button", { name: "性別" });
      await user.click(button);
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith("__gender__");
    });
  });
});
