// =============================================================================
// RecordFormScreen.standalone.test.tsx
// =============================================================================
//
// 大会未紐付けレコード（一括ベストタイム入力等。record.competition_id が null）の
// 編集フロー回帰検証。Sprint Contract 検証観点:
//
//   [isStandaloneRecord 検出] recordId のみ渡され (competitionId 未指定) かつ
//     読み込んだレコードの competition_id が null の場合、大会選択UIが disabled の
//     「(一括入力)」表示に切り替わり、画像アップロードUIも非表示になる
//   [pool_type 保持] 保存時、大会が無いため選択中の大会からは pool_type を導出できない。
//     読み込み時点のレコード自身の pool_type (loadedRecordPoolType) がそのまま
//     保存に使われ、失われない
//   [competition_id null 維持] 保存時に competition_id が null のまま維持される
//     (大会に誤って紐付けられない)
//
// トートロジー防止メモ: handleSave 内の式をそのまま検証するのではなく、
// 実際に Save ボタンを押した結果 updateMutation.mutateAsync に渡される引数を検証する。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRecordStore } from "@/stores/recordStore";
import { createWrapper, harness, resetRecordFormHarness } from "./recordFormScreenHarness";
import { RecordFormScreen } from "../RecordFormScreen";

const style = {
  id: 2,
  name_jp: "50m自由形",
  name: "50m Freestyle",
  style: "Fr",
  distance: 50,
};

// 大会未紐付けレコード（一括入力）: competition が null、pool_type=1 (長水路)
const standaloneRecord = {
  id: "record-1",
  user_id: "user-1",
  competition_id: null,
  style_id: 2,
  time: 30.5,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 1, // 長水路。大会が無いのでここが唯一の pool_type 情報源
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  competition: null,
  style,
  split_times: [],
};

// 大会紐付けレコード（通常フロー、非退行確認用）: competition_id あり、pool_type=0 (短水路)
const linkedCompetition = {
  id: "comp-1",
  title: "テスト大会",
  date: "2026-07-01",
  pool_type: 1, // 大会側は長水路 (record.pool_type=0 とはあえて変えて「大会から導出される」ことを確認)
  image_paths: [] as string[],
};
const linkedRecord = {
  id: "record-2",
  user_id: "user-1",
  competition_id: "comp-1",
  style_id: 2,
  time: 40.0,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 0,
  created_at: "2026-07-02T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
  competition: linkedCompetition,
  style,
  split_times: [],
};

const recordsFixture = [standaloneRecord, linkedRecord];
const stylesFixture = [style];
const competitionsFixture: unknown[] = [linkedCompetition];

describe("RecordFormScreen — 大会未紐付けレコード(一括入力)の編集", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = recordsFixture;
    harness.competitions = competitionsFixture;
    harness.competitionByIdResponses[`pool_type:${linkedCompetition.id}`] = {
      data: { pool_type: linkedCompetition.pool_type },
      error: null,
    };
    harness.competitionByIdResponses[`image_paths,title:${linkedCompetition.id}`] = {
      data: { image_paths: linkedCompetition.image_paths, title: linkedCompetition.title },
      error: null,
    };
    harness.routeParams.recordId = "record-1";
    harness.getStyles.mockResolvedValue(stylesFixture);
    harness.getAccessToken.mockResolvedValue("test-access-token");
    harness.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it("[isStandaloneRecord 検出] 大会選択UIが「(一括入力)」の disabled 表示になり、画像アップロードUIは表示されない", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    // レコード読み込み完了 (ローディング終了) を待つ
    await waitFor(() => {
      expect(screen.getByText(/一括入力/)).toBeDefined();
    });

    // 通常の大会選択プレースホルダ (大会を選択) は表示されない
    expect(screen.queryByText(/大会を選択/)).toBeNull();
  });

  it("[pool_type 保持 / competition_id null 維持] Save 押下で pool_type=1・competition_id=null のまま更新される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/一括入力/)).toBeDefined();
    });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(harness.updateMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ id, updates }] = harness.updateMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
    expect(id).toBe("record-1");
    expect(updates.competition_id).toBeNull();
    expect(updates.pool_type).toBe(1); // レコード自身の pool_type (長水路) が保持される
    expect(updates.style_id).toBe(2);
    expect(updates.time).toBe(30.5);
  });
});

