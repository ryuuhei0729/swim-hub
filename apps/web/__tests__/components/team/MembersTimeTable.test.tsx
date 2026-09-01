/**
 * MembersTimeTable コンポーネントテスト
 *
 * Sprint Contract 検証観点 (Phase A スケルトン):
 *   [V-01] 記録が存在するメンバー×種目×距離のセルに実タイムが表示される（「—」でない）
 *   [V-02] 記録が無い有効セルは「—」のまま
 *   [V-03] 種目ヘッダーが ja/en/zh/ko/de で正しく翻訳表示される
 *   [V-COL] 種目ヘッダーの列順が Option A（自由形/平泳ぎ/背泳ぎ/バタフライ/個人メドレー）であること
 *   [V-04] 距離ヘッダークリックでソート昇順→降順→解除が機能する（実フックとの結合）
 *   [V-05] 「引き継ぎを含む」トグル相当（getBestTimeForMember の戻り値差し替え）でセル表示が切り替わる
 *   [V-06] ソートボタンの aria-label が言語混在なく自然に表示される
 *   [V-08] 境界値: 無効な種目×距離の組み合わせは列として存在しない / グループヘッダー行 / メンバー0人
 *
 * ---------------------------------------------------------------------------
 * 追加スプリント (一括登録ツールチップ) Sprint Contract 検証観点:
 *   [V-BULK-01] competition が無く note がある記録は、ツールチップに note がそのまま表示され、
 *               「一括登録」ラベル (t("membersTimeTable.bulkEntryNote")) は表示されない
 *   [V-BULK-02] competition が無く note も無い記録は、ツールチップに「一括登録」ラベルが表示される
 *   [V-BULK-03] 象限A (2026-08-30 改訂): competition と note が両方ある記録は、
 *               大会名と note の両方が表示され「一括登録」ラベルは表示されない。
 *               (旧仕様は「note の有無に関わらず大会名のみ」という排他表示だったが、
 *               ユーザー要求「大会名がある場合：日付、大会名、備考全て表示」により反転した。
 *               旧テストはこのバグを仕様として pin していたため PM 判断で書き換えた)
 *   [V-BULK-04] D-3: competition.date と created_at が異なる日付の場合、ツールチップの日付は
 *               competition.date 側 (numeric フォーマット) が表示される。competition が無い場合は
 *               created_at 側が表示される
 *   [V-BULK-05] 引き継ぎ note 取り違え防止 (フック結合): includeRelaying=true で、引き継ぎなし記録の
 *               note と引き継ぎ記録の note が異なる fixture を用い、表示される note が引き継ぎ側で
 *               あることを assert する (短水路 pool_type=0 / 長水路 pool_type=1 の両分岐)
 *   [V-BULK-06] 引き継ぎありのみ (bestTimesByStyleAndPool に該当なし) の経路でも、note が
 *               そのまま (取り違えなく) ツールチップに載る (回帰防止)
 *   [V-BULK-07] 象限B (新設): competition があり note が無い記録は、大会名のみ表示され
 *               「一括登録」ラベルは表示されない
 *   [V-BULK-08] 境界値 (新設): note="" は note=undefined と同一の「無し」扱いになる。
 *               可視テキストは変わらないため getByText/queryByText では検出できず、
 *               container innerHTML の DOM 構造完全一致で検証する
 *
 * ## 根本原因の再現方法（最重要）
 * MembersTimeTable の `STYLES` が英語内部キー ["Fr","Ba","Br","Fly","IM"] のままだと、
 * `getBestTimeForMember(memberId, style, distance)` 呼び出し時に `style` として "Fr" 等が渡り、
 * 共有フック useMemberBestTimes 側で `` `${distance}m${style}` `` = "50mFr" を生成して
 * DB の `styles.name_jp`（例: "50m自由形"）と比較するため常に不一致 → 全セル null になる。
 *
 * 既存の `__tests__/hooks/useMemberBestTimes.test.ts` はフックを「自由形」のような正しい
 * 日本語キーで直接呼び出すため、このバグを検出できない（呼び出し側=MembersTimeTable の統合不具合のため）。
 *
 * そのため本ファイルは MembersTimeTable に **本物の useMemberBestTimes / useMemberSort を
 * 結合してレンダリング** し、「呼び出し側が正しい照合キーを渡しているか」を検証する。
 * MembersTimeTable 独自のスタブ照合関数は書かない（トートロジー回避）。
 *
 * ## モック方針
 * - next-intl は手書きの useTranslations モックを行わず、`NextIntlClientProvider` +
 *   実メッセージ JSON (`@apps/shared/messages/{locale}.json`) を使う。
 *   （`AuthForm.i18n.test.tsx` で、手書き useTranslations モックが複数 namespace の
 *   呼び出しパターンと食い違い describe.skip 化した反省を踏まえた選択）
 * - Supabase クライアントは `useMemberBestTimes.test.ts` と同じ mock ヘルパーを踏襲する。
 *
 * ## jsdom 描画可否の素振り結果
 * MembersTimeTable は TimeInputModal のような重い effect
 * （navigation-guard 等）を持たない純粋な表示コンポーネントであり、
 * jsdom 上で問題なくレンダリング可能なことを確認済み（Avatar は空状態でのみ描画され、
 * avatarUrl=null のため署名付きURL取得の非同期処理も発火しない）。
 * よって検証方法はコンポーネントテスト（Vitest + Testing Library）を採用する。
 */

