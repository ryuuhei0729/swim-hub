/**
 * EntryDetail（エントリー済み・未記録の大会グループ）削除ボタンの isTeamCompetition ガード
 * (Sprint Contract D4/SC1 — App Developer が実測で発見した第4の削除経路、PM承認済み)
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/EntryDetail.tsx:213
 * (DayDetailModal.tsx:414 で isTeamCompetition を配線)
 *
 * 背景:
 *   当初 `isTeamCompetition?: boolean` は optional でデフォルト false だったため、
 *   呼び出し元での配線漏れがあると team 大会でも削除ボタンが出てしまう (fail open)
 *   リスクがあった。App Developer (F5) が全呼び出し元 (DayDetailModal.tsx 1箇所のみ、
 *   配線漏れ無しを実測済み) を確認した上で `isTeamCompetition: boolean` を**必須化**し、
 *   デフォルト値を削除した (types.ts, EntryDetail.tsx)。
 *
 *   これにより「prop 省略時に fail open するか」というリスク自体が型システムで
 *   到達不能になった (省略すると TS2322 でコンパイルエラーになる)。そのため
 *   このリスクを検証する [V-M-E03] (旧: 省略時は削除ボタンが出ることを pin) は
 *   **削除した**。tsc --noEmit が CI ハーネスで回るため、「必須 prop が省略できないこと」
 *   自体を別途テストで pin する必要はない (`expectTypeOf` は vitest typecheck 未設定のため
 *   無音で通ってしまい、型 pin の手段として不適切でもある)。
 *
 *   「必須 prop が実際にガードとして機能しているか」は [V-M-E01]/[V-M-E02] が
 *   isTeamCompetition=true/false の両方を明示指定して担保している。
 *
 * Sprint Contract 検証観点:
 *   [V-M-E01] isTeamCompetition=true のとき削除ボタン(icon-trash-2)が描画されない
 *   [V-M-E02] isTeamCompetition=false (個人大会) のときは削除ボタンが描画される
 *             (同じセレクタが機能することの証明、V-M-E01 の偽陽性防止)
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

import { EntryDetail } from "../components/EntryDetail";
import type { EntryDetailProps } from "../types";

function makeEntry(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "entry-1",
    type: "entry",
    date: "2026-08-01",
    title: "エントリー1",
    metadata: {},
    ...overrides,
  } as CalendarItem;
}

function renderEntryDetail(
  props: Partial<Omit<EntryDetailProps, "isTeamCompetition">> & {
    isTeamCompetition: boolean;
  },
) {
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    })),
  };
  mockUseAuth.mockReturnValue({ supabase });

  return render(
    <EntryDetail
      competitionId="comp-1"
      competitionName="テスト大会"
      entries={[makeEntry()]}
      onDeleteCompetition={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("EntryDetail 削除ボタンの isTeamCompetition ガード", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("[V-M-E01] isTeamCompetition=true のとき削除ボタンが描画されない", async () => {
    renderEntryDetail({ isTeamCompetition: true });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeTruthy();
    });
    expect(screen.queryByTestId("icon-trash-2")).toBeNull();
  });

  it("[V-M-E02] isTeamCompetition=false (個人大会) のとき削除ボタンが描画される (セレクタの健全性確認)", async () => {
    renderEntryDetail({ isTeamCompetition: false });

    await waitFor(() => {
      expect(screen.getByTestId("icon-trash-2")).toBeTruthy();
    });
  });
});
