/**
 * BottomSheet テスト (Sprint Contract Phase B, mobile)
 *
 * 対象: `components/history/BottomSheet.tsx` (SortBottomSheet/FilterBottomSheet の土台)
 *
 * Sprint Contract 検証観点:
 *   - isOpen=false のとき何もレンダリングしない
 *   - isOpen=true のとき children/footer/title が表示される
 *
 * NOTE: ヘッダーの閉じるボタン(Feather "x" アイコンのみ・可視テキストなし)は、この
 * テスト環境の Pressable モック(accessibilityLabel を aria-label に変換しない)では
 * role+name で一意に特定できないため、明示的な close-icon クリックの検証は対象外とする
 * (実機/ブラウザでの目視確認事項として QA レポートに記載する)。
 */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "../BottomSheet";

describe("BottomSheet (mobile)", () => {
  it("isOpen=false のとき children を描画しない", () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="タイトル">
        <Text>中身のテキスト</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText("中身のテキスト")).toBeNull();
  });

  it("isOpen=true のとき children が描画される", () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
        <Text>中身のテキスト</Text>
      </BottomSheet>,
    );
    expect(screen.getByText("中身のテキスト")).toBeTruthy();
  });

  it("title が指定された場合、見出しとして表示される", () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="並べ替え">
        <Text>本文</Text>
      </BottomSheet>,
    );
    expect(screen.getByText("並べ替え")).toBeTruthy();
  });

  it("footer が指定された場合、children とは別に表示される", () => {
    render(
      <BottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="タイトル"
        footer={<Text>フッターの内容</Text>}
      >
        <Text>本文</Text>
      </BottomSheet>,
    );
    expect(screen.getByText("本文")).toBeTruthy();
    expect(screen.getByText("フッターの内容")).toBeTruthy();
  });

  it("footer が未指定の場合、フッター領域は描画されない", () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
        <Text>本文</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText("フッターの内容")).toBeNull();
  });
});