import React, { useEffect, useState } from "react";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { MembersTimeTable } from "../../../components/team/member-management/components/MembersTimeTable";
import { useMemberBestTimes } from "../../../components/team/shared/hooks/useMemberBestTimes";
import type { BestTime } from "../../../components/team/shared/hooks/useMemberBestTimes";
import { useMemberSort } from "../../../components/team/member-management/hooks/useMemberSort";
import type { TeamMember } from "../../../components/team/member-management/hooks/useMembers";
import { formatTimeBest } from "@apps/shared/utils/time";
import { formatDate } from "@apps/shared/utils/date";
// useMemberBestTimes 自体が useTranslations を呼ぶため、renderHook 単体使用時は
// NextIntlClientProvider でラップする必要がある（実プロジェクトの既存規約に合わせ、
// 手書きモックではなく renderHookWithI18n ヘルパーを利用する）。
import { renderHookWithI18n } from "../../utils/render";

import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import zhMessages from "@apps/shared/messages/zh.json";
import koMessages from "@apps/shared/messages/ko.json";
import deMessages from "@apps/shared/messages/de.json";

type Locale = "ja" | "en" | "zh" | "ko" | "de";

const MESSAGES: Record<Locale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
  zh: zhMessages as unknown as AbstractIntlMessages,
  ko: koMessages as unknown as AbstractIntlMessages,
  de: deMessages as unknown as AbstractIntlMessages,
};

const renderWithLocale = (ui: React.ReactElement, locale: Locale = "ja") =>
  render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );

// useMemberBestTimes.test.ts と同じ Supabase モックヘルパー（重複実装せず踏襲）
const createMockSupabase = (mockData: unknown[] | null = [], mockError: Error | null = null) => {
  const mockOrder = vi.fn().mockResolvedValue({ data: mockData, error: mockError });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  return { from: mockFrom };
};

const buildMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: "member-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  users: { id: "user-1", name: "テスト太郎" },
  ...overrides,
});

// 有効な 種目×距離 の組み合わせ総数（無効組み合わせを除いた実セル数）
// 自由形(5) + 平泳ぎ(3) + 背泳ぎ(3) + バタフライ(3) + 個人メドレー(3) = 17
const VALID_CELL_COUNT = 17;

