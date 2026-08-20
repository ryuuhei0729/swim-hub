// =============================================================================
// teamRecordBulk.relayLabelRestore.test.tsx
// =============================================================================
//
// Sprint Contract (Phase A スケルトン) — 「記録の代理入力」画面 (TeamRecordBulkFormScreen)
// を、既にリレー記録が入力済みの状態で開いたとき、種目欄・第N泳者欄が空欄になる不具合の検証。
//
// PM 確定の根本原因 (2026-08-20):
//   - `screens/teamRecordBulk/buildStyleEntries.ts` は純粋関数で i18n の `t` を持たないため、
//     復元経路 (Phase 2: メドレー / Phase 4: フリー二次検出) では
//     `styleName: ""` (:244, :326) / `relayLegLabel: undefined` (:236, :337) を設定する
//   - `TeamRecordBulkFormScreen.tsx:1107-1108` はリレー時に `entry.styleName` をそのまま描画する
//     → 種目欄が空欄になる (ユーザー報告の症状)
//   - 同 `:1144` は `mr.relayLegLabel` を描画する → 第N泳者ラベルも同一根本原因で空欄
//   - ラベルが入るのはピッカーで選択した瞬間の state (`updateRelayEntry` :293, :312) だけ
//   - 修正方針: ラベルを state に持たせず、描画時に `relayEventId` から `relayEvents`
//     (`buildRelayEvents` で翻訳済み、同ファイル :130-140 付近) を引いて導出する
//     → 修正はレンダリング (TeamRecordBulkFormScreen.tsx) 側に閉じる想定であり、
//       buildStyleEntries.ts の戻り値 (styleName/relayLegLabel) 自体は変更しない前提
//
// Verification Checklist (PASS/FAIL は Phase B で QA が実測して記録する):
//   [V-01] メドレーリレー (buildStyleEntriesFromExisting Phase 1/2 経路) で復元した StyleEntry を
//          画面にロードすると、種目欄に "50m×4 メドレーリレー" (buildRelayEvents が生成する
//          実ラベル) が表示される (空欄にならない)
//   [V-02] フリーリレー (buildStyleEntriesFromExisting Phase 4 二次検出経路) で復元した
//          StyleEntry を画面にロードすると、種目欄に "50m×4 フリーリレー" が表示される
//   [V-03] [V-01]/[V-02] のリレーカードで、4名分の第N泳者ラベル
//          ("第1泳者 (背泳ぎ)" 等、competition.records.relayLegLabel を実値展開したもの) が
//          全て表示される (undefined や空文字にならない)
//   [V-04] [非退行] 個人種目の記録 (リレー未検出) を復元したとき、種目欄には従来通り
//          localizedStyleName(style, t) の結果 (例: "50m自由形") が表示される
//   [V-05] [非退行] 種目選択ピッカーで新規にリレー種目を選択した直後 (updateRelayEntry 経路)
//          も、種目欄・第N泳者ラベルが従来通り表示される (state 起点の表示から
//          relayEvents 導出の表示へ変更しても、ピッカー選択直後の見た目は変わらない)
//   [V-06] (Nice-to-have — 必須ではない) ラベルを state に持たせなくなった副次効果として、
//          locale を切り替えたときに再描画のみでリレーラベル・第N泳者ラベルが新しい
//          locale に追随する (state 化されていた場合は再選択するまで古い言語のまま
//          残ってしまう)。本テストハーネスの useTranslation モックはテストファイル単位で
//          静的な ja 固定のため、実機/E2E での確認を主とし、ここでは it.todo に留める
//   [V-07] 保存 → 画面を閉じて再度開く (= records テーブルへの再取得 →
//          buildStyleEntriesFromExisting の再実行) を往復しても、種目欄が空にならない
//          ([V-01]/[V-02] が確認する「復元経路の初回ロード」と同一コードパスであることを
//          明示的に確認する回帰テスト。保存 API 自体の契約は teamRecordBulk.entrySaveGuard.test.tsx
//          の担当範囲であり、本ファイルでは重複させない)
//
// 既存テストで壊れる可能性があるものの調査結果 (Phase A 時点、実測済み):
//   - teamRecordBulk.buildStyleEntries.test.ts / teamRecordBulk.buildStyleEntries.phases.test.ts に
//     `styleName` を assert する箇所はあるが、いずれもリレー未検出の個人種目 StyleEntry に対して
//     (`result[0].styleName` 等、`relayEventId` が無い entry) であり、リレー entry の
//     `styleName === ""` / `relayLegLabel === undefined` を pin しているテストは無い
//     (`grep -n "relayLegLabel" screens/__tests__/*.test.ts*` はヒット無し)
//   - 修正方針が TeamRecordBulkFormScreen.tsx の描画側に閉じる限り、上記ファイルは無傷のはず。
//     ただし Developer が buildStyleEntries.ts 側にラベル生成を移す実装を選んだ場合は、
//     上記2ファイルの styleName 系 assertion (個人種目分) が意図せず影響を受けないか
//     Phase B で再実行して確認すること
//
// テスト対象:
//   apps/mobile/screens/TeamRecordBulkFormScreen.tsx (描画: 種目欄 :1107-1108, 第N泳者 :1144)
//   apps/mobile/screens/teamRecordBulk/buildStyleEntries.ts (復元: Phase 2 :241-249, Phase 4 :325-341)
//   apps/mobile/screens/teamRecordBulk/relayEvents.ts (buildRelayEvents によるラベル導出元)
//
// Phase B 実装メモ (QA):
//   - fixture のメンバー名・チーム名等に期待ラベル文字列の部分文字列 ("メドレーリレー" 等) を
//     含めないこと (トートロジー回避)。氏名は「山田」「鈴木」「佐藤」「田中」「高橋」を使用。
//   - `screen.getByText` の既定 (`exact: true`) はテキストノード全体との厳密一致であり、
//     `toContain` のような部分一致ではない。本ファイルでは意図的に `toContain`/正規表現の
//     部分一致 assertion を避け、厳密一致または配列の完全一致 (`toEqual`) を優先する。
//   - [V-02] のフリーリレー fixture は、Phase 1 (連続ウィンドウ検出) では検出されない
//     ように無関係な個人種目レコードを 4 件の間に割り込ませ、Phase 3 (style_id 別
//     グループ化) → Phase 4 (二次検出) 経路のみを通るよう意図的に設計している
//     (詳細は各 it 内のコメントを参照)。
//   - leg 順序の index 依存 (`relayDef?.legs[mrIndex]`) は [V-03] で `getAllByText` の
//     DOM 順序をそのまま配列比較することで検証する (memberRecords が legIndex 順に
//     並んでいることの確認を兼ねる)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
  };
});

