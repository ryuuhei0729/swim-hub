/**
 * ImageViewerModal.test.tsx
 *
 * テスト観点 (Sprint Contract Bug 2):
 *   - Modal の表示/非表示が visible prop で制御されること
 *   - 複数画像を渡したとき初期インデックスが 0 となり「1/N」と表示されること
 *   - 「✕」閉じるボタンを押すと onClose が呼ばれること
 *   - 画像が 0 枚のとき表示が壊れないこと（空配列境界値）
 *   - 画像が 1 枚のとき「1/1」と表示されること（最小境界値）
 *   - initialIndex が指定されたとき、そのインデックスから表示されること
 *   - initialIndex が負数のとき 0 にクランプされること（下限境界値）
 *
 * トートロジー防止メモ:
 *   - 実装の内部状態を直接参照してはいけない
 *   - あくまでレンダリング結果（画面上の文字・コンポーネントの存在）で検証する
 *
 * 注意: 既存テスト群は @testing-library/react を使用している。
 *       @testing-library/react-native は react-test-renderer バージョン不整合により使用不可。
 *       react-native モックは __mocks__/react-native.ts にエイリアスされているが
 *       Dimensions が未実装のためここで追加モックする。
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Dimensions が react-native モックに存在しないため、モジュール内で上書き
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Modal: ({
      visible,
      children,
    }: { visible?: boolean; children?: React.ReactNode } & Record<string, unknown>) => {
      if (!visible) return null;
      return React.createElement("div", { "data-testid": "modal" }, children);
    },
    SafeAreaView: ({ children }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", {}, children),
  };
});

import { ImageViewerModal } from "../ImageViewerModal";

const MOCK_IMAGES = [
  { uri: "https://example.com/img1.jpg" },
  { uri: "https://example.com/img2.jpg" },
  { uri: "https://example.com/img3.jpg" },
];

describe("ImageViewerModal", () => {
  describe("表示制御", () => {
    it("visible=false のとき Modal は表示されない", () => {
      render(
        <ImageViewerModal images={MOCK_IMAGES} visible={false} onClose={vi.fn()} />,
      );
      // visible=false のときインデックス表示「1 / 3」が存在しないこと
      expect(screen.queryByText("1 / 3")).toBeNull();
    });

    it("visible=true のとき Modal が表示される", () => {
      render(
        <ImageViewerModal images={MOCK_IMAGES} visible={true} onClose={vi.fn()} />,
      );
      expect(screen.getByText("1 / 3")).toBeTruthy();
    });
  });

  describe("インデックス表示", () => {
    it("3枚の画像を渡したとき、初期表示は「1/3」と表示される", () => {
      render(<ImageViewerModal images={MOCK_IMAGES} visible={true} onClose={vi.fn()} />);
      expect(screen.getByText("1 / 3")).toBeTruthy();
    });

    it("1枚の画像のとき「1/1」と表示される（最小境界値）", () => {
      render(
        <ImageViewerModal
          images={[{ uri: "https://example.com/single.jpg" }]}
          visible={true}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText("1 / 1")).toBeTruthy();
    });

    it("空配列を渡してもクラッシュしない（空配列境界値）", () => {
      expect(() => {
        render(<ImageViewerModal images={[]} visible={true} onClose={vi.fn()} />);
      }).not.toThrow();
    });

    it("initialIndex=1 を渡すと「2/3」と表示される", () => {
      render(
        <ImageViewerModal
          images={MOCK_IMAGES}
          visible={true}
          initialIndex={1}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText("2 / 3")).toBeTruthy();
    });
  });

  describe("ナビゲーション（visible false→true 遷移で initialIndex が反映されること）", () => {
    it("visible を開き直して initialIndex=2 を指定すると「3 / 3」が表示される", () => {
      // Critical [3] の修正: useEffect が visible=false→true 遷移で setCurrentIndex を呼ぶことを検証
      // まず visible=false でレンダリングし（Modal は表示されない）
      const { rerender } = render(
        <ImageViewerModal images={MOCK_IMAGES} visible={false} onClose={vi.fn()} />,
      );
      // visible=true かつ initialIndex=2 に切り替えると「3 / 3」が表示される
      act(() => {
        rerender(
          <ImageViewerModal images={MOCK_IMAGES} visible={true} initialIndex={2} onClose={vi.fn()} />,
        );
      });
      expect(screen.getByText("3 / 3")).toBeTruthy();
    });

    it("visible を開き直して initialIndex=1 を指定すると「2 / 3」が表示される", () => {
      const { rerender } = render(
        <ImageViewerModal images={MOCK_IMAGES} visible={false} onClose={vi.fn()} />,
      );
      act(() => {
        rerender(
          <ImageViewerModal images={MOCK_IMAGES} visible={true} initialIndex={1} onClose={vi.fn()} />,
        );
      });
      expect(screen.getByText("2 / 3")).toBeTruthy();
    });

    it("visible を開き直して initialIndex を指定しない（または 0）のとき「1 / 3」が表示される", () => {
      const { rerender } = render(
        <ImageViewerModal images={MOCK_IMAGES} visible={false} onClose={vi.fn()} />,
      );
      act(() => {
        rerender(
          <ImageViewerModal images={MOCK_IMAGES} visible={true} onClose={vi.fn()} />,
        );
      });
      expect(screen.getByText("1 / 3")).toBeTruthy();
    });

    it("visible を開き直して initialIndex=-1（負数）を指定すると「1 / 3」に clamp される（下限境界値）", () => {
      const { rerender } = render(
        <ImageViewerModal images={MOCK_IMAGES} visible={false} onClose={vi.fn()} />,
      );
      act(() => {
        rerender(
          <ImageViewerModal images={MOCK_IMAGES} visible={true} initialIndex={-1} onClose={vi.fn()} />,
        );
      });
      expect(screen.getByText("1 / 3")).toBeTruthy();
    });
  });

  describe("閉じるボタン", () => {
    it("「✕」ボタンを押すと onClose が呼ばれる", () => {
      const onClose = vi.fn();
      render(<ImageViewerModal images={MOCK_IMAGES} visible={true} onClose={onClose} />);
      fireEvent.click(screen.getByText("✕"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("onClose が未指定でもボタン押下でクラッシュしない", () => {
      // onClose は required だが、実装側の防御コードを確認するため意図的に未指定にする
      render(
        // @ts-expect-error テスト用に onClose を未指定（required だが防御動作を検証）
        <ImageViewerModal images={MOCK_IMAGES} visible={true} />,
      );
      expect(() => fireEvent.click(screen.getByText("✕"))).not.toThrow();
    });
  });

  describe("画像レンダリング", () => {
    it("各画像の uri が expo-image の Image に渡される", () => {
      // vitest.setup.ts の expo-image モックは <img src={uri} /> を返す
      render(<ImageViewerModal images={MOCK_IMAGES} visible={true} onClose={vi.fn()} />);
      const images = screen.getAllByRole("img");
      // FlatList のレンダリングから少なくとも 1 枚以上存在すること
      expect(images.length).toBeGreaterThanOrEqual(1);
      const firstSrc = images[0].getAttribute("src");
      expect(firstSrc).toContain("https://example.com/");
    });
  });
});
