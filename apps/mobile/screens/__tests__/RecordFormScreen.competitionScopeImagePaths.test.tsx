// =============================================================================
// RecordFormScreen.competitionScopeImagePaths.test.tsx
// =============================================================================
//
// GitHub issue #48 の回帰テスト (画像パス編)。
//
// バグ: 保存時の既存画像パス (existingImagePaths) の由来が、L234-270 の
//   `competitions.find((c) => c.id === currentCompetitionId)` (useCompetitionsListQuery
//   = RecordAPI.getCompetitions() の `.or("user_id.eq.<self>,user_id.is.null")` 個人スコープ)
//   に依存している。対象の大会が他管理者作成のチーム大会等でこのスコープに乗らない場合
//   `.find()` が外れ、existingImagePaths が [] のまま保存される。
//   結果、画像を1枚追加しただけで `updateCompetitionMutation` に渡る `image_paths` が
//   新規1枚だけの配列に「全置換」され、既存の画像が静かに失われる。
//
// 修正方針 (PM 確定): L234-270 の `.find()` を廃し、保存直前に
//   `supabase.from("competitions").select("image_paths").eq("id", finalCompetitionId).single()`
//   で権威ある image_paths を取得してから mergeImagePaths の第1引数に渡す。
//   取得に失敗した場合は「不明」状態を持ち、image_paths を含む update 自体を送らない
//   (無言で [] を書いて全置換を許してはならない)。
//
// Sprint Contract 検証観点:
//   [V-48-1] dropdown 一覧 (useCompetitionsListQuery) に対象大会が含まれない状態で
//     画像を1枚追加したとき、image_paths は既存2件+新規1件の計3件になる (厳密一致)。
//   [V-48-2] 同じ状況で、権威ある image_paths の取得自体も失敗したとき、
//     image_paths を含む update は一切送られない (全置換を起こさない)。
//   [V-48-3] 削除のみのケースで、削除対象以外の既存パスが保持される。
//   [V-48-4] 追加と削除が同時のケースで正しく merge される。
//   [V-48-5] 自分が作成した大会 (dropdown 一覧のスコープ内) での画像追加は非退行。
//     (このテストは現状の実装でも green になるはずの対照ケース。もし red になったら
//      テストハーネス自体の設計ミスを疑うこと)
//   [V-48-6] PM 裁定 (#47 との設計衝突の解消): 退会済みチームの大会 (RLS で
//     competitions が SELECT できない) に紐づく過去記録でも、レコード自体の保存は
//     成功する。pool_type は記録自身の値を維持し (0 に潰されていないこと)、大会取得
//     失敗を理由に保存全体を throw で中止してはならない (根拠: 一律 throw すると、
//     退会済みチームの記録を持つユーザーは note の修正すら一切できなくなる。
//     RecordFormScreen.competitionScopePoolType.test.tsx の V-47-3 と同一の分岐
//     [isEditMode && fetchedRecord] を通る)。
//   [V-48-11] dropdown 一覧のスコープ外の大会で、ID 直指定取得した title が画面に
//     表示される (実装4: selectedCompetitionName の title 解決)。
//   [V-48-12] ID 直指定取得は成功したが title が DB 上 NULL の場合、汎用フォールバック
//     文言 (t("recordMobile.fallbackTitle")) が表示され、未選択プレースホルダーは
//     表示されない (PM 判断で確定した仕様。根拠: initial_schema.sql:684 の
//     competitions.title カラムコメント「大会名（NULLの場合は「大会」と表示）」)。
//   [V-48-13] ID 直指定取得自体が失敗した場合、selectedCompetitionTitle は undefined の
//     ままとなり、従来どおり dropdown 一覧からの解決にフォールバックする (非退行)。
//
// トートロジー防止メモ: handleSave 内の式をコピーして検証するのではなく、実際に
// RecordFormScreen を render → 画像操作 → Save ボタン押下 → updateCompetitionMutation
// .mutateAsync に渡された実際の引数を検証する。mergeImagePaths はプロダクションの実装
// (@/utils/imageUpload) をそのまま使い (vi.importActual)、DB 境界
// (supabase.from("competitions")...) と useCompetitionsListQuery の一覧、
// ImageUploader の UI 操作だけをモックする。同様に [V-48-11]〜[V-48-13] も
// selectedCompetitionName の式をコピーせず、実際に画面に描画されたテキストを見る。
//
// クエリ引数を捨てない: supabase モックは select() に渡された columns 文字列を見て
// 応答を振り分ける。この画面が投げる ID 直指定クエリは
//   (a) `.select("pool_type")` (保存直前、大会からプールタイプを取得)
//   (b) `.select("image_paths")` (保存直前、権威ある既存画像パスを再取得)
//   (c) `.select("image_paths, title")` (表示用、既存画像と大会名を取得)
// の3種類が同じ id に対して飛んでくる。過去に (b) と (c) を `columns.includes("image_paths")`
// という部分一致だけで同一バケットに丸め込んだ結果、(c) 用の fixture に title が
// 存在せず title が常に null に潰れる取り違えが起きた (Reviewer 指摘)。
// そのため列名は「カンマ区切り→trim→ソート→再結合」で正規化し、(a)(b)(c) を
// 別々の応答として区別できるキーにする。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordStore } from "@/stores/recordStore";
import { createWrapper, harness, resetRecordFormHarness } from "./recordFormScreenHarness";
import { Alert } from "react-native";
import { RecordFormScreen } from "../RecordFormScreen";

