/**
 * CompetitionClient.handleStandaloneRecordSubmit — 実際の呼び出し元 (RecordLogForm) を
 * 通した失敗系の回帰テスト。
 *
 * 背景 (Reviewer Critical, PM裁定によりQAが追加):
 * 「テストが1件でも『実際の呼び出し元を通した失敗系』を書いていれば、デッドコードは
 * 一撃で発覚したはず」という指摘への対応。既存の CompetitionClient.test.tsx は
 * RecordLogForm 自体を stub に差し替えているため、handleStandaloneRecordSubmit の
 * catch { throw err } が実際に RecordLogForm 側のエラー表示・モーダル維持に繋がるかは
 * 一切検証されていなかった。このテストでは RecordLogForm は本物を render し、
 * DB書き込み層に相当する updateRecordMutation だけを reject させる。
 *
 * 【追記 (PM裁定: Warning 1 修正に伴う更新)】
 * `RecordLogForm` は catch した error を `toUserFacingMessage(error, tCommon("error"))`
 * で表示用文字列に変換するようになった。生の `Error` (生の DB エラーのシミュレーション)
 * は `common.error` (「エラーが発生しました」) にフォールバックする。期待値を汎用
 * メッセージに更新し、生のエラー文字列が画面に出ないことを assert する。
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Record as RecordType, Style } from "@apps/shared/types";
import { useCompetitionStore } from "@/stores/competition/competitionStore";

// 本人の目標バッジ用フック (React Query)。この画面テストの関心外なので「目標なし」で固定する
// (QueryClientProvider を持たないテストで useQuery が落ちるのを避ける)
vi.mock("@apps/shared/hooks/queries/goalTargets");

// RecordLogForm 内部が使う useBestTimes / VideoUploader は本テストの対象外の境界。
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

// RecordLogForm は本物を使う (barrel: "@/components/forms/RecordLogForm" は
// "./record-log/RecordLogForm" を re-export しているだけなのでモックしない)。

import { harness, renderWithMessages, setRecords } from "./competitionClientHarness";
import CompetitionClient from "../CompetitionClient";

const STYLE_FR50: Style = { id: 2, name_jp: "50m自由形", distance: 50 } as Style;

const makeStandaloneRecord = (overrides: Partial<RecordType> = {}): RecordType =>
  ({
    id: "record-1",
    user_id: "user-1",
    competition_id: null,
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: null,
    style: { id: 2, name_jp: "50m自由形", distance: 50 } as unknown as RecordType["style"],
    ...overrides,
  }) as RecordType;

const renderClient = (records: RecordType[]) => {
  setRecords(records);
  return renderWithMessages(<CompetitionClient styles={[STYLE_FR50]} />);
};

describe("CompetitionClient.handleStandaloneRecordSubmit — RecordLogForm(本物)を通した失敗系", () => {
  beforeEach(() => {
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  it(
    "updateRecordMutation が reject すると rethrow され、RecordLogForm に汎用エラーメッセージが" +
      "表示されたまま (生の DB エラー文字列は露出しない) モーダルが閉じない" +
      "(standaloneEditRecord がリセットされない)",
    async () => {
      const user = userEvent.setup();
      // 生の Error = 生の DB エラーのシミュレーション。UserFacingError ではないため
      // toUserFacingMessage は fallback (common.error) を返すはず。
      harness.updateRecordMutateAsync.mockRejectedValue(new Error("DB更新に失敗しました"));

      renderClient([makeStandaloneRecord()]);

      await user.click(screen.getByText("(一括入力)"));
      await user.click(screen.getByText("単体レコードを編集"));

      const formModal = await screen.findByTestId("record-form-modal");
      await user.click(within(formModal).getByTestId("update-record-button"));

      const errorBox = await screen.findByTestId("record-form-error");
      expect(errorBox).toHaveTextContent("エラーが発生しました");

      // 最重要: 生の DB エラー文字列がそのまま画面に出ていないこと
      // (情報露出が閉じたことの回帰テスト)。
      expect(errorBox).not.toHaveTextContent("DB更新に失敗しました");
      expect(screen.queryByText(/DB更新に失敗しました/)).not.toBeInTheDocument();

      expect(harness.updateRecordMutateAsync).toHaveBeenCalledTimes(1);
      // 失敗時は split times の置き換えまで到達しない
      expect(harness.replaceSplitTimesMutateAsync).not.toHaveBeenCalled();
      // モーダルはDOM上に残ったまま(standaloneEditRecordがリセットされていない)
      expect(screen.getByTestId("record-form-modal")).toBeInTheDocument();
    },
  );

  it(
    "[対照] updateRecordMutation が成功すればモーダルが閉じる " +
      "(上のテストが実際に失敗系の差分を検知できることの確認)",
    async () => {
      const user = userEvent.setup();
      harness.updateRecordMutateAsync.mockResolvedValue({ id: "record-1" });
      harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);

      renderClient([makeStandaloneRecord()]);

      await user.click(screen.getByText("(一括入力)"));
      await user.click(screen.getByText("単体レコードを編集"));

      const formModal = await screen.findByTestId("record-form-modal");
      await user.click(within(formModal).getByTestId("update-record-button"));

      await waitFor(() => {
        expect(screen.queryByTestId("record-form-modal")).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    },
  );
});
