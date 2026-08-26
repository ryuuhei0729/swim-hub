/**
 * CompetitionDetailModal テスト
 *
 * /competition 履歴タブの行クリックで開く詳細モーダル。ダッシュボード由来の
 * CompetitionDetails (mode="record") / CompetitionWithEntry (mode="entry") /
 * AttendanceModal / DeleteConfirmModal をそのまま再利用するラッパーであるため、
 * CompetitionDetails / CompetitionWithEntry / AttendanceModal は薄いスタブに
 * 差し替え、「配線」と DeleteConfirmModal (実物) の連携のみを検証する。
 *
 * Sprint Contract 検証観点:
 *   [V-W-C01] mode="record" のとき CompetitionDetails が表示される
 *   [V-W-C02] 「編集」導線から CompetitionTabModal の competition タブが開く (onEditCompetition)
 *   [V-W-C03] 「記録追加/編集」導線から CompetitionTabModal の record タブが開く (onOpenRecordTab)
 *   [V-W-C04] 大会削除ボタンで DeleteConfirmModal が表示され、確認/キャンセルが正しく発火する
 *   [V-W-C05] mode="entry" のとき CompetitionWithEntry が表示される (エントリー済み・記録未登録)
 *   [V-W-C06] entry モードの「エントリー編集」から onOpenEntryTab が呼ばれる
 *   [V-W-C07] 記録の削除 (onDeleteRecord) は DeleteConfirmModal を経由せず即時に発火する (確認なし)
 *   [V-W-C08] エントリー削除は DeleteConfirmModal 経由で確認される
 *   [V-04] 大会削除確認: isTeamCompetition=false のとき countRecordsByCompetition を呼び、
 *          件数>0なら DeleteConfirmModal に件数警告 (competitionRecordsWarning) が追加表示される
 *   [V-04] isTeamCompetition=true のときは countRecordsByCompetition を一切呼ばない
 *          (チーム大会では records は削除されないため、誤情報警告を出さない)
 *   [V-04] 件数=0 のときは追加警告文を表示しない
 *   [V-04] 件数取得が失敗しても削除確認自体はブロックされない (非致命フォールバック)
 *
 * QA追記: 本コンポーネントは削除件数取得のため useAuth() (@/contexts) を経由して
 * supabase クライアントを取得するようになった (RecordAPI 経由)。既存テストはこの依存を
 * モックしておらず "useAuth must be used within an AuthProvider" で全滅していたため、
 * @/contexts と @apps/shared/api/records (RecordAPI) をモックして復旧する。
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";

const countRecordsByCompetitionMock = vi.hoisted(() => vi.fn());

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    countRecordsByCompetition = countRecordsByCompetitionMock;
  },
}));

vi.mock("@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/components", () => ({
  CompetitionDetails: (props: {
    onEdit?: (images?: unknown) => void;
    onDelete?: () => void;
    onAddRecord?: () => void;
    onEditRecord?: (record: unknown) => void;
    onDeleteRecord?: (recordId: string) => void;
  }) => (
    <div data-testid="competition-details-stub">
      <button onClick={() => props.onEdit?.()}>大会を編集</button>
      <button onClick={() => props.onDelete?.()}>大会を削除</button>
      <button onClick={() => props.onAddRecord?.()}>記録を追加</button>
      <button onClick={() => props.onEditRecord?.({ id: "record-1" })}>記録を編集</button>
      <button onClick={() => props.onDeleteRecord?.("record-1")}>記録を削除(確認なし)</button>
    </div>
  ),
  CompetitionWithEntry: (props: {
    competitionName: string;
    onAddRecord?: () => void;
    onEditCompetition?: (images?: unknown) => void;
    onDeleteCompetition?: () => void;
    onEditEntry?: () => void;
    onDeleteEntry?: (entryId: string) => void;
  }) => (
    <div data-testid="competition-with-entry-stub">
      <span data-testid="entry-competition-name">{props.competitionName}</span>
      <button onClick={() => props.onAddRecord?.()}>記録を追加(entry)</button>
      <button onClick={() => props.onEditCompetition?.()}>大会を編集(entry)</button>
      <button onClick={() => props.onDeleteCompetition?.()}>大会を削除(entry)</button>
      <button onClick={() => props.onEditEntry?.()}>エントリーを編集</button>
      <button onClick={() => props.onDeleteEntry?.("entry-1")}>エントリーを削除</button>
    </div>
  ),
  AttendanceModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="attendance-modal-stub" /> : null,
}));

import CompetitionDetailModal from "../CompetitionDetailModal";

type Props = React.ComponentProps<typeof CompetitionDetailModal>;

const renderModal = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    isOpen: true,
    onClose: vi.fn(),
    mode: "record",
    competitionId: "comp-1",
    date: "2026-07-10",
    onEditCompetition: vi.fn(),
    onDeleteCompetition: vi.fn(),
    onOpenRecordTab: vi.fn(),
    onOpenEntryTab: vi.fn(),
    onDeleteRecord: vi.fn(),
    onDeleteEntry: vi.fn(),
    ...overrides,
  };

  const rendered = render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionDetailModal {...props} />
    </NextIntlClientProvider>,
  );

  return { ...rendered, props };
};

describe("CompetitionDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countRecordsByCompetitionMock.mockReset().mockResolvedValue(0);
  });

  describe("mode=record", () => {
    it("[V-W-C01] CompetitionDetails が表示される", () => {
      renderModal({ mode: "record" });
      expect(screen.getByTestId("record-detail-page-modal")).toBeInTheDocument();
      expect(screen.getByTestId("competition-details-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("competition-with-entry-stub")).not.toBeInTheDocument();
    });

    it("[V-W-C02] 編集ボタンで onEditCompetition が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });
      await user.click(screen.getByText("大会を編集"));
      expect(props.onEditCompetition).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C03] 記録の追加・編集はどちらも onOpenRecordTab を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("記録を追加"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(1);

      await user.click(screen.getByText("記録を編集"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(2);
    });

    it("[V-W-C07] 記録削除ボタンは確認モーダルを経由せず即時に onDeleteRecord を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("記録を削除(確認なし)"));

      expect(props.onDeleteRecord).toHaveBeenCalledWith("record-1");
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    it("[V-W-C04] 大会削除ボタンで DeleteConfirmModal が表示され、確認で onDeleteCompetition が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("大会を削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteCompetition).toHaveBeenCalledTimes(1);
      expect(props.onDeleteEntry).not.toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    it("[V-W-C04] 大会削除の確認モーダルでキャンセルすると onDeleteCompetition は呼ばれない", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record" });

      await user.click(screen.getByText("大会を削除"));
      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("cancel-delete-button"));

      expect(props.onDeleteCompetition).not.toHaveBeenCalled();
      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });

    it("[V-04] 個人大会 (isTeamCompetition=false) で件数>0のとき、件数警告が追加表示される", async () => {
      // "1" のような部分文字列マッチしうる値を避け、判別可能な件数にする
      countRecordsByCompetitionMock.mockResolvedValue(7);
      const user = userEvent.setup();
      renderModal({ mode: "record", isTeamCompetition: false, competitionId: "comp-personal" });

      await user.click(screen.getByText("大会を削除"));

      expect(countRecordsByCompetitionMock).toHaveBeenCalledWith("comp-personal");
      await waitFor(() => {
        expect(screen.getByTestId("delete-confirm-extra-message")).toHaveTextContent(
          "この大会に紐づく記録 7 件も削除されます。",
        );
      });
    });

    it("[V-04] チーム大会 (isTeamCompetition=true) では countRecordsByCompetition を一切呼ばず、件数警告も出ない", async () => {
      const user = userEvent.setup();
      renderModal({ mode: "record", isTeamCompetition: true, competitionId: "comp-team" });

      await user.click(screen.getByText("大会を削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      expect(countRecordsByCompetitionMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("delete-confirm-extra-message")).not.toBeInTheDocument();
    });

    it("[V-04] 件数=0のときは追加警告文を表示しない", async () => {
      countRecordsByCompetitionMock.mockResolvedValue(0);
      const user = userEvent.setup();
      renderModal({ mode: "record", isTeamCompetition: false, competitionId: "comp-empty" });

      await user.click(screen.getByText("大会を削除"));

      await waitFor(() => {
        expect(countRecordsByCompetitionMock).toHaveBeenCalledWith("comp-empty");
      });
      expect(screen.queryByTestId("delete-confirm-extra-message")).not.toBeInTheDocument();
    });

    it("[V-04] 件数取得が失敗しても削除確認はブロックされず、確認で onDeleteCompetition が呼ばれる (非致命フォールバック)", async () => {
      countRecordsByCompetitionMock.mockRejectedValue(new Error("network error"));
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "record", isTeamCompetition: false, competitionId: "comp-err" });

      await user.click(screen.getByText("大会を削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteCompetition).toHaveBeenCalledTimes(1);
    });
  });

  describe("mode=entry (エントリー済み・記録未登録)", () => {
    it("[V-W-C05] CompetitionWithEntry が表示される", () => {
      renderModal({
        mode: "entry",
        entryId: "entry-1",
        styleId: 2,
        styleName: "50m自由形",
        competitionName: "テスト大会",
      });
      expect(screen.getByTestId("competition-with-entry-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("competition-details-stub")).not.toBeInTheDocument();
      expect(screen.getByTestId("entry-competition-name")).toHaveTextContent("テスト大会");
    });

    it("competitionName 未指定時は既定の大会名にフォールバックする", () => {
      renderModal({ mode: "entry", entryId: "entry-1", competitionName: undefined });
      expect(screen.getByTestId("entry-competition-name")).toHaveTextContent("大会");
    });

    it("[V-W-C06] 「エントリーを編集」で onOpenEntryTab が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });
      await user.click(screen.getByText("エントリーを編集"));
      expect(props.onOpenEntryTab).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C03] entry モードの「記録を追加」でも onOpenRecordTab が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });
      await user.click(screen.getByText("記録を追加(entry)"));
      expect(props.onOpenRecordTab).toHaveBeenCalledTimes(1);
    });

    it("[V-W-C08] エントリー削除は DeleteConfirmModal 経由で確認され、確認後 onDeleteEntry(entryId) が呼ばれる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });

      await user.click(screen.getByText("エントリーを削除"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteEntry).toHaveBeenCalledWith("entry-1");
      expect(props.onDeleteCompetition).not.toHaveBeenCalled();
    });

    it("entry モードの大会削除 (onDeleteCompetition) も DeleteConfirmModal 経由になる", async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ mode: "entry", entryId: "entry-1" });

      await user.click(screen.getByText("大会を削除(entry)"));
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();

      await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-delete-button"));
      expect(props.onDeleteCompetition).toHaveBeenCalledTimes(1);
      expect(props.onDeleteEntry).not.toHaveBeenCalled();
    });
  });

  it("isOpen=false のとき何も描画しない", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId("record-detail-page-modal")).not.toBeInTheDocument();
  });

  it("閉じるボタン (X) で onClose が呼ばれる", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.click(screen.getByTestId("modal-close-button"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Reviewer Critical 回帰テスト: 大会削除確認の件数フェッチ レース条件
 *
 * CompetitionDetailModal は competitionId が prop で不変のため、DayDetailModal
 * (dashboard) と同じ「competitionId をトークンにする」方式が使えない
 * (同一大会に対する open→cancel→re-open を区別できない)。そのため
 * `recordCountRequestSeqRef` という**インクリメント式連番**でリクエストを識別する
 * 別方式が採用されている。したがってシナリオも「別の大会Bを開く」ではなく
 * 「同一大会Aを open→cancel→re-open し、1回目 (古い) のレスポンスが2回目より
 * 後から解決する」形になる。
 *
 * Sprint Contract 検証観点:
 *   [V-RACE-C01] 同一大会に対する1回目のfetchが、2回目のfetch解決前に遅れて解決しても、
 *                確認ボタンは2回目自身の解決まで disabled のままである
 *   [V-RACE-C02] 1回目の件数が2回目の警告文に紛れ込まない
 *   [V-RACE-C03] 2回目の fetch が解決すれば、正しく有効化され2回目の件数が表示される (回帰)
 *
 * トートロジー防止メモ: `waitFor` で最終状態だけを見る書き方ではこのバグは再現しない。
 * deferred promise で「1回目のfetchを2回目より後に解決させる」順序を明示的に作る。
 */
