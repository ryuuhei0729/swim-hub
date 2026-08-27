// =============================================================================
// noteFallbackLabelKeyWiring.de.test.tsx
// =============================================================================
// Sprint Contract 検証観点:
//   [V-I18N-NOTE-01] マイページ (`mypage.bestTimesTable.bulkEntryNote`) / メンバー詳細
//     (`teams.memberDetail.bestTimesTable.bulkEntryNote`) / チーム一覧
//     (`teams.membersTimeTable.bulkEntryNote`) の3画面が、それぞれ正しい名前空間の
//     キーを `BestTimeDetailSheet` の `noteFallbackLabel` に渡していること。
//
// ## なぜ ja ロケールでは検証できないか
// `vitest.setup.ts` のグローバル react-i18next モックは常に ja.json を解決するため、
// 3つのキーがすべて日本語で「一括登録」と同じ値になるロケールでは、キー名の取り違え
// (例: マイページが誤ってメンバー詳細用のキーを使っていても) を検出できない
// (`components/teams/__tests__/AdminViewToggle.test.tsx` にも同種の注記あり:
// 「vitest.setup.tsのi18nモックはja固定のため、他言語はコンポーネント経由で検証できない」)。
//
// ドイツ語では bulkEntryNote が名前空間ごとに異なる訳語になっている
// (mypage/membersTimeTable = "Sammeleintrag" / memberDetail = "Sammeleingabe")。
// このテストファイル限定で react-i18next を de.json 解決の実装に上書きし、
// 実際に解決された文字列を比較することで、キーの取り違えを実証可能にする。
//
// トートロジー防止メモ: 期待文字列 ("Sammeleintrag"/"Sammeleingabe") は
// apps/shared/messages/de.json から読み込んだものであり、実装ファイルをコピーしていない。
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import deMessages from "@apps/shared/messages/de.json";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import type { BestTime } from "@apps/shared/types/ui";

// @shopify/flash-list はソースが素の .ts のまま配布されており、このリポジトリの
// vitest 環境では変換に失敗する。TeamMemberList は WaPointsCompareModal (FlashList使用)
// を import するため、ファイルローカルで最小スタブに置き換える。
vi.mock("@shopify/flash-list", () => ({
  FlashList: () => null,
}));

// vitest.setup.ts のグローバル react-i18next モック (ja固定) をこのファイル内限定で
// de.json 解決に上書きする。ICU風の {var} 補間も同様に処理する。
function resolveDeKey(key: string): string | undefined {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = deMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolateDe(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name) => (name in values ? String(values[name]) : `{${name}}`));
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> & { defaultValue?: string }) => {
      const raw = resolveDeKey(key);
      if (raw === undefined) {
        return options?.defaultValue !== undefined ? String(options.defaultValue) : key;
      }
      if (options && Object.keys(options).length > 0) return interpolateDe(raw, options);
      return raw;
    },
    i18n: { language: "de", changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// useAuth() は TeamMemberList のレンダーごとに呼ばれる。戻り値オブジェクトの参照が
// 毎回変わると TeamMemberGroupFilter の useEffect 依存 ([teamId, supabase]) が
// 毎レンダー発火し、再取得→setState→再レンダー→再取得 の無限ループ (OOM) になる
// (`components/teams/__tests__/TeamMemberList.test.tsx` の既存コメントと同じ注意点)。
// 必ず同一参照を返す。
const mocks = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  return { supabaseFrom, authValue: { supabase: { from: supabaseFrom }, session: null } };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mocks.authValue,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// TeamMemberList はメンバー詳細モーダル (MemberDetailModal) を内部に持ち、
// selectedMember=null の時点でも内部で useBestTimesQuery (react-query) を無条件に呼ぶ。
// 本テストの関心事はセルタップ時の noteFallbackLabel 配線のみのため、
// react-query 自体を経由させず直接スタブ化する (QueryClientProvider 不要化)。
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({ data: [], isLoading: false, error: null }),
}));

// MemberDetailModal はセルタップ (BestTimeDetailSheet) の検証と無関係なため、
// (`components/teams/__tests__/TeamMemberList.test.tsx` の既存スタブと同様に) スタブ化する。
vi.mock("@/components/teams/member-detail", () => ({
  MemberDetailModal: () => null,
}));

// TeamMemberGroupFilter はグループ/性別グルーピングの検証と無関係なため、
// (`components/teams/__tests__/TeamMemberList.test.tsx` の既存スタブと同様に)
// 「グループなし・素通し」に固定してスタブ化する。
vi.mock("@/components/teams/TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => void;
  }) => {
    React.useEffect(() => {
      onGroupedMembersChange(members, new Map());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return null;
  },
}));