// 画像の保存経路 (アップロード・削除・ギャラリー解決) はこのファイルだけが検証するので、ここでモックする
const imageUploadMocks = vi.hoisted(() => ({
  uploadImagesViaApi: vi.fn(),
  deleteImagesViaApi: vi.fn(),
  resolveGalleryImages: vi.fn(),
}));
vi.mock("@/utils/imageUpload", async () => {
  const actual = await vi.importActual<typeof import("@/utils/imageUpload")>("@/utils/imageUpload");
  return { ...actual, ...imageUploadMocks };
});

const style = {
  id: 2,
  name_jp: "50m自由形",
  name: "50m Freestyle",
  style: "Fr",
  distance: 50,
};

// 他管理者が作成した長水路チーム大会。dropdown 一覧 (useCompetitionsListQuery) の
// `.or("user_id.eq.<self>,user_id.is.null")` スコープに乗らない (.find() が外れる対象)。
// 既存画像を2枚保持している (DB上の権威あるデータ)。
const outOfScopeCompetition = {
  id: "comp-1",
  title: "他管理者のチーム大会",
  date: "2026-08-01",
  pool_type: 1,
  image_paths: ["team/comp1/existing-a.jpg", "team/comp1/existing-b.jpg"],
};
const outOfScopeRecord = {
  id: "record-1",
  user_id: "user-1",
  competition_id: "comp-1",
  style_id: 2,
  time: 30.5,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 0,
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  competition: null,
  style,
  split_times: [],
};

// 対照: 自分が作成し、dropdown 一覧のスコープに含まれる大会 (非退行確認用)
const ownCompetition = {
  id: "comp-3",
  title: "自分の大会",
  date: "2026-08-05",
  pool_type: 1,
  image_paths: ["self/comp3/existing.jpg"],
};
const ownRecord = {
  id: "record-3",
  user_id: "user-1",
  competition_id: "comp-3",
  style_id: 2,
  time: 45.0,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 0,
  created_at: "2026-08-05T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
  competition: ownCompetition,
  style,
  split_times: [],
};

// 退会済みチームの大会に紐づく過去記録。competition_id は非nullのまま残るが、
// RLS で SELECT/UPDATE とも拒否される想定 (V-48-6)。
// pool_type=1 (長水路): PM 裁定により「大会取得に失敗しても記録自身の pool_type を
// 維持して保存を継続する」仕様になったため、fixture を #47/#48 の旧バグが書き込んで
// いた値である 0 のままにすると、維持しても 0 が書かれる旧バグと区別が付かず
// トートロジーになる。意図的に非0にして「0 に潰されていないこと」を検証可能にする。
const withdrawnTeamRecord = {
  id: "record-6",
  user_id: "user-1",
  competition_id: "comp-9",
  style_id: 2,
  time: 50.0,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  competition: null, // RLS で join が落ちている
  style,
  split_times: [],
};

const newImageFileFixture = {
  uri: "file:///tmp/new-photo.jpg",
  base64: "new-photo-base64-data",
  fileExtension: "jpg",
};

const recordsFixture = [outOfScopeRecord, ownRecord, withdrawnTeamRecord];
const stylesFixture = [style];
// dropdown 一覧は comp-1 (他管理者チーム大会) ・ comp-9 (退会済みチーム大会) を含まない
const competitionsFixture: unknown[] = [ownCompetition];

