// =============================================================================
// WaPointsCompareModal.test.tsx — QA Sprint Contract 検証 (Phase B 本実装検証)
// =============================================================================
// Sprint Contract 検証観点:
//   [V-CMP-01] gender が undefined (0/1 いずれでもない) のメンバーはランキングから
//     除外される (`?? 0` フォールバックで男性として計算され「もっともらしいが誤った」
//     点数が出ないことの実証。542等の gender=0 の点数が絶対に出てはならない)
//   [V-CMP-02] gender=0 と gender=1 で同じタイムでも異なる点数が表示される
//     (0/1 の取り違えを検出する)
//   [V-CMP-03] floor であって round ではない (46.4/44.94 で 1100 (floor) が表示され、
//     1101 (round) にはならない)
//   [V-CMP-04] リレー記録 (is_relaying=true) は WA ポイント計算から常に除外される
//     (このモーダルには includeRelaying トグルが存在しないため、非リレー記録が
//     無ければランキングから除外されることを確認する = 常時除外の構造的実証)
//   [V-CMP-05] データ取得は「WAポイントで比較」オープン時に1回だけ (メンバーごとの
//     個別クエリではない、N+1 でないこと)
//
// トートロジー防止メモ: 542/763/504/761/1100 は node -e で floor(1000*(B/T)^3) を
// 独立に計算したハードコード値であり、waPoints.ts や本コンポーネントの実装を
// 呼び出して生成していない。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

// mobile UI フィードバック #2 の実装で WaPointsCompareModal.tsx は `FlashList`
// (`@shopify/flash-list`) から標準の `FlatList` (react-native) に置き換えられたため、
// `@shopify/flash-list` の変換失敗を避けるためのファイルローカルスタブは不要になった。
// (削除後も全テストが green のままであることを QA で確認済み)

// useSignedImageUrl は内部で useAuth() を直接呼ぶ (supabase prop 経由ではない)。
// アバター解決は本テストの関心事ではないため、session 無し (url は常に null) を返す。
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ session: null }),
}));

import { WaPointsCompareModal } from "../WaPointsCompareModal";

const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & { id: string; user_id: string; name: string; gender?: number },
): TeamMembershipWithUser =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: {
      id: overrides.user_id,
      name: overrides.name,
      gender: overrides.gender,
      profile_image_path: null,
    },
    ...overrides,
  }) as unknown as TeamMembershipWithUser;

interface FakeRow {
  user_id: string;
  time: number;
  pool_type: number;
  is_relaying: boolean;
  styles: { name_jp: string; distance: number };
}

function buildSupabaseMock(dataByUser: Record<string, FakeRow[]>) {
  const rows = Object.values(dataByUser).flat();
  const fromSpy = vi.fn((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn((_col: string, ids: string[]) => ({
        eq: vi.fn(() =>
          Promise.resolve({
            data: rows.filter((r) => ids.includes(r.user_id)),
            error: null,
          }),
        ),
      })),
    })),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from: fromSpy } as any, fromSpy };
}

const record = (
  userId: string,
  time: number,
  poolType: 0 | 1,
  nameJp: string,
  distance: number,
  isRelaying = false,
): FakeRow => ({
  user_id: userId,
  time,
  pool_type: poolType,
  is_relaying: isRelaying,
  styles: { name_jp: nameJp, distance },
});