const mocks = vi.hoisted(() => {
  const styles = [
    { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
    { id: 9, name_jp: "50m平泳ぎ", name: "50m Breaststroke", style: "Br", distance: 50 },
    { id: 13, name_jp: "50m背泳ぎ", name: "50m Backstroke", style: "Ba", distance: 50 },
    { id: 17, name_jp: "50mバタフライ", name: "50m Butterfly", style: "Fly", distance: 50 },
  ];

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {
          select: (..._a: unknown[]) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    styles,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "管理者" } },
    ] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.teamMembers, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** ExistingRecord 相当の最小フィクスチャを組み立てるヘルパー */
function makeRecord(opts: {
  id: string;
  userId: string;
  name: string;
  styleId: number;
  time: number;
  isRelaying: boolean;
}) {
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    is_relaying: opts.isRelaying,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: opts.userId, name: opts.name },
  };
}

/**
 * メドレーリレー (背→平→バタ→自) の 4 件を、連続した並びで返す。
 * buildStyleEntriesFromExisting の Phase 1 (連続ウィンドウ検出) → Phase 2 (集約) を通る。
 */
function medleyRelayRecords() {
  return [
    makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 13, time: 31.0, isRelaying: false }),
    makeRecord({ id: "r2", userId: "user-11", name: "鈴木", styleId: 9, time: 33.5, isRelaying: true }),
    makeRecord({ id: "r3", userId: "user-12", name: "佐藤", styleId: 17, time: 29.8, isRelaying: true }),
    makeRecord({ id: "r4", userId: "user-13", name: "田中", styleId: 2, time: 27.0, isRelaying: true }),
  ];
}

/**
 * フリーリレー (全泳者 50m Fr) 4 件を、無関係な個人種目レコード (平泳ぎ) を間に割り込ませた
 * 並びで返す。この割り込みにより Phase 1 の連続ウィンドウ検出は必ず失敗する
 * (どの4連続窓を取っても is_relaying パターンか style_id パターンのいずれかが崩れる)。
 * Phase 3 で style_id=2 (Fr) 別にグループ化された後、Phase 4 の二次検出でのみリレーと
 * 判定される — [V-02] の検証観点である「Phase 4 経路」を確実に踏ませるための設計。
 */
