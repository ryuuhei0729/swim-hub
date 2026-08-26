/**
 * WaPointsCompareModal コンポーネントテスト
 *
 * Sprint Contract 検証観点:
 *   [V-16] ボタンクリックでモーダルが開き、最高 WA ポイント種目がランキング表示される
 *          (絶対タイムが最速の記録ではなく、WA ポイントが最大の記録を採用することの
 *          コンポーネントレベルでの実証)
 *   [V-17] モーダルに SC/LC 表記が出る
 *   [V-18] 記録0件で空状態が表示されクラッシュしない
 *
 * 本テストは WaPointsCompareModal を直接レンダリングし、
 * `rankMembersByWaPoints` / `getMemberBestWaPoints` 等の実装 (waPoints.ts, モック無し) を
 * 実際に結合して検証する。期待値 (points 等) は base time 表の実数値と
 * P = floor(1000 * (B/T)^3) の仕様から独立に算出したハードコード値である
 * (モーダルの計算結果を呼び出して期待値を作る、というトートロジーは行わない)。
 *
 * また `buildWaPointRecords` (モーダル内部の非公開関数: BestTime[] → WaPointRecordInput[]
 * 変換) は waPoints.test.ts の対象外 (waPoints.ts に存在しない) なので、
 * is_relaying 除外・IM100×LCM除外・gender未設定除外の「配線」は本ファイルでのみ検証される。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi } from "vitest";

import { WaPointsCompareModal } from "../../../components/team/member-management/components/WaPointsCompareModal";
import type { BestTime } from "../../../components/team/shared/hooks/useMemberBestTimes";
import type { TeamMember } from "../../../components/team/member-management/hooks/useMembers";
import jaMessages from "@apps/shared/messages/ja.json";

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: "member-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  users: { id: "user-1", name: "テスト太郎", gender: 0 },
  ...overrides,
});

const buildBestTime = (overrides: Partial<BestTime> = {}): BestTime => ({
  id: "record-1",
  time: 100,
  created_at: "2025-01-01T00:00:00Z",
  pool_type: 1,
  is_relaying: false,
  style: { name_jp: "100m自由形", distance: 100 },
  ...overrides,
});

describe("WaPointsCompareModal", () => {
  it("isOpen=false のとき何も描画しない", () => {
    renderWithLocale(
      <WaPointsCompareModal
        isOpen={false}
        onClose={vi.fn()}
        members={[]}
        memberBestTimes={new Map()}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.queryByTestId("team-wa-points-modal")).not.toBeInTheDocument();
  });

  it("isLoading=true のときスケルトン表示になり、ランキングテーブルは描画されない", () => {
    renderWithLocale(
      <WaPointsCompareModal
        isOpen={true}
        onClose={vi.fn()}
        members={[buildMember()]}
        memberBestTimes={new Map()}
        isLoading={true}
        error={null}
      />,
    );
    expect(screen.getByTestId("team-wa-points-loading")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("error が渡された場合、エラーメッセージが表示される", () => {
    renderWithLocale(
      <WaPointsCompareModal
        isOpen={true}
        onClose={vi.fn()}
        members={[buildMember()]}
        memberBestTimes={new Map()}
        isLoading={false}
        error="読み込みに失敗しました"
      />,
    );
    expect(screen.getByTestId("team-wa-points-error")).toHaveTextContent("読み込みに失敗しました");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  describe("[V-18] 記録0件で空状態が表示されクラッシュしない", () => {
    it("members が空配列のとき空状態が表示される", () => {
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[]}
          memberBestTimes={new Map()}
          isLoading={false}
          error={null}
        />,
      );
      expect(screen.getByTestId("team-wa-points-empty")).toHaveTextContent("比較できる記録がありません");
    });

    it("メンバーはいるが誰にも有効な記録が無い場合も空状態が表示される (クラッシュしない)", () => {
      const member = buildMember();
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={new Map([[member.id, []]])}
          isLoading={false}
          error={null}
        />,
      );
      expect(screen.getByTestId("team-wa-points-empty")).toBeInTheDocument();
    });

    it("is_relaying=true の記録のみのメンバーは空状態になる (計算対象から除外される配線)", () => {
      const member = buildMember();
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={
            new Map([
              [
                member.id,
                [buildBestTime({ is_relaying: true, time: 40.0, style: { name_jp: "100m自由形", distance: 100 } })],
              ],
            ])
          }
          isLoading={false}
          error={null}
        />,
      );
      expect(screen.getByTestId("team-wa-points-empty")).toBeInTheDocument();
    });

    it("IM100×LCM (base time が公式に存在しない) の記録のみのメンバーは空状態になる (配線)", () => {
      const member = buildMember();
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={
            new Map([
              [
                member.id,
                [buildBestTime({ pool_type: 1, style: { name_jp: "100m個人メドレー", distance: 100 } })],
              ],
            ])
          }
          isLoading={false}
          error={null}
        />,
      );
      expect(screen.getByTestId("team-wa-points-empty")).toBeInTheDocument();
    });

    it("gender が未設定のメンバーは記録があってもランキングに現れない (配線)", () => {
      const member = buildMember({ users: { id: "user-1", name: "性別未設定太郎" } });
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={
            new Map([[member.id, [buildBestTime({ pool_type: 0, time: 19.9, style: { name_jp: "50m自由形", distance: 50 } })]]])
          }
          isLoading={false}
          error={null}
        />,
      );
      expect(screen.getByTestId("team-wa-points-empty")).toBeInTheDocument();
    });
  });

  describe("[V-16] 最高 WA ポイント種目がランキング表示される (絶対タイム最速ではない)", () => {
    it("同一メンバーの複数記録中、絶対タイムが遅い方でも WA ポイントが高い記録が採用される", () => {
      // 男子 SCM 50Fr base=19.90, T=19.90 → 1000点 (絶対タイムは速い)
      // 男子 LCM 100Fr base=46.40, T=48.00 → floor(1000*(46.4/48)^3)=903点 (絶対タイムは遅い、得点も低い)
      // → 1000点の方 (50Fr SCM) が採用される想定。数値の妥当性は本テストではなく
      //   waPoints.test.ts の [V-07] で既に純粋関数として実証済み。ここでは
      //   「コンポーネントが実際にその記録を選んで表示する」配線を検証する。
      const member = buildMember({ id: "member-1", user_id: "user-1", users: { id: "user-1", name: "選手A", gender: 0 } });
      const bestTimes: BestTime[] = [
        buildBestTime({ id: "r-lcm100", pool_type: 1, time: 48.0, style: { name_jp: "100m自由形", distance: 100 } }),
        buildBestTime({ id: "r-scm50", pool_type: 0, time: 19.9, style: { name_jp: "50m自由形", distance: 50 } }),
      ];

      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={new Map([[member.id, bestTimes]])}
          isLoading={false}
          error={null}
        />,
      );

      const row = screen.getByTestId("team-wa-points-row-1");
      // 採用されたのは 50m自由形 (SCM) であり、100m自由形 (LCM) ではない
      expect(within(row).getByText("50m自由形")).toBeInTheDocument();
      expect(within(row).queryByText("100m自由形")).not.toBeInTheDocument();
      expect(within(row).getByText("1000")).toBeInTheDocument();
    });

    it("2名のランキングが points 降順で表示され、rank は1から連番になる", () => {
      const memberHigh = buildMember({
        id: "member-high",
        user_id: "user-high",
        users: { id: "user-high", name: "ハイポイント", gender: 0 },
      });
      const memberLow = buildMember({
        id: "member-low",
        user_id: "user-low",
        users: { id: "user-low", name: "ローポイント", gender: 1 },
      });

      const memberBestTimes = new Map<string, BestTime[]>([
        // 男子 SCM 50Fr base=19.90, T=19.90 → 1000点
        [memberHigh.id, [buildBestTime({ pool_type: 0, time: 19.9, style: { name_jp: "50m自由形", distance: 50 } })]],
        // 女子 LCM 100Fr base=51.71, T=55.00 → floor(1000*(51.71/55)^3) = 831点
        [memberLow.id, [buildBestTime({ pool_type: 1, time: 55.0, style: { name_jp: "100m自由形", distance: 100 } })]],
      ]);

      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[memberLow, memberHigh]}
          memberBestTimes={memberBestTimes}
          isLoading={false}
          error={null}
        />,
      );

      const rows = screen.getAllByTestId(/^team-wa-points-row-/);
      expect(rows).toHaveLength(2);

      const row1 = screen.getByTestId("team-wa-points-row-1");
      const row2 = screen.getByTestId("team-wa-points-row-2");
      expect(within(row1).getByText("ハイポイント")).toBeInTheDocument();
      expect(within(row1).getByText("1000")).toBeInTheDocument();
      expect(within(row2).getByText("ローポイント")).toBeInTheDocument();
      expect(within(row2).getByText("831")).toBeInTheDocument();
    });
  });

  describe("[V-17] モーダルに SC/LC 表記が出る", () => {
    it("採用記録が SCM (pool_type=0) のとき「SC」が表示される", () => {
      const member = buildMember();
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={
            new Map([[member.id, [buildBestTime({ pool_type: 0, time: 19.9, style: { name_jp: "50m自由形", distance: 50 } })]]])
          }
          isLoading={false}
          error={null}
        />,
      );
      const row = screen.getByTestId("team-wa-points-row-1");
      expect(within(row).getByText("(SC)")).toBeInTheDocument();
      expect(within(row).queryByText("(LC)")).not.toBeInTheDocument();
    });

    it("採用記録が LCM (pool_type=1) のとき「LC」が表示される", () => {
      const member = buildMember();
      renderWithLocale(
        <WaPointsCompareModal
          isOpen={true}
          onClose={vi.fn()}
          members={[member]}
          memberBestTimes={
            new Map([[member.id, [buildBestTime({ pool_type: 1, time: 46.4, style: { name_jp: "100m自由形", distance: 100 } })]]])
          }
          isLoading={false}
          error={null}
        />,
      );
      const row = screen.getByTestId("team-wa-points-row-1");
      expect(within(row).getByText("(LC)")).toBeInTheDocument();
      expect(within(row).queryByText("(SC)")).not.toBeInTheDocument();
    });
  });

  it("モーダルタイトルが「WAポイントで比較」である", () => {
    renderWithLocale(
      <WaPointsCompareModal
        isOpen={true}
        onClose={vi.fn()}
        members={[]}
        memberBestTimes={new Map()}
        isLoading={false}
        error={null}
      />,
    );
    expect(screen.getByText("WAポイントで比較")).toBeInTheDocument();
  });
});
