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
import { Text, PanResponder, type MockGestureState } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "../BottomSheet";

/**
 * BottomSheet が生成した PanResponder の設定を取り出す。
 * react-native モックの `PanResponder.create` は設定を `__config` として公開している。
 */
const capturePanConfig = () => {
  const spy = vi.spyOn(PanResponder, "create");
  return () => {
    expect(spy).toHaveBeenCalledTimes(1);
    return spy.mock.results[0].value.__config;
  };
};

const gesture = (overrides: Partial<MockGestureState> = {}): MockGestureState => ({
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  ...overrides,
});

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

  it("背面を暗くするオーバーレイの背景色を持たない", () => {
    const { container } = render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
        <Text>本文</Text>
      </BottomSheet>,
    );
    // 半透明の黒 (rgba(0,0,0,...)) を敷いている要素が存在しないこと
    const dimmed = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
      el.style.backgroundColor.replace(/\s/g, "").startsWith("rgba(0,0,0"),
    );
    expect(dimmed).toEqual([]);
  });

  describe("ヘッダーの下スワイプ", () => {
    it("タップ(移動なし)ではドラッグを開始しない", () => {
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      const config = getConfig();
      expect(config.onStartShouldSetPanResponder?.()).toBe(false);
      expect(config.onMoveShouldSetPanResponder?.({}, gesture({ dy: 3 }))).toBe(false);
    });

    it("横方向が優勢な移動ではドラッグを開始しない", () => {
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      expect(getConfig().onMoveShouldSetPanResponder?.({}, gesture({ dy: 20, dx: 40 }))).toBe(
        false,
      );
    });

    it("上方向へのスワイプではドラッグを開始しない", () => {
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      expect(getConfig().onMoveShouldSetPanResponder?.({}, gesture({ dy: -40 }))).toBe(false);
    });

    it("下方向へ十分に移動するとドラッグを開始する", () => {
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      expect(getConfig().onMoveShouldSetPanResponder?.({}, gesture({ dy: 20 }))).toBe(true);
    });

    it("十分な距離を下へドラッグして離すと onClose が呼ばれる", () => {
      const onClose = vi.fn();
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={onClose} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      getConfig().onPanResponderRelease?.({}, gesture({ dy: 120 }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("距離が足りなくても下方向の速いフリックなら onClose が呼ばれる", () => {
      const onClose = vi.fn();
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={onClose} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      getConfig().onPanResponderRelease?.({}, gesture({ dy: 20, vy: 1.5 }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("距離も速度も足りない場合は閉じない(元の位置へ戻す)", () => {
      const onClose = vi.fn();
      const getConfig = capturePanConfig();
      render(
        <BottomSheet isOpen={true} onClose={onClose} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      getConfig().onPanResponderRelease?.({}, gesture({ dy: 30, vy: 0.1 }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("再レンダリングで onClose が差し替わっても最新のものを呼ぶ", () => {
      const firstOnClose = vi.fn();
      const secondOnClose = vi.fn();
      const getConfig = capturePanConfig();
      const { rerender } = render(
        <BottomSheet isOpen={true} onClose={firstOnClose} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      rerender(
        <BottomSheet isOpen={true} onClose={secondOnClose} title="タイトル">
          <Text>本文</Text>
        </BottomSheet>,
      );
      getConfig().onPanResponderRelease?.({}, gesture({ dy: 120 }));
      expect(firstOnClose).not.toHaveBeenCalled();
      expect(secondOnClose).toHaveBeenCalledTimes(1);
    });
  });
});