describe("CompetitionDetailModal — 大会削除の件数フェッチ レース条件 (同一大会の open→cancel→re-open)", () => {
  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    countRecordsByCompetitionMock.mockReset();
  });

  it("[V-RACE-C01/02] 1回目の遅延レスポンスが2回目より後に解決しても、確認ボタンは2回目の解決までdisabledのまま", async () => {
    const deferred1 = createDeferred<number>();
    const deferred2 = createDeferred<number>();
    let callCount = 0;
    countRecordsByCompetitionMock.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? deferred1.promise : deferred2.promise;
    });

    const user = userEvent.setup();
    renderModal({ mode: "record", isTeamCompetition: false, competitionId: "comp-same" });

    // 1回目: 大会削除確認を開く (fetch #1 発火)
    await user.click(screen.getByText("大会を削除"));
    expect(countRecordsByCompetitionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();

    // キャンセル (fetch #1 はまだ pending のまま、連番だけ進む)
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("cancel-delete-button"));
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();

    // 2回目: 同じ大会の削除確認を再度開く (fetch #2 発火、fetch #1 は依然 pending)
    await user.click(screen.getByText("大会を削除"));
    expect(countRecordsByCompetitionMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();

    // 1回目 (古い) の fetch が遅れて解決 (2回目はまだ未解決)
    await act(async () => {
      deferred1.resolve(3);
      await Promise.resolve();
      await Promise.resolve();
    });

    // ★Critical の core assertion: 古い1回目の解決だけで確認ボタンが有効化されてはならない
    expect(screen.getByTestId("confirm-delete-button")).toBeDisabled();
    const leaked = screen.queryByTestId("delete-confirm-extra-message");
    if (leaked) {
      expect(leaked).not.toHaveTextContent("3");
    }

    // 2回目 (最新) の fetch が解決すれば、正しく有効化され2回目の件数が表示される
    await act(async () => {
      deferred2.resolve(9);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-delete-button")).not.toBeDisabled();
    });
    expect(screen.getByTestId("delete-confirm-extra-message")).toHaveTextContent("9");
  });
});
