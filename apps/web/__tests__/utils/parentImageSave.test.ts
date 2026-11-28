/**
 * saveParentImages — チーム練習・チーム大会の基本フォームで選んだ画像を保存する
 *
 * swimhub-tasks#58: web のチーム練習・大会の追加/編集は、画像を選んでも保存処理が
 * 受け取って捨てていた。ダッシュボードと同じ手順 (アップロード → image_paths を取り直して更新 →
 * 削除した画像をストレージから消す) で保存する。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  uploadPracticeImage: vi.fn(),
  deletePracticeImage: vi.fn(),
  uploadCompetitionImage: vi.fn(),
  deleteCompetitionImage: vi.fn(),
}));

vi.mock("@apps/shared/api/practices", () => ({
  PracticeAPI: vi.fn().mockImplementation(function () {
    return {
      uploadPracticeImage: mocks.uploadPracticeImage,
      deletePracticeImage: mocks.deletePracticeImage,
    };
  }),
}));

vi.mock("@apps/shared/api/competitions", () => ({
  CompetitionAPI: vi.fn().mockImplementation(function () {
    return {
      uploadCompetitionImage: mocks.uploadCompetitionImage,
      deleteCompetitionImage: mocks.deleteCompetitionImage,
    };
  }),
}));

// 圧縮は関心外。受け取ったファイルをそのまま返す
vi.mock("@/utils/imageUtils", () => ({
  processPracticeImage: async (file: File) => ({ original: file, thumbnail: file }),
}));

import { hasParentImageChanges, saveParentImages } from "@/utils/parentImageSave";

interface SupabaseMockOptions {
  existingPaths?: string[];
  selectError?: unknown;
  updateError?: unknown;
}

function buildSupabaseMock({ existingPaths = [], selectError = null, updateError = null }: SupabaseMockOptions = {}) {
  const tables: string[] = [];
  const updates: unknown[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve(
              selectError
                ? { data: null, error: selectError }
                : { data: { image_paths: existingPaths }, error: null },
            ),
        }),
      }),
      update: (payload: unknown) => {
        updates.push(payload);
        return { eq: () => Promise.resolve({ error: updateError }) };
      },
    };
  });
  return { supabase: { from } as unknown as SupabaseClient, tables, updates };
}

const file = (name: string) => ({ file: new File(["x"], name, { type: "image/jpeg" }) });

describe("saveParentImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadPracticeImage.mockImplementation(async (_id: string, f: File) => `p-1/${f.name}`);
    mocks.uploadCompetitionImage.mockImplementation(async (_id: string, f: File) => `c-1/${f.name}`);
    mocks.deletePracticeImage.mockResolvedValue(undefined);
    mocks.deleteCompetitionImage.mockResolvedValue(undefined);
  });

  it("練習: 新しい画像をアップロードし、image_paths を「既存 - 削除 + 新規」で更新して、削除分をストレージから消す", async () => {
    const { supabase, tables, updates } = buildSupabaseMock({
      existingPaths: ["p-1/keep.jpg", "p-1/old.jpg"],
    });

    await saveParentImages(supabase, "practice", "p-1", {
      newFiles: [file("new.jpg")],
      deletedIds: ["p-1/old.jpg"],
    });

    expect(mocks.uploadPracticeImage).toHaveBeenCalledWith("p-1", expect.any(File));
    expect(tables.every((table) => table === "practices")).toBe(true);
    expect(updates).toEqual([{ image_paths: ["p-1/keep.jpg", "p-1/new.jpg"] }]);
    expect(mocks.deletePracticeImage).toHaveBeenCalledWith("p-1/old.jpg");
    expect(mocks.uploadCompetitionImage).not.toHaveBeenCalled();
  });

  it("大会: competitions テーブルと大会用のストレージを使う", async () => {
    const { supabase, tables, updates } = buildSupabaseMock({ existingPaths: [] });

    await saveParentImages(supabase, "competition", "c-1", {
      newFiles: [file("a.jpg"), file("b.jpg")],
      deletedIds: [],
    });

    expect(mocks.uploadCompetitionImage).toHaveBeenCalledTimes(2);
    expect(tables.every((table) => table === "competitions")).toBe(true);
    expect(updates).toEqual([{ image_paths: ["c-1/a.jpg", "c-1/b.jpg"] }]);
  });

  it("image_paths を取り直せなかったときは更新せず、アップロード済みの画像を消してエラーを投げる", async () => {
    const { supabase, updates } = buildSupabaseMock({ selectError: new Error("network") });

    await expect(
      saveParentImages(supabase, "practice", "p-1", { newFiles: [file("new.jpg")], deletedIds: [] }),
    ).rejects.toThrow();

    expect(updates).toEqual([]);
    expect(mocks.deletePracticeImage).toHaveBeenCalledWith("p-1/new.jpg");
  });

  it("image_paths の更新に失敗したときは、アップロード済みの画像を消し、削除指定の画像は消さない", async () => {
    const { supabase } = buildSupabaseMock({
      existingPaths: ["p-1/old.jpg"],
      updateError: new Error("rls"),
    });

    await expect(
      saveParentImages(supabase, "practice", "p-1", {
        newFiles: [file("new.jpg")],
        deletedIds: ["p-1/old.jpg"],
      }),
    ).rejects.toThrow();

    expect(mocks.deletePracticeImage).toHaveBeenCalledWith("p-1/new.jpg");
    expect(mocks.deletePracticeImage).not.toHaveBeenCalledWith("p-1/old.jpg");
  });

  it("変更が無いときは何もしない", async () => {
    const { supabase } = buildSupabaseMock();

    await saveParentImages(supabase, "practice", "p-1", { newFiles: [], deletedIds: [] });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(hasParentImageChanges({ newFiles: [], deletedIds: [] })).toBe(false);
    expect(hasParentImageChanges(undefined)).toBe(false);
  });
});