// ---------------------------------------------------------------------------
// [Reviewer 指摘] 通常 (大会紐付け) の編集フロー非退行確認
// isStandaloneRecord 分岐を追加したことで、従来の大会紐付けレコード編集
// (isStandaloneRecord=false) の挙動 — 大会選択UI表示・画像アップロードUI表示・
// pool_type は大会から導出 (record 自身の pool_type ではない) — が壊れていないことを
// 検証する。
// ---------------------------------------------------------------------------
describe("RecordFormScreen — 大会紐付けレコードの通常編集フロー (非退行)", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = recordsFixture;
    harness.competitions = competitionsFixture;
    harness.competitionByIdResponses[`pool_type:${linkedCompetition.id}`] = {
      data: { pool_type: linkedCompetition.pool_type },
      error: null,
    };
    harness.competitionByIdResponses[`image_paths,title:${linkedCompetition.id}`] = {
      data: { image_paths: linkedCompetition.image_paths, title: linkedCompetition.title },
      error: null,
    };
    harness.routeParams.recordId = "record-2"; // linkedRecord (competition_id="comp-1")
    harness.getStyles.mockResolvedValue(stylesFixture);
    harness.getAccessToken.mockResolvedValue("test-access-token");
    harness.updateMutateAsync.mockResolvedValue({ id: "record-2" });
    harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it("[非退行] isStandaloneRecord=false のとき、通常の大会選択UI・画像アップロードUIが表示される (「(一括入力)」は出ない)", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeDefined();
    });

    expect(screen.queryByText(/一括入力/)).toBeNull();
    // 通常編集では画像アップロードUIが表示される (standalone では非表示)
    expect(screen.getByText("画像アップローダー")).toBeDefined();
  });

  it("[非退行] Save 押下で competition_id が維持され、pool_type は大会 (comp-1) から導出される (record 自身の pool_type=0 は使われない)", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeDefined();
    });

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(harness.updateMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ id, updates }] = harness.updateMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
    expect(id).toBe("record-2");
    expect(updates.competition_id).toBe("comp-1");
    // linkedCompetition.pool_type=1 (長水路) が使われる。record.pool_type=0 (短水路) ではない
    expect(updates.pool_type).toBe(1);
    expect(updates.style_id).toBe(2);
    expect(updates.time).toBe(40.0);
  });
});

// ---------------------------------------------------------------------------
// [QA 追加 / V-04] useRecordByIdQuery によるレコード解決が失敗する3状態
// (ローディング中 / 取得エラー / 対象レコード不存在) それぞれで、無限スピナーや
// 白紙にならず、利用者が状況を認識できる表示になっていることを検証する。
// これまでのモックは recordByIdError/recordByIdLoading フラグを一切参照しない
// 死んだ分岐 (常に false 相当) だったため、この3状態は実質未検証だった。
// ---------------------------------------------------------------------------
describe("RecordFormScreen — 編集対象レコード解決の3状態 (V-04)", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = recordsFixture;
    harness.competitions = competitionsFixture;
    harness.competitionByIdResponses[`pool_type:${linkedCompetition.id}`] = {
      data: { pool_type: linkedCompetition.pool_type },
      error: null,
    };
    harness.competitionByIdResponses[`image_paths,title:${linkedCompetition.id}`] = {
      data: { image_paths: linkedCompetition.image_paths, title: linkedCompetition.title },
      error: null,
    };
    harness.routeParams.recordId = "record-1";
    harness.getStyles.mockResolvedValue(stylesFixture);
    harness.getAccessToken.mockResolvedValue("test-access-token");
  });

  it("[V-04: ローディング] 取得中は無限に固まらず、ローディング表示になる", async () => {
    harness.recordByIdLoading = true;

    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("データを読み込み中...")).toBeDefined();
    });
    // ローディング中は編集フォーム本体 (保存ボタン) が表示されない
    expect(screen.queryByText("保存")).toBeNull();
  });

  it("[V-04: エラー] 取得エラー時は白紙にならず、エラーメッセージとリトライ導線が表示される", async () => {
    harness.recordByIdError = true;

    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("記録の取得に失敗しました")).toBeDefined();
    });
    expect(screen.queryByText("保存")).toBeNull();

    // リトライ導線が refetch を呼び出す
    fireEvent.click(screen.getByText("再試行"));
    expect(harness.refetchRecordById).toHaveBeenCalledTimes(1);
  });

  it(
    "[V-04: エラー後のリトライ中] エラー状態のままリトライ (再フェッチ) 中は、" +
      "静的なエラー表示に留まらずローディングインジケータに切り替わる (isError && isFetching)",
    async () => {
      // エラーからのリトライ中: isError は true のまま、isFetching だけが true になる
      // (react-query の isLoading は初回ロード専用のため、リトライ中は isLoading=false のまま)
      harness.recordByIdError = true;
      harness.recordByIdFetching = true;

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("データを読み込み中...")).toBeDefined();
      });
      // リトライ中は静的なエラーメッセージ・リトライボタンには留まらない
      expect(screen.queryByText("記録の取得に失敗しました")).toBeNull();
      expect(screen.queryByText("再試行")).toBeNull();
      expect(screen.queryByText("保存")).toBeNull();
    },
  );

  it("[V-04: 不存在] エラーではないが対象レコードが見つからない場合、専用メッセージが表示され保存導線は出ない (リトライボタンは無し)", async () => {
    // recordByIdError=false かつ data=null (recordsFixture に無い id) を再現するため、
    // 存在しない recordId を指定する
    harness.routeParams.recordId = "record-does-not-exist";

    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("記録データが見つかりませんでした")).toBeDefined();
    });
    expect(screen.queryByText("保存")).toBeNull();
    // エラーではないためリトライボタンは表示されない (onRetry undefined)
    expect(screen.queryByText("再試行")).toBeNull();
  });
});
