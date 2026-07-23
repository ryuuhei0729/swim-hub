/**
 * PracticeLogCard テスト
 *
 * 2026-07-22 Sprint: カードレイアウト刷新(横幅活用+強弱、平均タイムを右ヒーロー化)。
 * ロジック不変・純粋な表示変更のため、既存の CompetitionClient/PracticeClient レベルの
 * 統合テストとは別に、カード単体で「情報欠落なし」「average===null 時のレイアウト非破壊」
 * を直接検証する。
 *
 * Sprint Contract 検証観点(コーディネーター指示):
 *   - 日付/場所/距離×本数×セット/サークル/種目/タグ/平均タイム/ノートが全て描画される
 *   - average===null のとき右ヒーロー(平均タイム)が非表示になり、
 *     平均タイムラベルも出ない(レイアウトが壊れない=クラッシュしないことも含む)
 *   - カードクリック→onClick(log) が呼ばれる(既存詳細モーダル導線の配線非退行)
 *
 * トートロジー防止メモ: 実装の JSX 構造をなぞるのではなく、「見えるべき情報」の
 * 仕様(コーディネーター指示のレイアウト定義)から導いた期待値を検証する。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeTag, PracticeTime } from "@apps/shared/types";
import PracticeLogCard from "../PracticeLogCard";
import type { PracticeLogWithFormattedData } from "../../_utils/practiceLogFormat";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const tagA: PracticeTag = {
  id: "tag-a",
  user_id: "user-1",
  name: "タグA",
  color: "#111111",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const makeLog = (
  overrides: Partial<PracticeLogWithFormattedData> = {},
): PracticeLogWithFormattedData =>
  ({
    id: "log-1",
    user_id: "user-1",
    practice_id: "practice-1",
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: [],
    tags: [],
    practice: {
      id: "practice-1",
      date: "2026-07-01",
      title: null,
      place: "市民プール",
      note: null,
      team_id: null,
    },
    practiceId: "practice-1",
    ...overrides,
  }) as PracticeLogWithFormattedData;

describe("PracticeLogCard", () => {
  describe("情報欠落なし(2026-07-22 レイアウト刷新後)", () => {
    it("日付/場所/距離×本数×セット/サークル/種目が全て描画される", () => {
      renderWithIntl(<PracticeLogCard log={makeLog()} onClick={vi.fn()} />);

      expect(screen.getByText(/2026\/07\/01/)).toBeInTheDocument();
      expect(screen.getByText(/市民プール/)).toBeInTheDocument();
      expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
      expect(screen.getByText("1'30\"")).toBeInTheDocument(); // circle=90秒
      // 2026-07-22 大会カードとのパリティ対応: 種目は生コード("Fr")ではなく
      // 翻訳名("自由形")で表示される(getStyleLabel、PracticeDetails.tsx と同方式)
      expect(screen.getByText("自由形")).toBeInTheDocument();
    });

    it("日付に年(yyyy)が含まれる形式(yyyy/MM/dd)で表示される(2026-07-22 小修正)", () => {
      renderWithIntl(<PracticeLogCard log={makeLog()} onClick={vi.fn()} />);

      // 日付・場所は "yyyy/MM/dd · 場所名" の形で同一 div にまとめて描画されるため、
      // 部分一致でその div のテキスト全体から年が含まれる形式であることを確認する
      const dateAndPlace = screen.getByText(/2026\/07\/01/);
      expect(dateAndPlace.textContent).toMatch(/^\d{4}\/\d{2}\/\d{2}/);
    });

    it("タグが1件以上ある場合、タグチップが描画される", () => {
      renderWithIntl(
        <PracticeLogCard
          log={makeLog({
            tags: [tagA],
            practice_log_tags: [{ practice_tag_id: tagA.id, practice_tags: tagA }],
          })}
          onClick={vi.fn()}
        />,
      );

      expect(screen.getByText("タグA")).toBeInTheDocument();
    });

    it("ノートがある場合、ノートテキストが描画される", () => {
      renderWithIntl(
        <PracticeLogCard log={makeLog({ note: "調子が良かった" })} onClick={vi.fn()} />,
      );

      expect(screen.getByText("調子が良かった")).toBeInTheDocument();
    });

    it(
      "[2026-07-22 小修正] タグが複数あってもノートが独立フル幅行として潰れず表示される" +
        "(ノートをタグ行から分離した回帰防止)",
      () => {
        const tagB: PracticeTag = {
          id: "tag-b",
          user_id: "user-1",
          name: "タグB",
          color: "#222222",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        };

        renderWithIntl(
          <PracticeLogCard
            log={makeLog({
              tags: [tagA, tagB],
              practice_log_tags: [
                { practice_tag_id: tagA.id, practice_tags: tagA },
                { practice_tag_id: tagB.id, practice_tags: tagB },
              ],
              note: "タグが複数あってもこのノートは見えるはず",
            })}
            onClick={vi.fn()}
          />,
        );

        // タグ2件・ノートともに欠落なく取得できる(ノートがタグ行に埋もれて消えていない)
        expect(screen.getByText("タグA")).toBeInTheDocument();
        expect(screen.getByText("タグB")).toBeInTheDocument();
        const noteText = screen.getByText("タグが複数あってもこのノートは見えるはず");
        expect(noteText).toBeInTheDocument();

        // ノートは独立フル幅行(タグ chip の <span> と同じ行に同居しない)であることを
        // 確認する: ノートテキストを含む要素自身の中にタグ用の <span> が含まれていないこと
        // (旧レイアウトはタグ chip とノートが同じ flex 行の中に同居していたため、
        // ノートが truncate で潰れて見えなくなる問題があった)
        expect(noteText.querySelector("span")).toBeNull();
        expect(noteText.tagName).toBe("DIV");
      },
    );

    it("タグもノートも無い場合、その行自体が描画されずクラッシュしない", () => {
      expect(() =>
        renderWithIntl(<PracticeLogCard log={makeLog({ tags: [], note: null })} onClick={vi.fn()} />),
      ).not.toThrow();
      expect(screen.queryByText("タグA")).not.toBeInTheDocument();
    });

    it("circle が 0/未設定のとき「-」表示になる(欠落なくフォールバック表示される)", () => {
      renderWithIntl(<PracticeLogCard log={makeLog({ circle: 0 })} onClick={vi.fn()} />);

      // 距離フォーマットの隣に "-" (サークル欠落時のフォールバック) が存在する
      const distanceText = screen.getByText("100m × 4本 × 1セット");
      expect(distanceText.parentElement?.textContent).toContain("-");
    });
  });

  describe("大会カードとのパリティ(2026-07-22 回帰防止)", () => {
    it("カードルートに rounded-none sm:rounded-lg と p-3 sm:p-4 が付与される(スマホ幅で全幅・角なし)", () => {
      renderWithIntl(<PracticeLogCard log={makeLog()} onClick={vi.fn()} />);

      const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
      expect(card.className).toContain("rounded-none");
      expect(card.className).toContain("sm:rounded-lg");
      expect(card.className).toContain("p-3");
      expect(card.className).toContain("sm:p-4");
    });

    it("種目は生コードでなく翻訳名で表示される(getStyleLabel、大会カードと同方式)", () => {
      renderWithIntl(<PracticeLogCard log={makeLog({ style: "Br" })} onClick={vi.fn()} />);

      expect(screen.queryByText("Br")).not.toBeInTheDocument();
      expect(screen.getByText("平泳ぎ")).toBeInTheDocument();
    });

    it("未知の種目コードは翻訳キーが無いためそのままフォールバック表示される", () => {
      renderWithIntl(<PracticeLogCard log={makeLog({ style: "XX" })} onClick={vi.fn()} />);

      expect(screen.getByText("XX")).toBeInTheDocument();
    });
  });

  describe("平均タイム(右ヒーロー): average===null 時の非表示・非破壊", () => {
    it("practice_times が空の場合、平均タイムヒーロー・ラベルとも表示されない", () => {
      renderWithIntl(<PracticeLogCard log={makeLog({ practice_times: [] })} onClick={vi.fn()} />);

      expect(screen.queryByText("平均タイム:")).not.toBeInTheDocument();
    });

    it("practice_times が全て無効値(0以下)の場合も average は null 扱いになり非表示のまま", () => {
      const invalidTimes: PracticeTime[] = [
        {
          id: "t1",
          user_id: "user-1",
          practice_log_id: "log-1",
          distance: 100,
          time: 0,
          set_number: 1,
          rep_number: 1,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
        } as PracticeTime,
      ];

      renderWithIntl(
        <PracticeLogCard log={makeLog({ practice_times: invalidTimes })} onClick={vi.fn()} />,
      );

      expect(screen.queryByText("平均タイム:")).not.toBeInTheDocument();
    });

    it("有効な practice_times がある場合、平均タイムヒーロー(ラベル+数値)が表示される", () => {
      const validTimes: PracticeTime[] = [
        {
          id: "t1",
          user_id: "user-1",
          practice_log_id: "log-1",
          distance: 100,
          time: 90,
          set_number: 1,
          rep_number: 1,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
        } as PracticeTime,
      ];

      renderWithIntl(
        <PracticeLogCard log={makeLog({ practice_times: validTimes })} onClick={vi.fn()} />,
      );

      expect(screen.getByText("平均タイム:")).toBeInTheDocument();
      expect(screen.getByText("1:30.00")).toBeInTheDocument();
    });

    it(
      "average===null でも情報欠落なし(日付/種目等)は保たれ、右ヒーロー部分だけが" +
        "欠落する(レイアウトの片側だけが壊れて他の情報まで消えないこと)",
      () => {
        renderWithIntl(<PracticeLogCard log={makeLog({ practice_times: [] })} onClick={vi.fn()} />);

        // 右ヒーローは無いが、左側の情報は引き続きすべて表示される
        expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
        // 2026-07-22 大会カードとのパリティ対応: 種目は翻訳名("自由形")で表示される
        expect(screen.getByText("自由形")).toBeInTheDocument();
        expect(screen.queryByText("平均タイム:")).not.toBeInTheDocument();
      },
    );
  });

  describe("クリック導線(既存詳細モーダルへの非退行)", () => {
    it("カードクリックで onClick(log) が呼ばれる", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      const log = makeLog();
      renderWithIntl(<PracticeLogCard log={log} onClick={onClick} />);

      await user.click(screen.getByRole("button", { name: /^練習詳細を表示\(/ }));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(log);
    });

    it("Enterキーでも onClick(log) が呼ばれる(キーボードアクセシビリティ)", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      const log = makeLog();
      renderWithIntl(<PracticeLogCard log={log} onClick={onClick} />);

      const card = screen.getByRole("button", { name: /^練習詳細を表示\(/ });
      card.focus();
      await user.keyboard("{Enter}");

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(log);
    });
  });
});
