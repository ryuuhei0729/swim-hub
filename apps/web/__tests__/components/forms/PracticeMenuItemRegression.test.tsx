/**
 * PracticeMenuItem 回帰テスト (V-08)
 *
 * Sprint Contract 検証観点:
 *   SelectChips を PracticeMenuItem.tsx から SelectChips.tsx に切り出し、
 *   かつ DISTANCE_PRESETS を types.ts に移動した後、
 *   本体の練習ログ入力フォーム（PracticeMenuItem）で
 *   種目・カテゴリ・距離選択が従来通り動作すること。
 *
 * NOTE: PracticeMenuItem は useTranslations を使うため renderWithI18n を使用。
 *       TagInput の Supabase 依存は vi.mock で分離。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n as render, screen, fireEvent } from "../../utils/render";
import PracticeMenuItem from "../../../components/forms/practice-log/components/PracticeMenuItem";
import type { PracticeMenu, Tag } from "../../../components/forms/practice-log/types";

// TagInput は Supabase 接続を持つためモック
vi.mock("../../../components/forms/TagInput", () => ({
  default: () => <div data-testid="tag-input-mock" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const DEFAULT_MENU: PracticeMenu = {
  id: "test-menu-1",
  style: "Fr",
  swimCategory: "Swim",
  distance: 100,
  reps: 4,
  sets: 1,
  circleMin: 1,
  circleSec: 30,
  note: "",
  tags: [],
  times: [],
};

const DEFAULT_PROPS = {
  menu: DEFAULT_MENU,
  menuIndex: 0,
  canRemove: false,
  availableTags: [] as Tag[],
  isLoading: false,
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  onTagsChange: vi.fn(),
  onAvailableTagsUpdate: vi.fn(),
  onOpenTimeModal: vi.fn(),
};

describe("PracticeMenuItem - SelectChips 切り出し + DISTANCE_PRESETS 移動後の回帰 (V-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("種目チップ (SWIM_STYLES)", () => {
    it("Fr/Ba/Br/Fly/IM の 5 種のチップが表示されること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-style-Fr")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-Ba")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-Br")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-Fly")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-IM")).toBeInTheDocument();
    });

    it("デフォルト(Fr)チップが aria-pressed=true（選択状態）であること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-style-Fr")).toHaveAttribute("aria-pressed", "true");
    });

    it("非選択チップが aria-pressed=false であること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-style-Ba")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("practice-style-Br")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("practice-style-Fly")).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByTestId("practice-style-IM")).toHaveAttribute("aria-pressed", "false");
    });

    it("Ba チップをクリックすると onUpdate('style', 'Ba') が呼ばれること", () => {
      const onUpdate = vi.fn();
      render(<PracticeMenuItem {...DEFAULT_PROPS} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("practice-style-Ba"));
      expect(onUpdate).toHaveBeenCalledWith("style", "Ba");
    });

    it("Fly チップをクリックすると onUpdate('style', 'Fly') が呼ばれること", () => {
      const onUpdate = vi.fn();
      render(<PracticeMenuItem {...DEFAULT_PROPS} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("practice-style-Fly"));
      expect(onUpdate).toHaveBeenCalledWith("style", "Fly");
    });

    it("menu.style='Ba' のとき Ba チップが選択状態（aria-pressed=true）であること", () => {
      render(
        <PracticeMenuItem
          {...DEFAULT_PROPS}
          menu={{ ...DEFAULT_MENU, style: "Ba" }}
        />,
      );

      expect(screen.getByTestId("practice-style-Ba")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("practice-style-Fr")).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("カテゴリチップ (SWIM_CATEGORIES)", () => {
    it("Swim/Pull/Kick の 3 種のチップが表示されること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-swim-category-Swim")).toBeInTheDocument();
      expect(screen.getByTestId("practice-swim-category-Pull")).toBeInTheDocument();
      expect(screen.getByTestId("practice-swim-category-Kick")).toBeInTheDocument();
    });

    it("デフォルト(Swim)チップが aria-pressed=true（選択状態）であること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-swim-category-Swim")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("Kick チップをクリックすると onUpdate('swimCategory', 'Kick') が呼ばれること", () => {
      const onUpdate = vi.fn();
      render(<PracticeMenuItem {...DEFAULT_PROPS} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("practice-swim-category-Kick"));
      expect(onUpdate).toHaveBeenCalledWith("swimCategory", "Kick");
    });

    it("menu.swimCategory='Pull' のとき Pull チップが選択状態であること", () => {
      render(
        <PracticeMenuItem
          {...DEFAULT_PROPS}
          menu={{ ...DEFAULT_MENU, swimCategory: "Pull" }}
        />,
      );

      expect(screen.getByTestId("practice-swim-category-Pull")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByTestId("practice-swim-category-Swim")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });

  describe("距離プリセット (DISTANCE_PRESETS from types.ts)", () => {
    it("25/50/100/200 の 4 つのプリセットチップが表示されること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-distance-preset-25")).toBeInTheDocument();
      expect(screen.getByTestId("practice-distance-preset-50")).toBeInTheDocument();
      expect(screen.getByTestId("practice-distance-preset-100")).toBeInTheDocument();
      expect(screen.getByTestId("practice-distance-preset-200")).toBeInTheDocument();
    });

    it("menu.distance=100 のとき 100 チップが選択状態（aria-pressed=true）であること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} menu={{ ...DEFAULT_MENU, distance: 100 }} />);

      expect(screen.getByTestId("practice-distance-preset-100")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("「その他」ボタンが表示されること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      expect(screen.getByTestId("practice-distance-other")).toBeInTheDocument();
    });

    it("距離がプリセット外(400)のとき showCustomDistance=true で input が初期表示されること", () => {
      render(
        <PracticeMenuItem
          {...DEFAULT_PROPS}
          menu={{ ...DEFAULT_MENU, distance: 400 }}
        />,
      );

      expect(screen.getByTestId("practice-distance")).toBeInTheDocument();
      expect(screen.queryByTestId("practice-distance-other")).not.toBeInTheDocument();
    });

    it("距離が空文字のとき showCustomDistance=true で input が初期表示されること", () => {
      render(
        <PracticeMenuItem
          {...DEFAULT_PROPS}
          menu={{ ...DEFAULT_MENU, distance: "" }}
        />,
      );

      expect(screen.getByTestId("practice-distance")).toBeInTheDocument();
    });

    it("「その他」ボタンをクリックすると input に切り替わること", () => {
      render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      fireEvent.click(screen.getByTestId("practice-distance-other"));

      expect(screen.getByTestId("practice-distance")).toBeInTheDocument();
      expect(screen.queryByTestId("practice-distance-other")).not.toBeInTheDocument();
    });

    it("プリセットチップをクリックすると onUpdate('distance', '100') が呼ばれること", () => {
      const onUpdate = vi.fn();
      render(<PracticeMenuItem {...DEFAULT_PROPS} onUpdate={onUpdate} />);

      fireEvent.click(screen.getByTestId("practice-distance-preset-50"));
      expect(onUpdate).toHaveBeenCalledWith("distance", "50");
    });
  });

  describe("SelectChips の role='group' コンテナ", () => {
    it("種目とカテゴリそれぞれに role='group' コンテナが存在すること", () => {
      const { container } = render(<PracticeMenuItem {...DEFAULT_PROPS} />);

      const groups = container.querySelectorAll('[role="group"]');
      expect(groups.length).toBeGreaterThanOrEqual(2);
    });
  });
});
