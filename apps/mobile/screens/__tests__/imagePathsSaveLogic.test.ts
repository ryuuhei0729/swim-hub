/**
 * Mobile: 画像パス保存ロジック テスト (Issue #36 CodeRabbit指摘 データ損失修正)
 *
 * Sprint Contract 検証観点:
 *   [IMG-01] 保存時の image_paths は「生パス (savedImagePaths/existingImagePaths)」から
 *            計算され、表示専用の resolveGalleryImages 結果 (署名URL取得失敗パスを除外
 *            した配列) からは計算されないこと。
 *   [IMG-02] 署名URL取得が一部/全部失敗しても、画像を追加・削除せず保存すれば
 *            既存 image_paths が失われないこと（データ損失回避の核心）。
 *   [IMG-03] 削除フロー (deletedImageIds) が生パスに対して正しく効くこと。
 *
 * 対象: CompetitionBasicFormScreen / RecordFormScreen / PracticeTabFormScreen /
 *       CompetitionTabFormScreen の4画面の保存ハンドラが共通で呼ぶ実装
 *       `mergeImagePaths` (apps/mobile/utils/imageUpload.ts) を直接検証する。
 */

import { describe, it, expect } from "vitest";
import { mergeImagePaths } from "@/utils/imageUpload";

/**
 * 表示専用の resolveGalleryImages 相当のシミュレーション。
 * 署名URL取得に失敗したパスは結果配列から除外される（apps/mobile/utils/imageUpload.ts
 * の resolveGalleryImages の実装通り）。実装対比の反証デモにのみ使用する。
 */
function simulateResolveGalleryImages(
  paths: string[],
  failedPaths: Set<string>,
): { id: string; url: string }[] {
  return paths
    .filter((p) => !failedPaths.has(p))
    .map((p) => ({ id: p, url: `https://signed.example.com/${p}` }));
}

describe("[IMG-01] mergeImagePaths は生パス由来であり、表示専用配列とは独立している", () => {
  it("表示専用配列 (existingImages) が空でも、生パス (savedImagePaths) が保持されていれば保存パスは失われない", () => {
    const savedImagePaths = ["user1/comp1/photo1.jpg", "user1/comp1/photo2.jpg"];
    // 署名URL取得が全部失敗した場合、表示専用配列は空になる
    const existingImages = simulateResolveGalleryImages(
      savedImagePaths,
      new Set(savedImagePaths), // 全部失敗
    );
    expect(existingImages).toEqual([]); // 表示は空

    // しかし保存時のパスは savedImagePaths から計算されるため保持される
    const result = mergeImagePaths(savedImagePaths, [], []);
    expect(result).toEqual(savedImagePaths);
  });

  it("誤って表示専用配列 (existingImages) から保存パスを計算した場合はデータ損失が起きる（回帰防止の反証）", () => {
    const savedImagePaths = ["user1/comp1/photo1.jpg", "user1/comp1/photo2.jpg"];
    const existingImages = simulateResolveGalleryImages(
      savedImagePaths,
      new Set(savedImagePaths), // 全部失敗 → 表示専用配列は空
    );

    // 【誤実装のシミュレーション】表示専用配列の id を生パスの代わりに渡すと...
    const buggyResult = mergeImagePaths(
      existingImages.map((img) => img.id),
      [],
      [],
    );

    // 画像が1枚も無かったことになり、保存すると全画像が消える（Critical バグ）
    expect(buggyResult).toEqual([]);
    expect(buggyResult).not.toEqual(savedImagePaths);
  });
});