const existingImageToDelete = outOfScopeCompetition.image_paths[0]!;
harness.imageUploaderActions = [
  { label: "画像を1枚追加", newFiles: [newImageFileFixture], deletedIds: [] },
  { label: "既存画像1枚目を削除", newFiles: [], deletedIds: [existingImageToDelete] },
  { label: "追加と削除を同時に行う", newFiles: [newImageFileFixture], deletedIds: [existingImageToDelete] },
];

function imagePathsUpdateCalls() {
  return harness.updateCompetitionMutateAsync.mock.calls.filter(([arg]) => {
    const updates = (arg as { updates?: Record<string, unknown> } | undefined)?.updates;
    return !!updates && Object.prototype.hasOwnProperty.call(updates, "image_paths");
  });
}

describe("RecordFormScreen — issue #48: dropdown一覧のスコープ外の大会で画像を編集すると image_paths が全置換される", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = recordsFixture;
    harness.competitions = competitionsFixture;
    harness.routeParams.recordId = "record-1";
    harness.getStyles.mockResolvedValue(stylesFixture);
    harness.getAccessToken.mockResolvedValue("test-access-token");
    harness.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);
    harness.updateCompetitionMutateAsync.mockResolvedValue({ id: "comp-1" });
    imageUploadMocks.resolveGalleryImages.mockResolvedValue([]);
    imageUploadMocks.uploadImagesViaApi.mockResolvedValue([{ path: "team/comp1/new-upload.jpg" }]);
    imageUploadMocks.deleteImagesViaApi.mockResolvedValue(undefined);

    // 権威あるDB応答のデフォルト (comp-1: 対象大会 / comp-3: 対照の自分の大会)
    harness.competitionByIdResponses["pool_type:comp-1"] = { data: { pool_type: 1 }, error: null };
    harness.competitionByIdResponses["image_paths:comp-1"] = {
      data: { image_paths: [...outOfScopeCompetition.image_paths] },
      error: null,
    };
    // 表示用の結合クエリ (`.select("image_paths, title")`)。保存直前の再取得
    // (`.select("image_paths")` 単独) とは別キーで管理する。
    harness.competitionByIdResponses["image_paths,title:comp-1"] = {
      data: {
        image_paths: [...outOfScopeCompetition.image_paths],
        title: outOfScopeCompetition.title,
      },
      error: null,
    };
    harness.competitionByIdResponses["pool_type:comp-3"] = { data: { pool_type: 1 }, error: null };
    harness.competitionByIdResponses["image_paths:comp-3"] = {
      data: { image_paths: [...ownCompetition.image_paths] },
      error: null,
    };
    harness.competitionByIdResponses["image_paths,title:comp-3"] = {
      data: {
        image_paths: [...ownCompetition.image_paths],
        title: ownCompetition.title,
      },
      error: null,
    };
  });

  it(
    "[V-48-1] 対象大会 (comp-1) が dropdown 一覧に無い状態で画像を1枚追加すると、" +
      "image_paths は既存2件+新規1件の計3件になる (厳密一致。全置換が起きてはならない)",
    async () => {
      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(harness.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = harness.updateCompetitionMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      expect(id).toBe("comp-1");
      // 回帰を止める本体assert: 既存2件が失われず、新規1件が追加された計3件になる
      expect(updates.image_paths).toEqual([
        "team/comp1/existing-a.jpg",
        "team/comp1/existing-b.jpg",
        "team/comp1/new-upload.jpg",
      ]);
      expect(updates.image_paths).toHaveLength(3);

      // 設計確認: 権威あるDBから ID 直指定で image_paths を取得していること
      // (.find() のままなら comp-1 に対する image_paths 直指定クエリは発生しない)
      expect(
        harness.competitionFetchCalls.some(
          (c) => c.table === "competitions" && c.id === "comp-1" && c.columns.includes("image_paths"),
        ),
      ).toBe(true);
    },
  );

  it(
    "[V-48-2] 権威ある image_paths の取得自体が失敗した場合、image_paths を含む update は" +
      "一切送られない (無言で既存パスを [] とみなして全置換してはならない)",
    async () => {
      harness.competitionByIdResponses["image_paths:comp-1"] = {
        data: null,
        error: new Error("RLS denied: cannot read competitions row"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      // レコード自体の保存 (updateMutateAsync) か、失敗ダイアログ (Alert) か、
      // いずれかで「何かが起きた」ことを待ってから、image_paths 付き update が
      // 送られていないことを厳密に確認する。
      await waitFor(() => {
        expect(
          harness.updateMutateAsync.mock.calls.length + vi.mocked(Alert.alert).mock.calls.length,
        ).toBeGreaterThan(0);
      });

      expect(imagePathsUpdateCalls()).toHaveLength(0);
    },
  );

  it("[V-48-3] 削除のみのケースで、削除対象以外の既存パスが保持される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });

    fireEvent.click(screen.getByText("既存画像1枚目を削除"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(harness.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ updates }] = harness.updateCompetitionMutateAsync.mock.calls[0]!;
    expect(updates.image_paths).toEqual(["team/comp1/existing-b.jpg"]);
    expect(updates.image_paths).toHaveLength(1);
  });

  it("[V-48-4] 追加と削除が同時のケースで正しく merge される", async () => {
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("保存")).toBeDefined();
    });

    fireEvent.click(screen.getByText("追加と削除を同時に行う"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => {
      expect(harness.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
    });

    const [{ updates }] = harness.updateCompetitionMutateAsync.mock.calls[0]!;
    expect(updates.image_paths).toEqual(["team/comp1/existing-b.jpg", "team/comp1/new-upload.jpg"]);
    expect(updates.image_paths).toHaveLength(2);
  });

  it(
    "[V-48-5 / 非退行] 自分が作成した大会 (comp-3, dropdown 一覧のスコープ内) での画像追加は、" +
      "既存の実装のままでも正しく merge される (このテストが red になったらハーネス自体を疑うこと)",
    async () => {
      harness.routeParams.recordId = "record-3";
      imageUploadMocks.uploadImagesViaApi.mockResolvedValue([{ path: "self/comp3/new-upload.jpg" }]);

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("画像を1枚追加"));
      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(harness.updateCompetitionMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = harness.updateCompetitionMutateAsync.mock.calls[0]!;
      expect(id).toBe("comp-3");
      expect(updates.image_paths).toEqual(["self/comp3/existing.jpg", "self/comp3/new-upload.jpg"]);
      expect(updates.image_paths).toHaveLength(2);
    },
  );

  it(
    "[V-48-11] dropdown 一覧のスコープ外の大会 (comp-1) で、ID 直指定取得した title が" +
      "画面に表示される (実装4: selectedCompetitionName の title 解決)",
    async () => {
      // dropdown 一覧 (competitionsFixture) にはこの文字列を含む大会名は存在しない
      // (ownCompetition.title = "自分の大会" のみ)。部分文字列関係にもならない、
      // このテスト固有のタイトルにすることで、たまたま dropdown 側の解決経路で
      // 一致してしまうトートロジーを防ぐ。
      const idDirectFetchOnlyTitle = "ID直指定限定表示名アルファ";
      harness.competitionByIdResponses["image_paths,title:comp-1"] = {
        data: {
          image_paths: [...outOfScopeCompetition.image_paths],
          title: idDirectFetchOnlyTitle,
        },
        error: null,
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      await waitFor(() => {
        expect(screen.getByText(idDirectFetchOnlyTitle)).toBeDefined();
      });

      // プレースホルダーには絶対に落ちていないこと
      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );

  it(
    "[V-48-12] ID 直指定取得は成功したが title が DB 上 NULL の場合、汎用フォールバック" +
      "文言 (t(\"recordMobile.fallbackTitle\")) が表示され、未選択プレースホルダーは" +
      "表示されない " +
      "(PM 判断で確定した仕様。根拠: competitions.title のカラムコメントに " +
      "「大会名（NULLの場合は「大会」と表示）」と明記されている " +
      "[initial_schema.sql:684]。selectedCompetitionTitle が null [= 取得成功・title 未設定] と " +
      "undefined [= 取得失敗、V-48-13 で別途検証] を区別し、null の場合のみこのフォールバックに" +
      "落ちる)。",
    async () => {
      harness.competitionByIdResponses["image_paths,title:comp-1"] = {
        data: {
          image_paths: [...outOfScopeCompetition.image_paths],
          title: null,
        },
        error: null,
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // 仕様: ID 直指定取得が成功し title が DB 上 NULL のときは、カラムコメントが
      // 規定する汎用の大会名フォールバック (「大会」) が表示される。dropdown 一覧の
      // スコープ外 (comp-1) でも、選択済みなのに未選択プレースホルダーに落ちてはならない。
      // 大会選択ボタン自身を role="button" でスコープする (フィールドラベルの
      // "大会" テキストと fallbackTitle の "大会" テキストが同じ文字列のため、
      // screen.getByText("大会") は複数要素にヒットしてしまう。Pressable は
      // react-native-web 上で <button> に描画されるため、アクセシブルネームで
      // 一意に絞り込める)。
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "大会" })).toBeDefined();
      });

      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );

  it(
    "[V-48-13] ID 直指定取得自体が失敗した場合、selectedCompetitionTitle は undefined の" +
      "ままとなり、従来どおり dropdown 一覧からの解決にフォールバックする " +
      "(スコープ内の comp-3 なら大会名が表示される。非退行)",
    async () => {
      harness.routeParams.recordId = "record-3";
      harness.competitionByIdResponses["image_paths,title:comp-3"] = {
        data: null,
        error: new Error("RLS denied: cannot read competitions row"),
      };

      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // ID 直指定取得は失敗しているが、comp-3 は dropdown 一覧のスコープ内なので
      // 従来の .find() 経由で大会名が表示され続ける
      await waitFor(() => {
        expect(screen.getByText(ownCompetition.title)).toBeDefined();
      });

      expect(screen.queryByText("大会を選択")).toBeNull();
    },
  );
});

