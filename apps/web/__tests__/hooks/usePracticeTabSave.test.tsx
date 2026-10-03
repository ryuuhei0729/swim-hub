/**
 * usePracticeTabSave テスト
 *
 * dashboard / /practice 履歴タブの双方から共有される練習タブモーダル一括保存ロジック。
 * ダッシュボードの旧 handlePracticeTabSave から挙動を変えずに切り出したフックであるため、
 * 「親(practice) INSERT/UPDATE 分岐」「子(practice_logs) diff の ADD/UPDATE/DELETE」
 * 「画像アップロード失敗時のロールバック」という既存契約を回帰させないことを検証する。
 *
 * マイルストーン判定の設計:
 *   ログ保存は常に skipMilestoneUpdate=true (createPracticeLog/updatePracticeLog の
 *   onSuccess では個別に判定しない)。タイムは PracticeAPI.createPracticeTimes /
 *   replacePracticeTimes で保存し、ADD/UPDATE 全ループ後に
 *   (1) getQueryClient().invalidateQueries、(2) goalAPI.updateAllMilestoneStatuses を
 *   「変更があれば1回だけ」呼ぶ。
 *   「Nメニュー保存でも判定1回」「判定/invalidateがタイム永続化の後」であることを
 *   呼び出し順序・回数で assert する。
 *
 * トートロジー防止メモ:
 *   実装のロジックをそのままコピーしたアサーションにならないよう、
 *   「呼ばれた関数と引数」「呼ばれなかった関数」「呼び出し順序」の観点で検証する。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeTabSaveParams } from "@/components/forms/PracticeTabModal";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";

// -----------------------------------------------------------------------
// 依存モック
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  uploadPracticeImage: vi.fn(),
  deletePracticeImage: vi.fn(),
  createPracticeTimes: vi.fn(),
  replacePracticeTimes: vi.fn(),
  invalidateQueries: vi.fn(),
  updateAllMilestoneStatuses: vi.fn(),
  // 呼び出し順序を記録する共有配列。各 it の beforeEach で空にする。
  callOrder: [] as string[],
}));

vi.mock("@apps/shared/api", () => ({
  PracticeAPI: class {
    uploadPracticeImage = mocks.uploadPracticeImage;
    deletePracticeImage = mocks.deletePracticeImage;
    createPracticeTimes = (...args: unknown[]) => {
      mocks.callOrder.push("createPracticeTimes");
      return mocks.createPracticeTimes(...args);
    };
    replacePracticeTimes = (...args: unknown[]) => {
      mocks.callOrder.push("replacePracticeTimes");
      return mocks.replacePracticeTimes(...args);
    };
  },
}));

// usePracticeTabSave 内部で `new GoalAPI(supabase)` して直接呼ぶため、
// react-query の mutation 経由ではなく API クラスそのものをモックする。
vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: class {
    updateAllMilestoneStatuses = (...args: unknown[]) => {
      mocks.callOrder.push("updateAllMilestoneStatuses");
      return mocks.updateAllMilestoneStatuses(...args);
    };
  },
}));

// usePracticeTabSave は useQueryClient() (React Context) ではなく
// getQueryClient() (シングルトン取得関数) を直接呼ぶ実装。
vi.mock("@/providers/QueryProvider", () => ({
  getQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => {
      mocks.callOrder.push("invalidateQueries");
      return mocks.invalidateQueries(...args);
    },
  }),
}));

vi.mock("@/lib/video-upload-client", () => ({
  uploadVideoClient: vi.fn().mockResolvedValue(undefined),
}));

// processPracticeImage は canvas/Image 読み込みを伴う重い処理のため、
// jsdom 環境で実物を動かさずダミーの処理結果を返すよう差し替える
vi.mock("@/utils/imageUtils", () => ({
  processPracticeImage: vi.fn().mockResolvedValue({
    original: new File(["o"], "original.webp"),
    thumbnail: new File(["t"], "thumb.webp"),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

// 画像処理を伴わない最小の params を作るヘルパー
const baseParams = (overrides: Partial<PracticeTabSaveParams> = {}): PracticeTabSaveParams => ({
  basicData: { date: "2026-07-10", title: "", place: "", note: "" },
  imageData: undefined,
  logs: [],
  editingPracticeId: null,
  originalLogIds: [],
  ...overrides,
});

// 最小の fake supabase (image 処理・タグ再同期の select/insert/delete チェーンを提供)
function createFakeSupabase() {
  const selectSingle = vi.fn().mockResolvedValue({ data: { image_paths: [] } });
  const chain = {
    select: () => ({ eq: () => ({ single: selectSingle }) }),
    update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  };
  return { from: vi.fn(() => chain) };
}

describe("usePracticeTabSave", () => {
  let supabase: ReturnType<typeof createFakeSupabase>;
  let createPractice: ReturnType<typeof vi.fn>;
  let updatePractice: ReturnType<typeof vi.fn>;
  let createPracticeLog: ReturnType<typeof vi.fn>;
  let updatePracticeLog: ReturnType<typeof vi.fn>;
  let deletePracticeLog: ReturnType<typeof vi.fn>;
  let setPracticeLoading: ReturnType<typeof vi.fn>;
  let setEditingPracticeId: ReturnType<typeof vi.fn>;
  let closePracticeTabModal: ReturnType<typeof vi.fn>;
  let onSaved: ReturnType<typeof vi.fn>;

  const setup = (
    user: { id: string } | null = { id: "user-1" },
    options: { allowParentUpdate?: boolean } = {},
  ) => {
    supabase = createFakeSupabase();
    createPractice = vi.fn().mockResolvedValue({ id: "new-practice-id" });
    updatePractice = vi.fn().mockResolvedValue({ id: "practice-1" });
    createPracticeLog = vi.fn().mockResolvedValue({ id: "new-log-id" });
    updatePracticeLog = vi.fn().mockResolvedValue({ id: "log-1" });
    deletePracticeLog = vi.fn().mockResolvedValue(undefined);
    setPracticeLoading = vi.fn();
    setEditingPracticeId = vi.fn();
    closePracticeTabModal = vi.fn();
    onSaved = vi.fn();

    const { result } = renderHook(
      () =>
        usePracticeTabSave({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: supabase as any,
          user,
          createPractice,
          updatePractice,
          createPracticeLog,
          updatePracticeLog,
          deletePracticeLog,
          setPracticeLoading,
          setEditingPracticeId,
          closePracticeTabModal,
          onSaved,
          ...options,
        }),
      { wrapper },
    );
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callOrder.length = 0;
    mocks.createPracticeTimes.mockResolvedValue(undefined);
    mocks.replacePracticeTimes.mockResolvedValue(undefined);
    mocks.updateAllMilestoneStatuses.mockResolvedValue(undefined);
  });

  it("user が null の場合は認証エラーを投げ、createPractice/updatePractice は呼ばれない", async () => {
    const result = setup(null);

    await expect(
      act(async () => {
        await result.current(baseParams());
      }),
    ).rejects.toThrow();

    expect(createPractice).not.toHaveBeenCalled();
    expect(updatePractice).not.toHaveBeenCalled();
  });

  it("editingPracticeId が null の場合は createPractice が呼ばれ、新規IDで setEditingPracticeId される", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          basicData: { date: "2026-07-10", title: "朝練", place: "市民プール", note: "" },
        }),
      );
    });

    expect(createPractice).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-10", title: "朝練", place: "市民プール" }),
    );
    expect(updatePractice).not.toHaveBeenCalled();
    expect(setEditingPracticeId).toHaveBeenCalledWith("new-practice-id");
  });

  it("editingPracticeId が指定されている場合は updatePractice が呼ばれ、createPractice は呼ばれない", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingPracticeId: "practice-1" }));
    });

    expect(updatePractice).toHaveBeenCalledWith(
      "practice-1",
      expect.objectContaining({ date: "2026-07-10" }),
    );
    expect(createPractice).not.toHaveBeenCalled();
  });

  it("ログ diff の ADD/UPDATE/DELETE がそれぞれ正しい API 呼び出しに変換される", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          editingPracticeId: "practice-1",
          originalLogIds: ["11111111-1111-1111-1111-111111111111", "log-to-delete-uuid0000"],
          logs: [
            {
              style: "Fr",
              swimCategory: "Swim",
              distance: 100,
              reps: 4,
              sets: 1,
              circleTime: 90,
              note: "",
              tags: [],
              times: [],
              tempMenuId: "11111111-1111-1111-1111-111111111111",
            },
            {
              style: "Br",
              swimCategory: "Swim",
              distance: 50,
              reps: 2,
              sets: 1,
              circleTime: 60,
              note: "",
              tags: [],
              times: [],
              // tempMenuId なし = 新規追加
            },
          ],
        }),
      );
    });

    // 新規ログ (tempMenuId なし) → createPracticeLog。このフックからは常に
    // skipMilestoneUpdate=true (第2引数) を渡す (判定はこのフックに一本化するため、
    // react-query 側の個別判定を毎回抑止する)。
    expect(createPracticeLog).toHaveBeenCalledTimes(1);
    expect(createPracticeLog).toHaveBeenCalledWith(
      expect.objectContaining({ practice_id: "practice-1", style: "Br", distance: 50 }),
      true,
    );

    // 既存ログ (originalLogIds に含まれる UUID) → updatePracticeLog (同様に skipMilestoneUpdate=true)
    expect(updatePracticeLog).toHaveBeenCalledTimes(1);
    expect(updatePracticeLog).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      expect.objectContaining({ style: "Fr", distance: 100 }),
      true,
    );

    // originalLogIds にあったが draft に残っていない ID → deletePracticeLog
    // (isDbUuid でないダミーIDは "log-to-delete-uuid0000" のように UUID 形式でない値を使っている点に注意:
    //  toDelete は「originalLogIds のうち draft の draftIdSet に含まれない ID」全てが対象になる)
    expect(deletePracticeLog).toHaveBeenCalledWith("log-to-delete-uuid0000");

    // 時間の永続化はこのフック内部で PracticeAPI.replacePracticeTimes を直接呼ぶ
    // (react-query の createPracticeTime/deletePracticeTime 経由ではない)。
    // 更新ログの times は [] なので、既存タイムのクリアとして呼ばれる (空配列)。
    expect(mocks.replacePracticeTimes).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      [],
    );
    // 新規ログは times: [] のため createPracticeTimes 自体は呼ばれない
    // (バリデーション: time > 0 の要素が無い)
    expect(mocks.createPracticeTimes).not.toHaveBeenCalled();
  });

  it("全成功後に setEditingPracticeId(null) / closePracticeTabModal / onSaved / setPracticeLoading(false) が呼ばれる", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingPracticeId: "practice-1" }));
    });

    await waitFor(() => {
      expect(closePracticeTabModal).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(setPracticeLoading).toHaveBeenCalledWith(false);
  });

  it("画像アップロード失敗時はエラーを再スローし、setPracticeLoading(false) が呼ばれる (モーダルは閉じない)", async () => {
    const result = setup();
    mocks.uploadPracticeImage.mockRejectedValue(new Error("upload failed"));

    const file = new File(["dummy"], "photo.png", { type: "image/png" });

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            imageData: {
              newFiles: [{ file, previewUrl: "blob://x" }],
              deletedIds: [],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }),
        );
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(closePracticeTabModal).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(setPracticeLoading).toHaveBeenCalledWith(false);
  });

  // -------------------------------------------------------------------------
  // Sprint Contract 2 (編集禁止) D2: 親子分離。allowParentUpdate=false のとき、
  // 親 (practices) の UPDATE と image_paths 書き込みをスキップし、子 (practice_logs)
  // の保存は継続する。SC2 (既存のチーム練習に自分のログを追加できる) の核心。
  // -------------------------------------------------------------------------
  describe("allowParentUpdate (Sprint Contract 2 D2: 親子分離)", () => {
    it("[SC2-web-1] allowParentUpdate=false のとき、updatePractice は呼ばれないが練習ログの保存は継続する", async () => {
      const result = setup({ id: "user-1" }, { allowParentUpdate: false });

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            basicData: { date: "2026-07-10", title: "他人のチーム練習", place: "", note: "" },
            logs: [
              {
                style: "Fr",
                swimCategory: "Swim",
                distance: 100,
                reps: 4,
                sets: 1,
                circleTime: 90,
                note: "",
                tags: [],
                times: [],
                // tempMenuId なし = 新規追加 (自分のログ)
              },
            ],
          }),
        );
      });

      expect(updatePractice).not.toHaveBeenCalled();
      expect(createPracticeLog).toHaveBeenCalledTimes(1);
      expect(createPracticeLog).toHaveBeenCalledWith(
        expect.objectContaining({ practice_id: "practice-1", style: "Fr", distance: 100 }),
        true,
      );
      await waitFor(() => {
        expect(closePracticeTabModal).toHaveBeenCalledTimes(1);
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("[SC2-web-2] allowParentUpdate を省略した場合は従来どおり updatePractice が呼ばれる (デフォルト true・チームタブ向け非退行)", async () => {
      const result = setup(); // options 省略

      await act(async () => {
        await result.current(baseParams({ editingPracticeId: "practice-1" }));
      });

      expect(updatePractice).toHaveBeenCalledWith(
        "practice-1",
        expect.objectContaining({ date: "2026-07-10" }),
      );
    });

    it("[SC6-web] allowParentUpdate=false のとき、画像を変更していても uploadPracticeImage 自体が呼ばれない " +
      "(アップロード後にスキップすると孤児ファイルが残るため、アップロード前にスキップしなければならない)", async () => {
      const result = setup({ id: "user-1" }, { allowParentUpdate: false });
      const file = new File(["dummy"], "photo.png", { type: "image/png" });

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            imageData: {
              newFiles: [{ file, previewUrl: "blob://x" }],
              deletedIds: [],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }),
        );
      });

      // アップロード自体が発生していないことを確認する (アップロード後にDB更新だけ
      // スキップする実装だと、ここが呼ばれてしまい孤児ファイルが Storage に残る)。
      expect(mocks.uploadPracticeImage).not.toHaveBeenCalled();
      expect(updatePractice).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(closePracticeTabModal).toHaveBeenCalledTimes(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Reviewer 指摘 (F3): TeamPractices.tsx の自己ログ追加 (非 admin) で子 (practice_logs)
  // 保存が失敗し editingPracticeId が保持されたまま再送信された場合、basicData が
  // 直前に自分が適用した値と無変更なら updatePractice を呼ばない (RLS 拒否の再発生を防ぐ)。
  // -------------------------------------------------------------------------
  describe("lastAppliedParentDataRef ダーティチェック (Reviewer F3)", () => {
    it(
      "[F3-web-1] 新規作成 (createPractice) 直後、同一の basicData で再送信すると" +
        " updatePractice は呼ばれない (直前に自分が適用した内容と無変更のため)",
      async () => {
        const result = setup({ id: "user-1" }, { allowParentUpdate: true });
        const basicData = { date: "2026-07-10", title: "朝練", place: "市民プール", note: "" };

        // 1回目: 新規作成 (createPractice が呼ばれ、practiceId が確定する)
        await act(async () => {
          await result.current(baseParams({ basicData, editingPracticeId: null }));
        });
        expect(createPractice).toHaveBeenCalledTimes(1);
        expect(updatePractice).not.toHaveBeenCalled();

        // 2回目: 子 (practice_logs) の再送信を模して、同一 practiceId・同一 basicData で
        // 送信する (子失敗後の再試行シナリオ)。
        await act(async () => {
          await result.current(
            baseParams({ basicData, editingPracticeId: "new-practice-id" }),
          );
        });

        expect(updatePractice).not.toHaveBeenCalled();
      },
    );

    it(
      "[F3-web-2 / 非退行] basicData が直前の適用内容と異なる場合は、" +
        " 同一 practiceId への再送信でも updatePractice が呼ばれる",
      async () => {
        const result = setup({ id: "user-1" }, { allowParentUpdate: true });
        const firstBasicData = { date: "2026-07-10", title: "朝練", place: "市民プール", note: "" };

        await act(async () => {
          await result.current(baseParams({ basicData: firstBasicData, editingPracticeId: null }));
        });
        expect(createPractice).toHaveBeenCalledTimes(1);

        const changedBasicData = { ...firstBasicData, title: "夜練" };
        await act(async () => {
          await result.current(
            baseParams({ basicData: changedBasicData, editingPracticeId: "new-practice-id" }),
          );
        });

        expect(updatePractice).toHaveBeenCalledTimes(1);
        expect(updatePractice).toHaveBeenCalledWith(
          "new-practice-id",
          expect.objectContaining({ title: "夜練" }),
        );
      },
    );

    it(
      "[F3-web-3 / 非退行] 既存の練習を編集 (editingPracticeId 指定で開始) した場合、" +
        " 初回の保存では basicData が無変更でも updatePractice が呼ばれる" +
        " (lastAppliedParentDataRef は自分がこのフックで適用した履歴のみを追跡し、" +
        " モーダルを開いた時点の初期値とは比較しないため)",
      async () => {
        const result = setup({ id: "user-1" }, { allowParentUpdate: true });

        await act(async () => {
          await result.current(
            baseParams({
              basicData: { date: "2026-07-10", title: "既存タイトル", place: "", note: "" },
              editingPracticeId: "practice-1",
            }),
          );
        });

        expect(updatePractice).toHaveBeenCalledTimes(1);
      },
    );
  });

  // -------------------------------------------------------------------------
  // タイム永続化後に1回だけ判定する。「N メニュー保存でも判定は1回」
  // 「判定/invalidate はタイム永続化の後」を呼び出し回数・呼び出し順序で assert する
  // (引数を足すだけの弱い追従にしない)。
  // -------------------------------------------------------------------------
  describe("タイム永続化後のマイルストーン判定 (1回の保存につき1回)", () => {
    it("複数メニュー (2件、両方ともタイムあり) を保存しても updateAllMilestoneStatuses は1回だけ呼ばれる", async () => {
      const result = setup();

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            logs: [
              {
                style: "Fr",
                swimCategory: "Swim",
                distance: 100,
                reps: 1,
                sets: 1,
                circleTime: 90,
                note: "",
                tags: [],
                times: [{ setNumber: 1, repNumber: 1, time: 65 }],
                // tempMenuId なし = 新規追加その1
              },
              {
                style: "Br",
                swimCategory: "Swim",
                distance: 50,
                reps: 1,
                sets: 1,
                circleTime: 60,
                note: "",
                tags: [],
                times: [{ setNumber: 1, repNumber: 1, time: 40 }],
                // tempMenuId なし = 新規追加その2
              },
            ],
          }),
        );
      });

      // メニューごとに createPracticeTimes は個別に呼ばれる (2回)
      expect(mocks.createPracticeTimes).toHaveBeenCalledTimes(2);
      // しかしマイルストーン判定は保存1回につき1回だけ (メニュー数に比例しない)
      expect(mocks.updateAllMilestoneStatuses).toHaveBeenCalledTimes(1);
      expect(mocks.updateAllMilestoneStatuses).toHaveBeenCalledWith("user-1");
      // invalidate もタイム永続化1回の保存につき1回
      expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1);
    });

    it("呼び出し順序: 全メニューのタイム永続化 → invalidateQueries → updateAllMilestoneStatuses の順で1回ずつ実行される", async () => {
      const result = setup();

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            logs: [
              {
                style: "Fr",
                swimCategory: "Swim",
                distance: 100,
                reps: 1,
                sets: 1,
                circleTime: 90,
                note: "",
                tags: [],
                times: [{ setNumber: 1, repNumber: 1, time: 65 }],
              },
              {
                style: "Br",
                swimCategory: "Swim",
                distance: 50,
                reps: 1,
                sets: 1,
                circleTime: 60,
                note: "",
                tags: [],
                times: [{ setNumber: 1, repNumber: 1, time: 40 }],
              },
            ],
          }),
        );
      });

      // callOrder は "createPracticeTimes" が (メニュー数分) 先頭に並び、
      // その後 "invalidateQueries"、最後に "updateAllMilestoneStatuses" が
      // ちょうど1回ずつ来ることを厳密に確認する (実装のコピーではなく
      // 観測可能な順序・回数のみを固定する)。
      expect(mocks.callOrder).toEqual([
        "createPracticeTimes",
        "createPracticeTimes",
        "invalidateQueries",
        "updateAllMilestoneStatuses",
      ]);
    });

    it("ログの変更が無い保存 (basicData のみの更新等) では updateAllMilestoneStatuses は呼ばれない (invalidateQueries はログ変更の有無に関わらず呼ばれる)", async () => {
      const result = setup();

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            basicData: { date: "2026-07-11", title: "タイトルのみ変更", place: "", note: "" },
            logs: [],
            originalLogIds: [],
          }),
        );
      });

      expect(mocks.createPracticeTimes).not.toHaveBeenCalled();
      expect(mocks.replacePracticeTimes).not.toHaveBeenCalled();
      // updateAllMilestoneStatuses は ADD/UPDATE が1件も無ければ呼ばれない
      // (hasLogChanges ガード)。invalidateQueries はログ変更の有無に関わらず
      // 実装上常に呼ばれるため、ここでは判定の抑止のみを固定する。
      expect(mocks.updateAllMilestoneStatuses).not.toHaveBeenCalled();
    });

    it("更新ログ (UPDATE 分岐) のタイム再同期のみでも、判定は1回だけ行われる", async () => {
      const result = setup();

      await act(async () => {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            originalLogIds: ["11111111-1111-1111-1111-111111111111"],
            logs: [
              {
                style: "Fr",
                swimCategory: "Swim",
                distance: 100,
                reps: 1,
                sets: 1,
                circleTime: 90,
                note: "",
                tags: [],
                times: [{ setNumber: 1, repNumber: 1, time: 58 }],
                tempMenuId: "11111111-1111-1111-1111-111111111111",
              },
            ],
          }),
        );
      });

      expect(mocks.replacePracticeTimes).toHaveBeenCalledTimes(1);
      expect(mocks.replacePracticeTimes).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
        [{ set_number: 1, rep_number: 1, time: 58 }],
      );
      expect(mocks.updateAllMilestoneStatuses).toHaveBeenCalledTimes(1);
      expect(mocks.callOrder).toEqual([
        "replacePracticeTimes",
        "invalidateQueries",
        "updateAllMilestoneStatuses",
      ]);
    });
  });
});