describe("[IMG-02] 署名URL取得が一部/全部失敗しても、未編集保存で image_paths が保持される", () => {
  it("署名URL取得が一部失敗しても、画像を追加・削除しなければ全パスが保存される", () => {
    const savedImagePaths = ["user1/comp1/a.jpg", "user1/comp1/b.jpg", "user1/comp1/c.jpg"];
    // b.jpg だけ署名URL取得に失敗（ネットワークエラー等）
    const failedPaths = new Set(["user1/comp1/b.jpg"]);
    const existingImages = simulateResolveGalleryImages(savedImagePaths, failedPaths);
    expect(existingImages).toHaveLength(2); // 表示は2枚のみ

    // 変更なしで保存 (deletedImageIds=[], newImagePaths=[])
    const result = mergeImagePaths(savedImagePaths, [], []);
    expect(result).toHaveLength(3); // 3枚とも保持される（b.jpgも失われない）
    expect(result).toEqual(savedImagePaths);
  });

  it("署名URL取得が全部失敗しても、画像を追加・削除しなければ全パスが保存される", () => {
    const savedImagePaths = ["user1/practice1/x.jpg", "user1/practice1/y.jpg"];
    const existingImages = simulateResolveGalleryImages(savedImagePaths, new Set(savedImagePaths));
    expect(existingImages).toEqual([]);

    const result = mergeImagePaths(savedImagePaths, [], []);
    expect(result).toEqual(savedImagePaths);
  });

  it("既存パスが空の場合、変更なし保存では空のまま（新規追加なしと区別される）", () => {
    const result = mergeImagePaths([], [], []);
    expect(result).toEqual([]);
  });
});

describe("[IMG-03] 削除フロー (deletedImageIds) が生パスに対して正しく効く", () => {
  it("deletedImageIds に含まれるパスが保存パスから除外される", () => {
    const savedImagePaths = ["user1/comp1/a.jpg", "user1/comp1/b.jpg", "user1/comp1/c.jpg"];
    const deletedImageIds = ["user1/comp1/b.jpg"];

    const result = mergeImagePaths(savedImagePaths, deletedImageIds, []);
    expect(result).toEqual(["user1/comp1/a.jpg", "user1/comp1/c.jpg"]);
  });

  it("署名URL取得に失敗したパスを削除対象にしても、生パスベースなので正しく削除できる", () => {
    // b.jpg は署名URL取得に失敗しているが、ユーザーは削除ボタンを押せる
    // (id=path であるため表示に失敗しても deletedImageIds には正しいpathが積まれる)
    const savedImagePaths = ["user1/comp1/a.jpg", "user1/comp1/b.jpg"];
    const deletedImageIds = ["user1/comp1/b.jpg"];

    const result = mergeImagePaths(savedImagePaths, deletedImageIds, []);
    expect(result).toEqual(["user1/comp1/a.jpg"]);
  });

  it("新規アップロード分と削除分が同時に発生しても正しく合成される", () => {
    const savedImagePaths = ["user1/comp1/a.jpg", "user1/comp1/b.jpg"];
    const deletedImageIds = ["user1/comp1/a.jpg"];
    const newImagePaths = ["user1/comp1/new-uuid.jpg"];

    const result = mergeImagePaths(savedImagePaths, deletedImageIds, newImagePaths);
    expect(result).toEqual(["user1/comp1/b.jpg", "user1/comp1/new-uuid.jpg"]);
  });

  it("すべて削除すると空配列になる（意図的な全削除は許可される）", () => {
    const savedImagePaths = ["user1/comp1/a.jpg", "user1/comp1/b.jpg"];
    const deletedImageIds = ["user1/comp1/a.jpg", "user1/comp1/b.jpg"];

    const result = mergeImagePaths(savedImagePaths, deletedImageIds, []);
    expect(result).toEqual([]);
  });

  it("存在しないIDを削除対象に含めても無視される（境界値）", () => {
    const savedImagePaths = ["user1/comp1/a.jpg"];
    const deletedImageIds = ["user1/comp1/nonexistent.jpg"];

    const result = mergeImagePaths(savedImagePaths, deletedImageIds, []);
    expect(result).toEqual(["user1/comp1/a.jpg"]);
  });
});