describe("RecordFormScreen — issue #48: 退会済みチームの大会に紐づく過去記録の編集 (V-48-6, PM 裁定で確定した仕様)", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = recordsFixture;
    harness.competitions = competitionsFixture;
    harness.routeParams.recordId = "record-6";
    harness.getStyles.mockResolvedValue(stylesFixture);
    harness.getAccessToken.mockResolvedValue("test-access-token");
    harness.updateMutateAsync.mockResolvedValue({ id: "record-6" });
    harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);
    harness.updateCompetitionMutateAsync.mockResolvedValue({ id: "comp-9" });
    imageUploadMocks.resolveGalleryImages.mockResolvedValue([]);
    imageUploadMocks.uploadImagesViaApi.mockResolvedValue([]);
    imageUploadMocks.deleteImagesViaApi.mockResolvedValue(undefined);

    // 退会済みチームの大会 (comp-9) は RLS で SELECT が拒否される
    harness.competitionByIdResponses["pool_type:comp-9"] = {
      data: null,
      error: new Error("RLS denied: not a team member"),
    };
  });

  it(
    "[V-48-6] storeCompetitionId が非null (competition_id が残存) のため isStandaloneRecord は" +
      "false だが、pool_type 取得が RLS で拒否されてもレコード自体の保存は成功し、pool_type は" +
      "記録自身の値 (長水路=1。0 に潰されていないこと) が維持される " +
      "(PM 裁定: 一律 throw すると退会済みチームの記録を持つユーザーが note の修正すら" +
      "一切できなくなるため、大会取得失敗時は記録自身の値を維持して保存を継続する。" +
      "V-47-3 と同一の分岐 [isEditMode && fetchedRecord] を通る)",
    async () => {
      render(<RecordFormScreen />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("保存")).toBeDefined();
      });

      // 「(一括入力)」表示にはならない = isStandaloneRecord が false と判定されていることの確認
      // (competition_id が残っているため大会紐付けレコードとして扱われる)
      expect(screen.queryByText(/一括入力/)).toBeNull();

      fireEvent.click(screen.getByText("保存"));

      await waitFor(() => {
        expect(harness.updateMutateAsync).toHaveBeenCalledTimes(1);
      });

      const [{ id, updates }] = harness.updateMutateAsync.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
      expect(id).toBe("record-6");
      expect(updates.competition_id).toBe("comp-9");
      // 本体assert: 記録自身の pool_type (長水路=1) が維持される。0 に潰されてはならない
      expect(updates.pool_type).toBe(1);
      expect(updates.pool_type).not.toBe(0);

      // pool_type 取得は実際に試みて RLS 拒否を受け取ったことも確認する
      // (取得を試みずに常に維持側へフォールバックしているのではないことの担保)
      expect(harness.competitionFetchCalls).toContainEqual({
        table: "competitions",
        columns: "pool_type",
        id: "comp-9",
      });

      // 保存は中止されていない (エラーダイアログは出ない)
      expect(Alert.alert).not.toHaveBeenCalled();
    },
  );
});