describe("WaPointsCompareModal", () => {
  it("[V-CMP-01] gender が undefined のメンバーはランキングから除外される (`?? 0` フォールバック検出)", async () => {
    // gender 未設定の「不明子」は 25.00 秒 (男性基準なら504点相当) を持つが、
    // gender が undefined のためランキングに一切現れないはず。
    const unknownGender = buildMember({ id: "m-1", user_id: "u-1", name: "不明子" });
    const knownGender = buildMember({ id: "m-2", user_id: "u-2", name: "既知太郎", gender: 0 });

    const { supabase } = buildSupabaseMock({
      "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)],
      "u-2": [record("u-2", 25.0, 0, "50m自由形", 50)],
    });

    render(
      <WaPointsCompareModal
        visible={true}
        onClose={vi.fn()}
        members={[unknownGender, knownGender]}
        supabase={supabase}
      />,
    );

    await screen.findByText("既知太郎");

    // gender=0 の点数 (504) は既知太郎の分として表示されるが、不明子は一切表示されない
    expect(screen.queryByText("不明子")).toBeNull();
    expect(screen.getByText("504")).toBeTruthy();
  });

  it("[V-CMP-02] gender=0 と gender=1 で同じタイムでも異なる点数が表示される", async () => {
    const male = buildMember({ id: "m-1", user_id: "u-1", name: "男性花子", gender: 0 });
    const female = buildMember({ id: "m-2", user_id: "u-2", name: "女性花子", gender: 1 });

    const { supabase } = buildSupabaseMock({
      "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)],
      "u-2": [record("u-2", 25.0, 0, "50m自由形", 50)],
    });

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[male, female]} supabase={supabase} />,
    );

    await screen.findByText("男性花子");
    await screen.findByText("女性花子");

    expect(screen.getByText("504")).toBeTruthy();
    expect(screen.getByText("761")).toBeTruthy();
  });

  it("[V-CMP-03] floor であって round ではない (46.4/44.94 → 1100、1101 は表示されない)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "フロア次郎", gender: 0 });

    const { supabase } = buildSupabaseMock({
      // 長水路(poolType=1) 100m自由形、gender=0の base=46.40
      "u-1": [record("u-1", 44.94, 1, "100m自由形", 100)],
    });

    render(<WaPointsCompareModal visible={true} onClose={vi.fn()} members={[member]} supabase={supabase} />);

    await screen.findByText("フロア次郎");

    expect(screen.getByText("1100")).toBeTruthy();
    expect(screen.queryByText("1101")).toBeNull();
  });

  it("[V-CMP-04] リレー記録 (is_relaying=true) しか持たないメンバーはランキングから除外される (常時除外)", async () => {
    const relayOnly = buildMember({ id: "m-1", user_id: "u-1", name: "リレーだけ三郎", gender: 0 });
    const nonRelay = buildMember({ id: "m-2", user_id: "u-2", name: "非リレー花子", gender: 0 });

    const { supabase } = buildSupabaseMock({
      // is_relaying=true のみ (25.00秒、非常に高得点になり得るタイム)
      "u-1": [record("u-1", 20.0, 0, "50m自由形", 50, true)],
      "u-2": [record("u-2", 25.0, 0, "50m自由形", 50, false)],
    });

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[relayOnly, nonRelay]} supabase={supabase} />,
    );

    await screen.findByText("非リレー花子");

    // リレーのみのメンバーはランキングに現れない
    expect(screen.queryByText("リレーだけ三郎")).toBeNull();
    // 非リレーメンバーの504点は表示される
    expect(screen.getByText("504")).toBeTruthy();
  });

  it("[V-CMP-05] データ取得は開いたときに1回だけ発生する (N+1 でないこと)", async () => {
    const m1 = buildMember({ id: "m-1", user_id: "u-1", name: "件数アルファ", gender: 0 });
    const m2 = buildMember({ id: "m-2", user_id: "u-2", name: "件数ベータ", gender: 0 });
    const m3 = buildMember({ id: "m-3", user_id: "u-3", name: "件数ガンマ", gender: 0 });

    const { supabase, fromSpy } = buildSupabaseMock({
      "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)],
      "u-2": [record("u-2", 26.0, 0, "50m自由形", 50)],
      "u-3": [record("u-3", 27.0, 0, "50m自由形", 50)],
    });

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[m1, m2, m3]} supabase={supabase} />,
    );

    await screen.findByText("件数アルファ");
    await waitFor(() => expect(fromSpy).toHaveBeenCalledTimes(1));

    // visible のまま再レンダーが起きても再取得しない (memberUserIdsKey が変わらないため)
    expect(fromSpy).toHaveBeenCalledTimes(1);
  });

  it("空 (visible=false) のときはレンダリングしない", () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "非表示太郎", gender: 0 });
    const { supabase } = buildSupabaseMock({ "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)] });

    render(<WaPointsCompareModal visible={false} onClose={vi.fn()} members={[member]} supabase={supabase} />);

    expect(screen.queryByText("非表示太郎")).toBeNull();
  });

  // ---------------------------------------------------------------------
  // ローディング/エラー/空状態の3分岐がそれぞれ実際に到達可能であることの検証
  // (「到達不能な分岐をテストしていた」実例があるため、分岐名だけでなく実データで
  // その分岐に到達させたうえで内容を確認する)
  // ---------------------------------------------------------------------
  it("[V-CMP-LOADING] データ取得中はローディング表示になる (ローディング分岐の到達確認)", () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "読込中太郎", gender: 0 });
    const fromSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => new Promise(() => {})), // 永続 pending
        })),
      })),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: fromSpy } as any;

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[member]} supabase={supabase} />,
    );

    expect(screen.getByText("ベストタイム読込中...")).toBeTruthy();
    // ローディング中はランキング行も空状態メッセージも出ない
    expect(screen.queryByText("読込中太郎")).toBeNull();
    expect(screen.queryByText("比較できる記録がありません")).toBeNull();
  });

  it("[V-CMP-ERROR] データ取得に失敗するとエラーメッセージ+再試行ボタンが表示され、再試行で再取得される (エラー分岐の到達確認)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "失敗次郎", gender: 0 });
    let callCount = 0;
    const fromSpy = vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          eq: vi.fn(() => {
            callCount += 1;
            if (callCount === 1) {
              return Promise.resolve({ data: null, error: { message: "network error" } });
            }
            return Promise.resolve({
              data: [
                {
                  user_id: "u-1",
                  time: 25.0,
                  pool_type: 0,
                  is_relaying: false,
                  styles: { name_jp: "50m自由形", distance: 50 },
                },
              ],
              error: null,
            });
          }),
        })),
      })),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = { from: fromSpy } as any;

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[member]} supabase={supabase} />,
    );

    await screen.findByText("ベストタイムの取得に失敗しました");
    expect(screen.queryByText("失敗次郎")).toBeNull();

    fireEvent.click(screen.getByText("再試行").closest("button")!);

    await screen.findByText("失敗次郎");
    expect(screen.getByText("504")).toBeTruthy();
    expect(fromSpy).toHaveBeenCalledTimes(2);
  });

  it("[V-CMP-EMPTY] 比較できる記録が0件のとき空状態メッセージが表示される (空状態分岐の到達確認)", async () => {
    // gender 不明のため計算対象外 = ランキング行が0件になる
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "空状態太郎" });
    const { supabase } = buildSupabaseMock({ "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)] });

    render(
      <WaPointsCompareModal visible={true} onClose={vi.fn()} members={[member]} supabase={supabase} />,
    );

    await screen.findByText("比較できる記録がありません");
    expect(screen.queryByText("空状態太郎")).toBeNull();
  });

  it("閉じるボタンを押すと onClose が呼ばれる", async () => {
    const onClose = vi.fn();
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "閉じる花子", gender: 0 });
    const { supabase } = buildSupabaseMock({ "u-1": [record("u-1", 25.0, 0, "50m自由形", 50)] });

    render(<WaPointsCompareModal visible={true} onClose={onClose} members={[member]} supabase={supabase} />);
    await screen.findByText("閉じる花子");

    // NOTE: このテスト環境の Pressable モックは accessibilityLabel を aria-label に
    // 変換しない (BottomSheet.test.tsx にも同種の注記あり) ため、role+name では特定できない。
    // 閉じるボタン内の Feather "x" アイコン (data-testid="icon-x") の親ボタンをクリックする。
    fireEvent.click(screen.getByTestId("icon-x").closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
