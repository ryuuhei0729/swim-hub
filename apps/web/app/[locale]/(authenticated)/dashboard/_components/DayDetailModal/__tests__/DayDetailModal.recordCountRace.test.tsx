/**
 * DayDetailModal (dashboard) — 大会削除確認の件数フェッチ・レース条件 回帰テスト
 *
 * Reviewer Critical (敵対的レビューで検出、Web Developer 修正対応):
 *   `openCompetitionDeleteConfirm` の `.then()` には「現在開いている確認対象と一致するか」
 *   のガードがあったが、`.finally()` には無かった。再現手順:
 *     1. 大会A の削除確認を開く (fetch A 発火、isFetchingRecordCount=true)
 *     2. キャンセル
 *     3. 大会B の削除確認を開く (fetch B 発火、B の件数は未確定)
 *     4. 遅れていた fetch A が解決 → `.then()` は無視するが `.finally()` が無条件に
 *        isFetchingRecordCount=false にしてしまう
 *     5. B の件数が未取得のまま確認ボタンが有効化され、件数警告なしで削除を確定できてしまう
 *   → ユーザー明示要件2「削除前に件数付きで警告する」への直接違反。
 *
 * このファイルが本コンポーネントに対する最初の専用テストである
 * (Reviewer 指摘: 複数大会をまたぐ非同期オーケストレーション層に到達するテストが
 * 一切無かったことが、このバグを見逃した直接の原因)。
 *
 * Sprint Contract 検証観点:
 *   [V-RACE-01] fetch A が fetch B より後に解決しても、B の確認ボタンは
 *               B 自身の fetch が解決するまで disabled のままである
 *               (「最終的に正しい件数が出る」ではなく「A解決の瞬間にdisabledのままか」を見る)
 *   [V-RACE-02] fetch A の遅延解決による recordCount が B の警告文に紛れ込まない
 *   [V-RACE-03] B 自身の fetch が解決すれば、正しく有効化され B の件数警告が表示される (回帰)
 *
 * トートロジー防止メモ: `waitFor` でフェッチ完了を待つ書き方ではこのバグは原理的に
 * 再現しない (両方解決済みの終状態しか見えない)。解決順序を明示的に入れ替えられる
 * deferred promise を使い、「A解決直後・B未解決」という中間状態を直接観測する。
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import messages from "@apps/shared/messages/ja.json";
import type { CalendarItem } from "@apps/shared/types/ui";

// -----------------------------------------------------------------------------
// deferred: 解決タイミングをテスト側から明示的に制御するためのヘルパー。
// -----------------------------------------------------------------------------
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const countRecordsByCompetitionMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    countRecordsByCompetition = countRecordsByCompetitionMock;
  },
}));

vi.mock("@apps/shared/hooks", () => ({
  useCalendarColorSettingsQuery: () => ({ settings: undefined }),
}));

// PracticeDetails/CompetitionWithEntry/AttendanceModal は本テストの関心事外のため
// 軽量スタブに差し替える。CompetitionDetails は「削除ボタン」だけを持つスタブにし、
// DeleteConfirmModal (実物) との配線のみを検証する。
vi.mock("../components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components")>();
  return {
    ...actual,
    PracticeDetails: () => null,
    CompetitionWithEntry: () => null,
    AttendanceModal: () => null,
    CompetitionDetails: (props: { competitionId: string; onDelete?: () => void }) => (
      <button
        data-testid={`delete-competition-${props.competitionId}`}
        onClick={() => props.onDelete?.()}
      >
        delete {props.competitionId}
      </button>
    ),
  };
});

import DayDetailModal from "../DayDetailModal";

function makeCompetitionItem(id: string): CalendarItem {
  return {
    id,
    type: "competition",
    date: "2026-07-10",
    title: `大会-${id}`,
    metadata: {},
  };
}

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DayDetailModal (web/dashboard) — 大会削除の件数フェッチ レース条件", () => {
  beforeEach(() => {
    countRecordsByCompetitionMock.mockReset();
  });

  it("[V-RACE-01/02] A→キャンセル→B の順で開き、Aが後から解決してもBの確認ボタンはBの解決までdisabledのまま", async () => {
    const deferredA = createDeferred<number>();
    const deferredB = createDeferred<number>();
    countRecordsByCompetitionMock.mockImplementation((id: string) => {
      if (id === "comp-A") return deferredA.promise;
      if (id === "comp-B") return deferredB.promise;
      return Promise.resolve(0);
    });

    const user = userEvent.setup();
    const entries = [makeCompetitionItem("comp-A"), makeCompetitionItem("comp-B")];

    renderWithIntl(
      <DayDetailModal isOpen={true} onClose={vi.fn()} date={new Date("2026-07-10")} entries={entries} />,
    );

    // 1. 大会A の削除確認を開く (fetch A 発火)
    await user.click(screen.getByTestId("delete-competition-comp-A"));
    expect(countRecordsByCompetitionMock).toHaveBeenCalledWith("comp-A");
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();

    // 2. キャンセル (fetch A はまだ pending のまま)
    await user.click(screen.getByTestId("cancel-delete-button"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();

    // 3. 大会B の削除確認を開く (fetch B 発火、fetch A は依然 pending)
    await user.click(screen.getByTestId("delete-competition-comp-B"));
    expect(countRecordsByCompetitionMock).toHaveBeenCalledWith("comp-B");
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();

    // 4. 遅れていた fetch A が解決 (B の fetch はまだ未解決)
    await act(async () => {
      deferredA.resolve(3);
      await Promise.resolve();
      await Promise.resolve();
    });

    // ★ここが Critical の core assertion: A の解決だけで B の確認ボタンが
    // 有効化されてしまってはいけない (件数未取得のまま削除確定できる状態を防ぐ)
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();
    // A の件数 (3) が B の警告として紛れ込んでもいけない
    const leaked = screen.queryByTestId("delete-confirm-extra-message");
    if (leaked) {
      expect(leaked).not.toHaveTextContent("3");
    }

    // 5. 本来の B の fetch が解決すれば、正しく有効化され B の件数が表示される (回帰)
    await act(async () => {
      deferredB.resolve(9);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-delete-button")).not.toBeDisabled();
    });
    expect(screen.getByTestId("delete-confirm-extra-message")).toHaveTextContent("9");
  });
});