describe("MembersTimeTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------
  // [V-01] 根本原因の再現: 実 DB データ（日本語 name_jp）が実際にセルに表示される
  // ---------------------------------------------------------------------
  describe("[V-01] 記録が存在するセルに実タイムが表示される（統合バグ再現）", () => {
    it("name_jp が日本語のレコードから取得したベストタイムが表セルに表示される", async () => {
      const member = buildMember();
      const mockData = [
        {
          id: "record-1",
          time: 30.55,
          created_at: "2025-01-15T00:00:00Z",
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: "50m自由形", distance: 50 },
          competitions: null,
        },
      ];
      const mockSupabase = createMockSupabase(mockData, null);

      const { result } = renderHookWithI18n(() => useMemberBestTimes(mockSupabase as never));
      await act(async () => {
        await result.current.loadAllBestTimes([{ id: member.id, user_id: member.user_id }]);
      });

      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={result.current.getBestTimeForMember}
        />,
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatTimeBest(30.55))).toBeInTheDocument();
    });

    it("記録が存在するのは17セル中1セルのみなので、残り16セルは「—」のまま", async () => {
      const member = buildMember();
      const mockData = [
        {
          id: "record-1",
          time: 30.55,
          created_at: "2025-01-15T00:00:00Z",
          pool_type: 0,
          is_relaying: false,
          styles: { name_jp: "50m自由形", distance: 50 },
          competitions: null,
        },
      ];
      const mockSupabase = createMockSupabase(mockData, null);

      const { result } = renderHookWithI18n(() => useMemberBestTimes(mockSupabase as never));
      await act(async () => {
        await result.current.loadAllBestTimes([{ id: member.id, user_id: member.user_id }]);
      });

      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={result.current.getBestTimeForMember}
        />,
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).queryAllByText("—")).toHaveLength(VALID_CELL_COUNT - 1);
    });

    it("長水路(pool_type=1)の記録には L サフィックスが付く", async () => {
      const member = buildMember();
      const mockData = [
        {
          id: "record-1",
          time: 58.12,
          created_at: "2025-01-15T00:00:00Z",
          pool_type: 1,
          is_relaying: false,
          styles: { name_jp: "100m背泳ぎ", distance: 100 },
          competitions: null,
        },
      ];
      const mockSupabase = createMockSupabase(mockData, null);

      const { result } = renderHookWithI18n(() => useMemberBestTimes(mockSupabase as never));
      await act(async () => {
        await result.current.loadAllBestTimes([{ id: member.id, user_id: member.user_id }]);
      });

      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={result.current.getBestTimeForMember}
        />,
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatTimeBest(58.12))).toBeInTheDocument();
      expect(within(row).getByText("L")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-02] 記録が無い有効セルは「—」のまま（回帰なしの確認）
  // ---------------------------------------------------------------------
  describe("[V-02] 記録が無い有効セルは「—」のまま", () => {
    it("ベストタイムが1件も無いメンバーは全ての有効セルが「—」", () => {
      const member = buildMember({ id: "member-empty", user_id: "user-empty" });

      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getAllByText("—")).toHaveLength(VALID_CELL_COUNT);
    });
  });

  // ---------------------------------------------------------------------
  // [V-COL] 列順が Option A（リグレッション前の並び）であること
  // ---------------------------------------------------------------------
  describe("[V-COL] 種目ヘッダーの列順が Option A に復元されていること", () => {
    it.each<[Locale, string[]]>([
      ["ja", ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"]],
      ["en", ["Freestyle", "Breaststroke", "Backstroke", "Butterfly", "Individual Medley"]],
    ])("%s ロケールで 自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー の順に列が並ぶ", (locale, expected) => {
      const member = buildMember();
      const { container } = renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        locale,
      );

      // MembersTimeTable は必ず thead に1行以上のヘッダー行を描画する
      const headerRow = container.querySelectorAll("thead tr")[0]!;
      // 先頭の th はメンバー名列 (rowSpan=2) なので除外
      const styleHeaders = Array.from(headerRow.querySelectorAll("th")).slice(1);
      const texts = styleHeaders.map((th) => th.textContent?.trim());

      expect(texts).toEqual(expected);
    });
  });

  // ---------------------------------------------------------------------
  // [V-03] 種目ヘッダーが5言語で正しく翻訳表示される（回帰防止）
  // ---------------------------------------------------------------------
  describe("[V-03] 種目ヘッダーが ja/en/zh/ko/de で正しく翻訳表示される", () => {
    it.each<[Locale, string]>([
      ["ja", "自由形"],
      ["en", "Freestyle"],
      ["zh", "自由泳"],
      ["ko", "자유형"],
      ["de", "Freistil"],
    ])("%s ロケールで自由形の種目名が表示される", (locale, expectedLabel) => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        locale,
      );

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-06] aria-label が言語混在なく自然に表示される
  // ---------------------------------------------------------------------
  describe("[V-06] ソートボタンの aria-label が言語混在なく自然", () => {
    it("ja ロケールで自由形50mの aria-label が「自由形 50m でソート」になる", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      const button = screen.getByRole("button", { name: "自由形 50m でソート" });
      expect(button).toBeInTheDocument();
    });

    it("en ロケールで自由形50mの aria-label が「Sort by Freestyle 50m」になり、日本語が混入しない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "en",
      );

      const button = screen.getByRole("button", { name: "Sort by Freestyle 50m" });
      expect(button).toBeInTheDocument();
      // 日本語（ひらがな・カタカナ・漢字）が混入していないこと
      expect(button.getAttribute("aria-label")).not.toMatch(/[぀-ヿ一-鿿]/);
    });

    it("クリックすると onSort が翻訳前の照合キー（自由形）で呼ばれる", async () => {
      const user = userEvent.setup();
      const member = buildMember();
      const onSort = vi.fn();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={onSort}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      const button = screen.getByRole("button", { name: "自由形 50m でソート" });
      await user.click(button);

      expect(onSort).toHaveBeenCalledWith("自由形", 50);
    });
  });

  // ---------------------------------------------------------------------
  // [V-05] 引き継ぎ有無でセル表示が切り替わる
  //   (MembersTimeTable は getBestTimeForMember の戻り値をそのまま表示するだけなので、
  //    「引き継ぎを含む」トグル ON/OFF 相当を getBestTimeForMember の戻り値差し替えで再現する)
  // ---------------------------------------------------------------------
  describe("[V-05] 引き継ぎタイムの表示切り替え", () => {
    it("引き継ぎなしの結果が返るときは R サフィックスが付かない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "r1",
                  time: 26.0,
                  created_at: "2025-01-01T00:00:00Z",
                  pool_type: 0,
                  is_relaying: false,
                  style: { name_jp: "50m自由形", distance: 50 },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatTimeBest(26.0))).toBeInTheDocument();
      expect(within(row).queryByText("R")).not.toBeInTheDocument();
    });

    it("引き継ぎありの結果が返るときは R サフィックスが付く", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={true}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "r2",
                  time: 25.5,
                  created_at: "2025-01-01T00:00:00Z",
                  pool_type: 0,
                  is_relaying: true,
                  style: { name_jp: "50m自由形", distance: 50 },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatTimeBest(25.5))).toBeInTheDocument();
      expect(within(row).getByText("R")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-04] 距離ヘッダークリックでソート 未ソート→昇順→降順→解除 の3状態サイクルが機能する
  //   (本物の useMemberSort + useMemberBestTimes を結合し、1つの React ツリー内で検証)
  //
  //   本スプリントの対象: useMemberSort.handleSort を3状態サイクルに変更する。
  //   Phase A 時点 (このコミット) の実装はまだ変更されておらず、同一セル再クリック時に
  //   常に解除するのみで降順(desc)へ遷移するコードパスが存在しない
  //   （sortOrder は常に "asc" のまま）。そのため本テストは Developer 実装完了前は
  //   意図的に FAIL する「検出器」として書かれている。実装完了後にこのテストが
  //   green になることを Sprint Contract の完了条件とする。
  // ---------------------------------------------------------------------
  describe("[V-04] ソートの未ソート→昇順→降順→解除の3状態サイクル（実フック結合）", () => {
    // Harness: TeamMemberManagement.tsx と同様に useMemberBestTimes + useMemberSort を
    // 結合してから MembersTimeTable に渡す。onSort クリックの状態変化を同一ツリーで観測するため
    // renderHook 単体ではなく、1つのテスト用コンポーネントにまとめる。
    function Harness({
      members,
      mockSupabase,
    }: {
      members: TeamMember[];
      mockSupabase: ReturnType<typeof createMockSupabase>;
    }) {
      const { loadAllBestTimes, getBestTimeForMember } = useMemberBestTimes(mockSupabase as never);
      const { sortStyle, sortDistance, sortOrder, sortedMembers, groupHeaders, handleSort } =
        useMemberSort(members, getBestTimeForMember);
      const [loaded, setLoaded] = useState(false);

      useEffect(() => {
        loadAllBestTimes(members).then(() => setLoaded(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      if (!loaded) return null;

      return (
        <MembersTimeTable
          members={sortedMembers}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={sortStyle}
          sortDistance={sortDistance}
          sortOrder={sortOrder}
          isLoading={false}
          groupHeaders={groupHeaders}
          onSort={handleSort}
          onMemberClick={vi.fn()}
          getBestTimeForMember={getBestTimeForMember}
        />
      );
    }

    // 3人 + タイム未登録1人。時間を意図的に「非ソート順・非降順順」の並びで入力し、
    // unsorted / asc / desc の3状態がそれぞれ異なる並びになるようにする。
    // medium(30.0) は元の並びの先頭に置き、asc([fast,medium,slow])/desc([slow,medium,fast])
    // のどちらとも一致しない unsorted 状態を作る。
    const buildThreeMemberFixture = () => {
      const mediumMember = buildMember({
        id: "member-medium",
        user_id: "user-medium",
        users: { id: "user-medium", name: "中太郎" },
      });
      const slowMember = buildMember({
        id: "member-slow",
        user_id: "user-slow",
        users: { id: "user-slow", name: "遅い次郎" },
      });
      const fastMember = buildMember({
        id: "member-fast",
        user_id: "user-fast",
        users: { id: "user-fast", name: "速い三郎" },
      });
      const noTimeMember = buildMember({
        id: "member-none",
        user_id: "user-none",
        users: { id: "user-none", name: "未登録四郎" },
      });
      // 元の並び: medium, slow, fast, noTime
      const members = [mediumMember, slowMember, fastMember, noTimeMember];

      const dataByUser: Record<string, unknown[]> = {
        "user-medium": [
          {
            id: "r-medium",
            time: 30.0,
            created_at: "2025-01-01T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        "user-slow": [
          {
            id: "r-slow",
            time: 40.0,
            created_at: "2025-01-01T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        "user-fast": [
          {
            id: "r-fast",
            time: 25.0,
            created_at: "2025-01-01T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            styles: { name_jp: "50m自由形", distance: 50 },
            competitions: null,
          },
        ],
        "user-none": [],
      };

      const mockFrom = vi.fn((_table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, value: string) => ({
            order: vi.fn().mockResolvedValue({
              data: dataByUser[value] ?? [],
              error: null,
            }),
          })),
        })),
      }));
      const mockSupabase = { from: mockFrom };

      return { members, mockSupabase };
    };

    const getRowOrder = () =>
      screen.getAllByTestId(/^team-member-row-/).map((el) => el.getAttribute("data-testid"));

    it("1クリック目で昇順(速い順)、2クリック目で降順(遅い順)、3クリック目で解除され元の並びに戻る", async () => {
      const { members, mockSupabase } = buildThreeMemberFixture();
      renderWithLocale(<Harness members={members} mockSupabase={mockSupabase as never} />, "ja");

      await screen.findByTestId("team-member-row-member-medium");

      // 初期状態（未ソート）: 入力順そのまま。noTime メンバーも並び順を変えない。
      expect(getRowOrder()).toEqual([
        "team-member-row-member-medium",
        "team-member-row-member-slow",
        "team-member-row-member-fast",
        "team-member-row-member-none",
      ]);

      const sortButton = () => screen.getByRole("button", { name: "自由形 50m でソート" });

      // 1回目クリック: 昇順（速い順: fast, medium, slow）。未登録メンバーは末尾のまま。
      fireEvent.click(sortButton());
      expect(getRowOrder()).toEqual([
        "team-member-row-member-fast",
        "team-member-row-member-medium",
        "team-member-row-member-slow",
        "team-member-row-member-none",
      ]);
      expect(
        screen.getByRole("button", { name: "自由形 50m でソート（昇順）" }),
      ).toBeInTheDocument();
      expect(within(screen.getByRole("button", { name: /自由形 50m/ })).getByText("↑")).toBeInTheDocument();

      // 2回目クリック（同じセル）: 降順（遅い順: slow, medium, fast）。未登録メンバーは降順でも末尾。
      fireEvent.click(screen.getByRole("button", { name: "自由形 50m でソート（昇順）" }));
      expect(getRowOrder()).toEqual([
        "team-member-row-member-slow",
        "team-member-row-member-medium",
        "team-member-row-member-fast",
        "team-member-row-member-none",
      ]);
      const descButton = screen.getByRole("button", { name: "自由形 50m でソート（降順）" });
      expect(descButton).toBeInTheDocument();
      expect(within(descButton).getByText("↓")).toBeInTheDocument();

      // 3回目クリック（同じセル）: 解除 → 元の並び順に戻る
      fireEvent.click(descButton);
      expect(getRowOrder()).toEqual([
        "team-member-row-member-medium",
        "team-member-row-member-slow",
        "team-member-row-member-fast",
        "team-member-row-member-none",
      ]);
      expect(screen.getByRole("button", { name: "自由形 50m でソート" })).toBeInTheDocument();
    });

    it("境界値: 昇順状態で別セルをクリックすると、新セルは昇順から再開する（前セルは解除）", async () => {
      const { members, mockSupabase } = buildThreeMemberFixture();
      renderWithLocale(<Harness members={members} mockSupabase={mockSupabase as never} />, "ja");

      await screen.findByTestId("team-member-row-member-medium");

      fireEvent.click(screen.getByRole("button", { name: "自由形 50m でソート" }));
      expect(
        screen.getByRole("button", { name: "自由形 50m でソート（昇順）" }),
      ).toBeInTheDocument();

      // 別セル（自由形 100m）をクリック → 新セルが昇順、旧セル(50m)は解除されて無印に戻る
      fireEvent.click(screen.getByRole("button", { name: "自由形 100m でソート" }));
      expect(
        screen.getByRole("button", { name: "自由形 100m でソート（昇順）" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "自由形 50m でソート" })).toBeInTheDocument();
    });

    it("境界値: 降順状態で別セルをクリックすると、新セルは昇順から再開する（前セルは解除）", async () => {
      const { members, mockSupabase } = buildThreeMemberFixture();
      renderWithLocale(<Harness members={members} mockSupabase={mockSupabase as never} />, "ja");

      await screen.findByTestId("team-member-row-member-medium");

      // 自由形50mを昇順→降順まで進める
      fireEvent.click(screen.getByRole("button", { name: "自由形 50m でソート" }));
      fireEvent.click(screen.getByRole("button", { name: "自由形 50m でソート（昇順）" }));
      expect(
        screen.getByRole("button", { name: "自由形 50m でソート（降順）" }),
      ).toBeInTheDocument();

      // 降順状態から別セル（自由形 100m）をクリック → 新セルは昇順から再開、旧セル(50m)は解除されて無印に戻る
      fireEvent.click(screen.getByRole("button", { name: "自由形 100m でソート" }));
      expect(
        screen.getByRole("button", { name: "自由形 100m でソート（昇順）" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "自由形 50m でソート" })).toBeInTheDocument();
      // 旧セルに降順の痕跡（↓）が残っていないこと
      expect(
        within(screen.getByRole("button", { name: "自由形 50m でソート" })).queryByText("↓"),
      ).not.toBeInTheDocument();
    });

    it("境界値: メンバー全員がタイム未登録でも降順クリックでクラッシュしない（全員末尾＝入力順維持）", async () => {
      const noTimeA = buildMember({
        id: "member-a",
        user_id: "user-a",
        users: { id: "user-a", name: "無記録A" },
      });
      const noTimeB = buildMember({
        id: "member-b",
        user_id: "user-b",
        users: { id: "user-b", name: "無記録B" },
      });
      const members = [noTimeA, noTimeB];
      const mockSupabase = createMockSupabase([], null);

      renderWithLocale(<Harness members={members} mockSupabase={mockSupabase as never} />, "ja");
      await screen.findByTestId("team-member-row-member-a");

      const sortButton = () => screen.getByRole("button", { name: "自由形 50m でソート" });
      fireEvent.click(sortButton()); // asc
      fireEvent.click(screen.getByRole("button", { name: "自由形 50m でソート（昇順）" })); // desc

      // 例外を投げず、全員 (!timeA && !timeB) の comparison=0 で入力順が維持される
      expect(getRowOrder()).toEqual(["team-member-row-member-a", "team-member-row-member-b"]);
      expect(
        screen.getByRole("button", { name: "自由形 50m でソート（降順）" }),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-08] 境界値
  // ---------------------------------------------------------------------
  describe("[V-08] 境界値", () => {
    it("個人メドレーの50m/800mは列として存在しない（無効な組み合わせ）", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      expect(screen.queryByRole("button", { name: /個人メドレー 50m でソート/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /個人メドレー 800m でソート/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /個人メドレー 200m でソート/ })).toBeInTheDocument();
    });

    it("平泳ぎ/背泳ぎ/バタフライの400m/800mは列として存在しない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      for (const style of ["平泳ぎ", "背泳ぎ", "バタフライ"]) {
        expect(
          screen.queryByRole("button", { name: new RegExp(`${style} 400m でソート`) }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: new RegExp(`${style} 800m でソート`) }),
        ).not.toBeInTheDocument();
      }
    });

    it("グループヘッダーが指定された場合、colSpan がテーブル全列数と一致し表示崩れがない", () => {
      const member = buildMember();
      const { container } = renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          groupHeaders={new Map([[0, "グループA"]])}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      expect(screen.getByText("グループA")).toBeInTheDocument();
      const groupHeaderCell = container.querySelector("td[colspan]");
      expect(groupHeaderCell).not.toBeNull();
      // 1 (メンバー名列) + 17 (有効セル数) = 18 列
      expect(groupHeaderCell?.getAttribute("colspan")).toBe(String(1 + VALID_CELL_COUNT));
    });

    it("メンバーが0人のとき空状態メッセージが表示される", () => {
      renderWithLocale(
        <MembersTimeTable
          members={[]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      expect(screen.getByTestId("team-member-empty-state")).toBeInTheDocument();
      expect(screen.getByText("メンバーがいません")).toBeInTheDocument();
    });

    it("isLoading=true のときスケルトン表示になり、テーブルは描画されない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={true}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={() => null}
        />,
        "ja",
      );

      expect(screen.queryByTestId(`team-member-row-${member.id}`)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-01] / [V-BULK-02] 一括登録（competition なし）ツールチップの note 表示
  // ---------------------------------------------------------------------
  describe("[V-BULK-01/02] 一括登録ツールチップの note / ラベル表示", () => {
    // fixture の note は「一括登録」ラベル (bulkEntryNote) と共通部分文字列を持たない値にする
    // (トートロジー回避: note に「一括登録」の部分文字列を含めない)
    const BULK_NOTE = "手入力メモXYZ";

    const buildBulkBestTime = (overrides: Partial<BestTime> = {}): BestTime => ({
      id: "bt-bulk",
      time: 27.3,
      created_at: "2025-02-10T00:00:00Z",
      pool_type: 0,
      is_relaying: false,
      style: { name_jp: "50m自由形", distance: 50 },
      // competition は意図的に付けない（一括登録記録の再現）
      ...overrides,
    });

    it("note がある一括登録記録は、ツールチップに note がそのまま表示され「一括登録」ラベルは出ない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? buildBulkBestTime({ note: BULK_NOTE })
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(BULK_NOTE)).toBeInTheDocument();
      expect(within(row).queryByText("一括登録")).not.toBeInTheDocument();
    });

    it("note が無い一括登録記録は、ツールチップに「一括登録」ラベル (ja) が表示される", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50 ? buildBulkBestTime() : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText("一括登録")).toBeInTheDocument();
    });

    it("note が無い一括登録記録は、en ロケールでは「Bulk entry」ラベルが表示される（日本語混入なし）", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50 ? buildBulkBestTime() : null
          }
        />,
        "en",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText("Bulk entry")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-03] 象限A: competition と note が両方ある記録は、大会名と note の
  // 両方が表示される (2026-08-30 PM 判断により書き換え。旧テストは「note が
  // 設定されていても note は表示されず大会名のみ表示される」という排他挙動を
  // pin していたが、これはバグを仕様に昇格させたものだったため反転した)
  // ---------------------------------------------------------------------
  describe("[V-BULK-03] 象限A: 大会記録に note があるときは大会名と note の両方が表示される", () => {
    it("competition と note が両方ある記録は、大会名と note の両方が表示され、一括登録ラベルは出ない", () => {
      const member = buildMember();
      const NOTE_ALONGSIDE_COMPETITION = "併記確認用メモQWERTY";
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "bt-comp",
                  time: 27.3,
                  created_at: "2025-01-05T00:00:00Z",
                  pool_type: 0,
                  is_relaying: false,
                  note: NOTE_ALONGSIDE_COMPETITION,
                  style: { name_jp: "50m自由形", distance: 50 },
                  competition: { title: "第10回市民大会", date: "2025-06-20" },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText("第10回市民大会")).toBeInTheDocument();
      expect(within(row).getByText(NOTE_ALONGSIDE_COMPETITION)).toBeInTheDocument();
      expect(within(row).queryByText("一括登録")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-07] 象限B: competition があり note が無い記録は、大会名のみ表示され
  // note 欄・「一括登録」ラベルのどちらも表示されない
  // ---------------------------------------------------------------------
  describe("[V-BULK-07] 象限B: 大会記録に note が無いときは大会名のみで一括登録ラベルは出ない", () => {
    it("competition があり note が無い記録は、大会名のみ表示され一括登録ラベルは表示されない", () => {
      const member = buildMember();
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "bt-comp-nonote",
                  time: 27.3,
                  created_at: "2025-01-05T00:00:00Z",
                  pool_type: 0,
                  is_relaying: false,
                  style: { name_jp: "50m自由形", distance: 50 },
                  competition: { title: "備考なし記録大会", date: "2025-06-20" },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText("備考なし記録大会")).toBeInTheDocument();
      expect(within(row).queryByText("一括登録")).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-08] 境界値: note="" は note=undefined と同じ「無し」扱いになる (象限Bの境界)。
  // 可視テキストは変わらないため getByText/queryByText では検出できない
  // (誤実装は不可視の空要素を1つ追加描画するだけ) ため、
  // container innerHTML のDOM構造完全一致で検証する。
  // ---------------------------------------------------------------------
  describe("[V-BULK-08] 境界値: note='' は note=undefined と同一のDOM構造になる (象限Bの境界)", () => {
    it("competitionがある記録で、note='' と note=undefined のツールチップDOMが完全一致する", () => {
      const member = buildMember();
      const buildBoundaryTime = (note?: string) => ({
        id: "bt-boundary",
        time: 27.3,
        created_at: "2025-01-05T00:00:00Z",
        pool_type: 0,
        is_relaying: false,
        note,
        style: { name_jp: "50m自由形", distance: 50 },
        competition: { title: "境界確認大会", date: "2025-06-20" },
      });

      const renderRowHtml = (note?: string) => {
        const { unmount } = renderWithLocale(
          <MembersTimeTable
            members={[member]}
            currentUserId="user-1"
            includeRelaying={false}
            sortStyle={null}
            sortDistance={null}
            sortOrder="asc"
            isLoading={false}
            onSort={vi.fn()}
            onMemberClick={vi.fn()}
            getBestTimeForMember={(_memberId, style, distance) =>
              style === "自由形" && distance === 50 ? buildBoundaryTime(note) : null
            }
          />,
          "ja",
        );
        const html = screen.getByTestId(`team-member-row-${member.id}`).innerHTML;
        unmount();
        return html;
      };

      const htmlWithUndefined = renderRowHtml(undefined);
      const htmlWithEmptyString = renderRowHtml("");

      expect(htmlWithEmptyString).toBe(htmlWithUndefined);
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-04] D-3: 日付表示は competition.date 優先、無い場合は created_at
  // ---------------------------------------------------------------------
  describe("[V-BULK-04] ツールチップの日付は competition.date 優先", () => {
    it("competition.date と created_at が異なる日付の場合、表示される日付は competition.date 側", () => {
      const member = buildMember();
      const createdAt = "2025-01-05T00:00:00Z"; // created_at 側の日付
      const competitionDate = "2025-06-20"; // competition.date 側の日付（異なる値）
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "bt-date",
                  time: 27.3,
                  created_at: createdAt,
                  pool_type: 0,
                  is_relaying: false,
                  style: { name_jp: "50m自由形", distance: 50 },
                  competition: { title: "日付検証大会", date: competitionDate },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatDate(competitionDate, "numeric"))).toBeInTheDocument();
      expect(
        within(row).queryByText(formatDate(createdAt, "numeric")),
      ).not.toBeInTheDocument();
    });

    it("competition が無い場合、表示される日付は created_at 側", () => {
      const member = buildMember();
      const createdAt = "2025-02-10T00:00:00Z";
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={false}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(_memberId, style, distance) =>
            style === "自由形" && distance === 50
              ? {
                  id: "bt-date-bulk",
                  time: 27.3,
                  created_at: createdAt,
                  pool_type: 0,
                  is_relaying: false,
                  style: { name_jp: "50m自由形", distance: 50 },
                }
              : null
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(formatDate(createdAt, "numeric"))).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-05] 引き継ぎ note 取り違え防止（実フック結合、トートロジー回避）
  //   getBestTimeForMember(includeRelaying=true) が合成する「引き継ぎ候補」の note が、
  //   引き継ぎなし記録の note を誤って引き継いでいないかを、実際に画面表示まで通して確認する。
  //   note は「共通部分文字列を持たない」2つの異なる値を使う。
  // ---------------------------------------------------------------------
  describe("[V-BULK-05] 引き継ぎタイム候補の note 取り違え防止", () => {
    const NON_RELAY_NOTE = "手入力メモXYZ";
    const RELAY_NOTE = "遠征記録メモQRS";

    it.each([
      ["短水路 (pool_type=0)", 0],
      ["長水路 (pool_type=1)", 1],
    ])("%s: includeRelaying=true で表示される note は引き継ぎ側 (RELAY_NOTE) である", async (_label, poolType) => {
      const member = buildMember();
      const mockData = [
        {
          id: "non-relay-1",
          time: 30.5,
          created_at: "2025-01-15T00:00:00Z",
          pool_type: poolType,
          is_relaying: false,
          note: NON_RELAY_NOTE,
          styles: { name_jp: "50m自由形", distance: 50 },
          competitions: null,
        },
        {
          id: "relay-1",
          time: 29.0, // 引き継ぎありの方が速い
          created_at: "2025-01-10T00:00:00Z",
          pool_type: poolType,
          is_relaying: true,
          note: RELAY_NOTE,
          styles: { name_jp: "50m自由形", distance: 50 },
          competitions: null,
        },
      ];
      const mockSupabase = createMockSupabase(mockData, null);

      const { result } = renderHookWithI18n(() => useMemberBestTimes(mockSupabase as never));
      await act(async () => {
        await result.current.loadAllBestTimes([{ id: member.id, user_id: member.user_id }]);
      });

      // フックの戻り値自体で note が取り違えられていないことを確認
      const bestTimeWithRelaying = result.current.getBestTimeForMember(
        member.id,
        "自由形",
        50,
        true, // includeRelaying
      );
      expect(bestTimeWithRelaying?.is_relaying).toBe(true);
      expect(bestTimeWithRelaying?.note).toBe(RELAY_NOTE);
      expect(bestTimeWithRelaying?.note).not.toBe(NON_RELAY_NOTE);

      // 画面表示でも引き継ぎ側の note が出て、引き継ぎなし側の note は出ないことを確認。
      // MembersTimeTable 自身は getBestTimeForMember を (memberId, style, distance) の3引数で
      // 呼ぶだけで includeRelaying は呼び出し元(TeamMemberManagement.tsx)がクロージャで
      // バインドする設計のため、実結合と同じ形でラップする（そのままだと常に
      // includeRelaying=false のデフォルト動作になり検証にならない）。
      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={true}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(memberId, style, distance) =>
            result.current.getBestTimeForMember(memberId, style, distance, true)
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(RELAY_NOTE)).toBeInTheDocument();
      expect(within(row).queryByText(NON_RELAY_NOTE)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------
  // [V-BULK-06] 引き継ぎありのみ経路（bestTimesByStyleAndPool に該当なし）の note 回帰防止
  // ---------------------------------------------------------------------
  describe("[V-BULK-06] 引き継ぎありのみ記録の note がそのまま表示される（回帰防止）", () => {
    it("引き継ぎなし記録が存在しない種目でも、引き継ぎ記録自身の note がツールチップに表示される", async () => {
      const member = buildMember();
      const RELAY_ONLY_NOTE = "単独引き継ぎメモLMN";
      const mockData = [
        {
          id: "relay-only-1",
          time: 29.0,
          created_at: "2025-01-10T00:00:00Z",
          pool_type: 0,
          is_relaying: true,
          note: RELAY_ONLY_NOTE,
          styles: { name_jp: "50m自由形", distance: 50 },
          competitions: null,
        },
      ];
      const mockSupabase = createMockSupabase(mockData, null);

      const { result } = renderHookWithI18n(() => useMemberBestTimes(mockSupabase as never));
      await act(async () => {
        await result.current.loadAllBestTimes([{ id: member.id, user_id: member.user_id }]);
      });

      renderWithLocale(
        <MembersTimeTable
          members={[member]}
          currentUserId="user-1"
          includeRelaying={true}
          sortStyle={null}
          sortDistance={null}
          sortOrder="asc"
          isLoading={false}
          onSort={vi.fn()}
          onMemberClick={vi.fn()}
          getBestTimeForMember={(memberId, style, distance) =>
            result.current.getBestTimeForMember(memberId, style, distance, true)
          }
        />,
        "ja",
      );

      const row = screen.getByTestId(`team-member-row-${member.id}`);
      expect(within(row).getByText(RELAY_ONLY_NOTE)).toBeInTheDocument();
      expect(within(row).queryByText("一括登録")).not.toBeInTheDocument();
    });
  });
});