function freeRelayRecordsViaPhase4() {
  return [
    makeRecord({ id: "f0", userId: "user-20", name: "高橋", styleId: 2, time: 27.0, isRelaying: false }),
    // 割り込み: 無関係な個人種目 (平泳ぎ) レコード。Phase 1 の連続窓を崩す。
    makeRecord({ id: "solo", userId: "user-21", name: "伊藤", styleId: 9, time: 33.0, isRelaying: false }),
    makeRecord({ id: "f1", userId: "user-22", name: "渡辺", styleId: 2, time: 26.5, isRelaying: true }),
    makeRecord({ id: "f2", userId: "user-23", name: "中村", styleId: 2, time: 26.8, isRelaying: true }),
    makeRecord({ id: "f3", userId: "user-24", name: "小林", styleId: 2, time: 27.2, isRelaying: true }),
  ];
}

describe("TeamRecordBulkFormScreen — リレーラベル復元 (Sprint Contract V-01〜V-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue(mocks.styles);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = { data: [], error: null };
  });

  describe("[V-01][V-07] メドレーリレー復元 (Phase 1/2 経路)", () => {
    it(
      "[V-01] 4x50 メドレーリレー (背→平→バタ→自) の既存記録を復元して開くと、" +
        "種目欄に「50m×4 メドレーリレー」が表示される (styleName 空欄にならない)",
      async () => {
        mocks.responses["select:records"] = { data: medleyRelayRecords(), error: null };

        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
          expect(screen.getByText("50m×4 メドレーリレー")).toBeDefined();
        });
      },
    );

    it(
      "[V-07] 一度保存された記録を再度開いても (= 同じ復元経路の再実行)、" +
        "種目欄が空欄化しない",
      async () => {
        mocks.responses["select:records"] = { data: medleyRelayRecords(), error: null };

        const queryClient1 = makeQueryClient();
        const { unmount } = render(<TeamRecordBulkFormScreen />, {
          wrapper: createWrapper(queryClient1),
        });
        await waitFor(() => {
          expect(screen.getByText("50m×4 メドレーリレー")).toBeDefined();
        });
        unmount();
        cleanup();

        // 画面を閉じて再度開く = 同じ records レスポンスに対して再度マウントする
        const queryClient2 = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient2) });
        await waitFor(() => {
          expect(screen.getByText("50m×4 メドレーリレー")).toBeDefined();
        });
      },
    );
  });

  describe("[V-02][V-07] フリーリレー復元 (Phase 4 二次検出経路)", () => {
    it(
      "[V-02] 同一 style_id (50m Fr) 4件の既存記録 (Phase 1 では検出されない並び) を" +
        "復元して開くと、種目欄に「50m×4 フリーリレー」が表示される (styleName 空欄にならない)",
      async () => {
        mocks.responses["select:records"] = { data: freeRelayRecordsViaPhase4(), error: null };

        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
          expect(screen.getByText("50m×4 フリーリレー")).toBeDefined();
        });
      },
    );

    it(
      "[V-07] フリーリレーも保存→再オープンの往復で種目欄が空にならない",
      async () => {
        mocks.responses["select:records"] = { data: freeRelayRecordsViaPhase4(), error: null };

        const queryClient1 = makeQueryClient();
        const { unmount } = render(<TeamRecordBulkFormScreen />, {
          wrapper: createWrapper(queryClient1),
        });
        await waitFor(() => {
          expect(screen.getByText("50m×4 フリーリレー")).toBeDefined();
        });
        unmount();
        cleanup();

        const queryClient2 = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient2) });
        await waitFor(() => {
          expect(screen.getByText("50m×4 フリーリレー")).toBeDefined();
        });
      },
    );
  });

  describe("[V-03] 第N泳者ラベルの復元 (leg 順序の index 依存性を含む)", () => {
    it(
      "[V-03] メドレーリレー復元時、4名分の第N泳者ラベル " +
        '("第1泳者 (背泳ぎ)"〜"第4泳者 (自由形)") が legIndex 順に全て表示される',
      async () => {
        mocks.responses["select:records"] = { data: medleyRelayRecords(), error: null };

        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
          expect(screen.getByText("50m×4 メドレーリレー")).toBeDefined();
        });

        // memberRecords が legIndex (0〜3) 順に並んでいることを、DOM 上のラベル出現順で確認する
        // (relayDef?.legs[mrIndex] が index 依存で対応付けている、という Developer の懸念に対応)
        const legLabels = screen
          .getAllByText(/^第\d泳者 \(.+\)$/)
          .map((el) => el.textContent);
        expect(legLabels).toEqual([
          "第1泳者 (背泳ぎ)",
          "第2泳者 (平泳ぎ)",
          "第3泳者 (バタフライ)",
          "第4泳者 (自由形)",
        ]);
      },
    );

    it(
      "[V-03] フリーリレー復元時も、4名分の第N泳者ラベルが legIndex 順に全て表示される",
      async () => {
        mocks.responses["select:records"] = { data: freeRelayRecordsViaPhase4(), error: null };

        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
          expect(screen.getByText("50m×4 フリーリレー")).toBeDefined();
        });

        const legLabels = screen
          .getAllByText(/^第\d泳者 \(.+\)$/)
          .map((el) => el.textContent);
        expect(legLabels).toEqual([
          "第1泳者 (自由形)",
          "第2泳者 (自由形)",
          "第3泳者 (自由形)",
          "第4泳者 (自由形)",
        ]);
      },
    );
  });

  describe("[V-04] 個人種目表示の非退行", () => {
    it(
      "[V-04] リレー未検出の個人種目記録を復元して開くと、従来通り種目欄に" +
        "localizedStyleName の結果 (「50m自由形」) が表示される (本修正による副作用が無いことの確認)",
      async () => {
        mocks.responses["select:records"] = {
          data: [
            makeRecord({ id: "solo-1", userId: "user-30", name: "加藤", styleId: 2, time: 27.5, isRelaying: false }),
          ],
          error: null,
        };

        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => {
          expect(screen.getByText("50m自由形")).toBeDefined();
        });
        // リレー用の第N泳者ラベルは出現しない (個人種目カードであることの確認)
        expect(screen.queryByText(/^第\d泳者/)).toBeNull();
      },
    );
  });

  describe("[V-05] ピッカーで新規にリレーを選んだ直後の非退行", () => {
    it(
      "[V-05] 種目選択ピッカーでメドレーリレーを新規選択した直後、種目欄に" +
        "「50m×4 メドレーリレー」、各泳者行に第N泳者ラベルが表示される (updateRelayEntry 経路)",
      async () => {
        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        // 初期プレースホルダー行の種目選択ボタンを押してピッカーを開く
        const pickerButton = await screen.findByText("選択してください");
        fireEvent.click(pickerButton);

        const medleyOption = await screen.findByText("50m×4 メドレーリレー");
        fireEvent.click(medleyOption);

        await waitFor(() => {
          expect(screen.getByText("50m×4 メドレーリレー")).toBeDefined();
        });
        const legLabels = screen
          .getAllByText(/^第\d泳者 \(.+\)$/)
          .map((el) => el.textContent);
        expect(legLabels).toEqual([
          "第1泳者 (背泳ぎ)",
          "第2泳者 (平泳ぎ)",
          "第3泳者 (バタフライ)",
          "第4泳者 (自由形)",
        ]);
      },
    );

    it(
      "[V-05] 種目選択ピッカーでフリーリレーを新規選択した直後も同様に表示される",
      async () => {
        const queryClient = makeQueryClient();
        render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

        const pickerButton = await screen.findByText("選択してください");
        fireEvent.click(pickerButton);

        const freeOption = await screen.findByText("50m×4 フリーリレー");
        fireEvent.click(freeOption);

        await waitFor(() => {
          expect(screen.getByText("50m×4 フリーリレー")).toBeDefined();
        });
        const legLabels = screen
          .getAllByText(/^第\d泳者 \(.+\)$/)
          .map((el) => el.textContent);
        expect(legLabels).toEqual([
          "第1泳者 (自由形)",
          "第2泳者 (自由形)",
          "第3泳者 (自由形)",
          "第4泳者 (自由形)",
        ]);
      },
    );
  });

  describe("[V-06][Nice-to-have] locale 切り替えへのラベル追随", () => {
    it.todo(
      "[V-06][Nice-to-have] (実機/E2E 確認が主。本ハーネスの i18n モックは静的固定のため" +
        "自動テストでの再現は限定的) locale を切り替えて再描画すると、リレーラベル・" +
        "第N泳者ラベルが再選択なしで新しい locale に追随する",
    );
  });
});