import { BestTimesTable as ProfileBestTimesTable } from "@/components/profile/BestTimesTable";
import { BestTimesTable as MemberDetailBestTimesTable } from "@/components/teams/member-detail/BestTimesTable";
import { TeamMemberList } from "@/components/teams/TeamMemberList";

// 期待するドイツ語訳: mypage/membersTimeTable は同じ、memberDetail だけ異なる
const EXPECTED_MYPAGE_DE = deMessages.mypage.bestTimesTable.bulkEntryNote; // "Sammeleintrag"
const EXPECTED_MEMBER_DETAIL_DE = deMessages.teams.memberDetail.bestTimesTable.bulkEntryNote; // "Sammeleingabe"
const EXPECTED_TEAM_LIST_DE = deMessages.teams.membersTimeTable.bulkEntryNote; // "Sammeleintrag"

// このテストが無意味化しないための前提チェック (2値が実際に異なっていること)
if (EXPECTED_MYPAGE_DE === EXPECTED_MEMBER_DETAIL_DE) {
  throw new Error(
    "テスト前提が崩れている: de.json の mypage.bestTimesTable.bulkEntryNote と " +
      "teams.memberDetail.bestTimesTable.bulkEntryNote が同じ値になっている。" +
      "このテストは両者が異なることを利用してキーの取り違えを検出するため、前提が崩れると無意味化する。",
  );
}

const NO_COMPETITION_NO_NOTE = { name_jp: "50m自由形", distance: 50 };

let idCounter = 0;
const buildBestTime = (overrides: Partial<BestTime> = {}): BestTime => {
  idCounter += 1;
  return {
    id: `de-rec-${idCounter}`,
    time: 30.0,
    created_at: "2025-01-01T00:00:00.000Z",
    pool_type: 0,
    is_relaying: false,
    style: NO_COMPETITION_NO_NOTE,
    ...overrides,
  } as BestTime;
};

describe("[V-I18N-NOTE] noteFallbackLabel のキー配線 (ドイツ語で名前空間ごとの取り違えを実証)", () => {
  it("[V-I18N-NOTE-01a] マイページ (profile/BestTimesTable) は Sammeleintrag を表示する (Sammeleingabe は出ない)", () => {
    render(<ProfileBestTimesTable bestTimes={[buildBestTime({ time: 30.0 })]} gender={0} />);

    fireEvent.click(screen.getByText("30.00"));

    expect(screen.getByText(EXPECTED_MYPAGE_DE)).toBeTruthy();
    expect(screen.queryByText(EXPECTED_MEMBER_DETAIL_DE)).toBeNull();
  });

  it("[V-I18N-NOTE-01b] メンバー詳細 (teams/member-detail/BestTimesTable) は Sammeleingabe を表示する (Sammeleintrag は出ない)", () => {
    render(<MemberDetailBestTimesTable bestTimes={[buildBestTime({ time: 31.0 })]} gender={0} />);

    fireEvent.click(screen.getByText("31.00"));

    expect(screen.getByText(EXPECTED_MEMBER_DETAIL_DE)).toBeTruthy();
    expect(screen.queryByText(EXPECTED_MYPAGE_DE)).toBeNull();
  });

  it("[V-I18N-NOTE-01c] チーム一覧 (TeamMemberList) は Sammeleintrag を表示する (Sammeleingabe は出ない)", async () => {
    const member = {
      id: "m-1",
      user_id: "u-1",
      team_id: "team-1",
      role: "user",
      status: "approved",
      is_active: true,
      joined_at: "2025-01-01T00:00:00Z",
      left_at: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      users: { id: "u-1", name: "Test User", gender: 0 },
    } as unknown as TeamMembershipWithUser;

    mocks.supabaseFrom.mockImplementation((_table: string) => ({
      select: vi.fn(() => ({
        in: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  user_id: "u-1",
                  time: 32.0,
                  created_at: "2025-01-01T00:00:00.000Z",
                  note: null,
                  pool_type: 0,
                  is_relaying: false,
                  styles: NO_COMPETITION_NO_NOTE,
                  competitions: null,
                },
              ],
              error: null,
            }),
          ),
        })),
      })),
    }));

    render(
      <TeamMemberList
        members={[member]}
        teamId="team-1"
        isLoading={false}
        isError={false}
        error={null}
        currentUserId="u-1"
        isCurrentUserAdmin={false}
      />,
    );

    await screen.findByText("32.00");
    fireEvent.click(screen.getByText("32.00"));

    expect(await screen.findByText(EXPECTED_TEAM_LIST_DE)).toBeTruthy();
    expect(screen.queryByText(EXPECTED_MEMBER_DETAIL_DE)).toBeNull();
  });
});
