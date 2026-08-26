/**
 * MemberDetailModal — gender 配線 (呼び出し元レベル) の防衛テスト
 *
 * ## 背景 (QA Phase B ミューテーション検証で実証した穴)
 * `apps/web/components/team/MemberDetailModal.tsx:139` は
 *   <BestTimesTable bestTimes={bestTimes} gender={member.users.gender} />
 * という配線になっている。これを
 *   <BestTimesTable bestTimes={bestTimes} gender={member.users.gender ?? 0} />
 * に書き換える (最も危険な実装ミスそのもの) と、フル172ファイル・6342件のテストが
 * 1件も red にならないことが判明した。`BestTimesTable` 単体テスト
 * (`__tests__/components/member-detail/BestTimesTable.test.tsx`) は gender を
 * 直接 props として渡しているため、`MemberDetailModal` が実際に
 * `member.users.gender` を正しく読み取って配線しているかどうかは検証範囲外だった。
 *
 * `users.gender` の DB デフォルトは 0 (男性)。`?? 0` が入ると、gender が
 * 未設定 (undefined) の女性メンバーが「不明」として扱われず「男性」として
 * WAポイントが計算され、もっともらしいが誤った数値が静かに表示される
 * (基準タイムは男女で約10%異なる)。クラッシュしないため発見が遅れる。
 *
 * ## このテストが pin する挙動
 * - [V-GENDER-WIRING-01] member.users.gender が undefined のとき、
 *   MemberDetailModal をレンダリングして WAポイントモードに切り替えても、
 *   セルは「—」のままである (542 が出てはならない)。
 *   → `gender ?? 0` (MemberDetailModal 側) と `gender = 0` (BestTimesTable
 *     側のデフォルト引数) の両方の誤フォールバックを検知する。
 *     いずれも「明示的に undefined が渡された場合」に発火する点は同一のため、
 *     このケース1つで両方の変異をカバーする。
 * - [V-GENDER-WIRING-02] member.users.gender = 1 (女性) のとき、
 *   MemberDetailModal をレンダリングして WAポイントモードに切り替えると、
 *   gender=0 の点数 (542) ではなく gender=1 の点数 (763) が表示される。
 *   → MemberDetailModal が gender を握り潰さず実際の値を配線していることの
 *     直接証拠 (呼び出し元レベルでの divergence 実証)。
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * 542 / 763 は `node -e` で P = floor(1000 * (B/T)^3) を独立に計算した
 * ハードコード値 (T=54.97, SCM 100m自由形: 男子base=44.84 / 女子base=50.25)。
 * BestTimesTable や waPoints.ts の実装を呼び出して期待値を生成していない。
 *
 * ## モック方針 (クエリ引数を握り潰さない)
 * `useAuth` の supabase クライアントは `records` テーブルへの
 * `.from("records").select(...).eq("user_id", userId).order(...)` 呼び出しを
 * 実際に受け取り、`eq()` に渡された列名・値を `eqCalls` に記録して
 * テストごとに assert する。クエリ条件を無視して常に固定データを返す
 * モックは「サーバー側絞り込みを検証不能にする」不良モックであるため避ける。
 * また `select` の列文字列や `order` の引数の形状をプロダクションコードに
 * 合わせて先読みで縛ることもしない (モック制約をクエリ形状に合わせない)。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import { STYLE_KEY_MAP } from "@apps/shared/utils/swimStyles";
import { formatTimeBest } from "@apps/shared/utils/time";

import type { MemberDetail } from "@/types/member-detail";

// ---------------------------------------------------------------------------
// supabase モック: eq() の呼び出し引数を捨てずに記録する
// ---------------------------------------------------------------------------
type EqCall = { column: string; value: unknown };

type RawRecordRow = {
  id: string;
  time: number;
  created_at: string;
  pool_type: number;
  is_relaying: boolean;
  styles: { name_jp: string; distance: number };
  competitions: { title: string; date: string } | null;
};

let eqCalls: EqCall[] = [];
let recordsRows: RawRecordRow[] = [];

function buildSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "records") {
        throw new Error(`[test mock] unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column: string, value: unknown) => {
            eqCalls.push({ column, value });
            return {
              order: vi.fn(() => Promise.resolve({ data: recordsRows, error: null })),
            };
          }),
        })),
      };
    }),
  };
}

let currentSupabaseMock: ReturnType<typeof buildSupabaseMock>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: currentSupabaseMock }),
}));

import MemberDetailModal from "@/components/team/MemberDetailModal";

const MESSAGES = jaMessages as unknown as AbstractIntlMessages;

function buildMember(overrides: Partial<MemberDetail["users"]> = {}): MemberDetail {
  return {
    id: "member-1",
    user_id: "user-1",
    role: "user",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    users: {
      id: "user-1",
      name: "テスト太郎",
      ...overrides,
    },
  };
}

function renderModal(member: MemberDetail) {
  return render(
    <NextIntlClientProvider locale="ja" messages={MESSAGES}>
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={member}
        teamId="team-1"
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />
    </NextIntlClientProvider>,
  );
}

const cellTestId = (style: keyof typeof STYLE_KEY_MAP, distance: number) =>
  `member-detail-best-times-cell-${STYLE_KEY_MAP[style]}-${distance}`;

beforeEach(() => {
  eqCalls = [];
  recordsRows = [
    {
      id: "rec-1",
      time: 54.97,
      created_at: "2020-01-01T00:00:00.000Z",
      pool_type: 0,
      is_relaying: false,
      styles: { name_jp: "100m自由形", distance: 100 },
      competitions: { title: "テスト大会", date: "2020-01-01" },
    },
  ];
  currentSupabaseMock = buildSupabaseMock();
});

describe("[V-GENDER-WIRING] MemberDetailModal は member.users.gender をそのまま BestTimesTable に配線する", () => {
  it("[V-GENDER-WIRING-01] gender が undefined のメンバーは、WAポイントモードでも「—」のままで 542 は出ない (`?? 0` フォールバック検出)", async () => {
    const user = userEvent.setup();
    const member = buildMember(); // gender キーを含めない = member.users.gender は undefined

    renderModal(member);

    // データロード完了 (bestTimes.length > 0 になり BestTimesTable が描画される) を待つ
    const toggle = await screen.findByTestId("member-detail-best-times-wa-points-toggle");

    // ロードに使われたクエリ条件を確認 (モックがクエリ引数を握り潰していないことの保証)
    expect(eqCalls).toEqual([{ column: "user_id", value: "user-1" }]);

    // タイムモードでは通常どおりタイムが表示される (回帰確認)
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();

    await user.click(toggle);

    // gender が undefined のはずなのに 542 (gender=0 の点数) が出たら `?? 0` 型のバグ
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });

  it("[V-GENDER-WIRING-02] gender=1 (女性) のメンバーは、WAポイントモードで男性基準の 542 ではなく女性基準の 763 が表示される", async () => {
    const user = userEvent.setup();
    const member = buildMember({ gender: 1 });

    renderModal(member);

    const toggle = await screen.findByTestId("member-detail-best-times-wa-points-toggle");
    expect(eqCalls).toEqual([{ column: "user_id", value: "user-1" }]);

    await user.click(toggle);

    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();
    expect(within(cell).getByText("763")).toBeInTheDocument();
  });

  it("[V-GENDER-WIRING-03] gender=0 (男性) を明示指定したメンバーは、WAポイントモードで 542 が表示される (回帰確認: 正常系を壊していないこと)", async () => {
    const user = userEvent.setup();
    const member = buildMember({ gender: 0 });

    renderModal(member);

    const toggle = await screen.findByTestId("member-detail-best-times-wa-points-toggle");
    await user.click(toggle);

    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("542")).toBeInTheDocument();
    expect(within(cell).queryByText("763")).not.toBeInTheDocument();
  });
});
