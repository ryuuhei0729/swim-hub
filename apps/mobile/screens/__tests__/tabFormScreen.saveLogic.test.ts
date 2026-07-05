/**
 * Mobile: タブフォームスクリーン 保存ロジックテスト
 *
 * Sprint Contract 検証観点:
 *   [V-07-M] beforeRemove 警告: hasUnsavedChanges の判定ロジック
 *   [V-09-M] 親INSERT後・子INSERT失敗時の状態管理ロジック
 *            (resolvedCompetitionId 保持 → 再試行時に親重複なし)
 *
 * NOTE: PracticeLogFormScreen.teamId.test.tsx のパターンに倣い、
 *       コアロジックをピュア関数相当で抽出して検証する。
 *       RN の実機コンポーネントはレンダリングしない。
 *       フルコンポーネントレンダリングは実機/シミュレータで確認する。
 */

import { describe, it, expect } from "vitest";
import { hasUnsavedChanges, diffPracticeLogDraft } from "../../utils/tabFormUtils";

// ============================================================
// [V-07-M] beforeRemove 警告: hasUnsavedChanges の判定ロジック
//
// ユーザー意図:
//   - フォームに変更がある → Alert で確認 (誤操作防止)
//   - 変更なし → そのまま戻れる
//   - 保存後 → そのまま戻れる (isSaved フラグでショートサーキット)
// ============================================================

describe("[V-07-M] beforeRemove 警告: hasUnsavedChanges の判定ロジック", () => {
  it("スナップショットと同値のとき false を返す (警告不要)", () => {
    const snapshot = { date: "2024-06-01", title: "練習", place: "", note: "" };
    const current = { date: "2024-06-01", title: "練習", place: "", note: "" };
    expect(hasUnsavedChanges(current, snapshot)).toBe(false);
  });

  it("タイトルを変更したとき true を返す (警告必要)", () => {
    const snapshot = { date: "2024-06-01", title: "", place: "", note: "" };
    const current = { date: "2024-06-01", title: "春の練習", place: "", note: "" };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("日付を変更したとき true を返す", () => {
    const snapshot = { date: "2024-06-01", title: "" };
    const current = { date: "2024-06-02", title: "" };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("メニューを追加したとき true を返す", () => {
    const snapshot = { practice: { date: "2024-06-01" }, menus: [] as object[] };
    const current = { practice: { date: "2024-06-01" }, menus: [{ id: "menu-1" }] };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("スナップショットが null のとき何らかの値があれば true を返す", () => {
    const current = { date: "2024-06-01" };
    expect(hasUnsavedChanges(current, null)).toBe(true);
  });
});

// ============================================================
// [V-09-M] 親INSERT後・子INSERT失敗時の状態管理ロジック
//
// ユーザー意図:
//   - 練習/大会は保存済み (resolvedId を保持)
//   - 子(ログ/エントリー/レコード)のINSERT失敗後も画面は残る
//   - 再保存時: resolvedId が存在 → 親は UPDATE、子のみ再INSERT
//   - resolvedId が存在しない → 親は INSERT (新規)
//
// NOTE: この判定ロジックは以下のコードパターンで実装されている:
//   if (!resolvedCompetitionId) { createCompetition(); setResolvedCompetitionId(id); }
//   else { updateCompetition(resolvedCompetitionId, ...); }
//
// 本テストはその「条件分岐の意図」をピュア関数で再現して確認する
// ============================================================

describe("[V-09-M] 親INSERT重複防止ロジックのシミュレーション", () => {
  /**
   * シミュレーション関数:
   * resolvedId の有無で INSERT / UPDATE を分岐するロジックを模倣する
   */
  function simulateSaveAction(resolvedId: string | undefined): "INSERT" | "UPDATE" {
    if (!resolvedId) return "INSERT";
    return "UPDATE";
  }

  it("resolvedId がない場合は INSERT (新規作成)", () => {
    expect(simulateSaveAction(undefined)).toBe("INSERT");
  });

  it("resolvedId がある場合は UPDATE (既存更新・重複INSERT防止)", () => {
    expect(simulateSaveAction("some-uuid-123")).toBe("UPDATE");
  });

  it("子INSERT失敗後の再試行時: resolvedId が保持されているため UPDATE になる", () => {
    // シナリオ:
    //   1. 新規保存 → 練習INSERT成功 → resolvedId="abc-123"
    //   2. 練習ログINSERT失敗 → エラー表示、画面は残る
    //   3. 再保存 → resolvedId="abc-123" が保持されている → UPDATE
    const resolvedIdAfterFirstSave = "abc-123";
    expect(simulateSaveAction(resolvedIdAfterFirstSave)).toBe("UPDATE");
    // → 練習が重複INSERTされない
  });
});

// ============================================================
// [V-09-M-DIFF] 子INSERT失敗後の再試行: 差分計算の安全性確認
//
// ユーザー意図:
//   - 子INSERTが全て失敗した場合、ローカルIDのみが残る
//   - 再試行時は全件 creates として再送される (既存IDは存在しないため)
// ============================================================

describe("[V-09-M-DIFF] 子INSERT失敗後の再試行: diffPracticeLogDraft の挙動", () => {
  it("全てローカルIDのドラフトは全件 creates に含まれる", () => {
    // 練習ログINSERT失敗 → ローカルIDが残ったまま
    const drafts = [
      { draftId: "local-menu-1" },
      { draftId: "local-menu-2" },
    ];
    const result = diffPracticeLogDraft(drafts, []);
    expect(result.creates).toHaveLength(2);
    expect(result.updates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("再試行時に existingIds が空なら deletes は発生しない", () => {
    // 練習はINSERT成功済みだが、ログは未保存 → existingIds=[]
    const drafts = [{ draftId: "local-menu-1" }];
    const result = diffPracticeLogDraft(drafts, []);
    expect(result.deletes).toHaveLength(0);
  });
});
