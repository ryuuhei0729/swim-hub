// =============================================================================
// ダッシュボードの FB 受信ポップアップで「閉じる」を押した FB の記録 (セッション内メモリ)
// 仕様: docs/specs/record-feedback.md
//   - 閉じたときに出ていた FB は同じセッションでは再表示しない
//   - キーは feedback_id:updated_at なので、本文が編集された FB はもう一度出る
// =============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissFeedbacks,
  feedbackDismissKey,
  filterUndismissedFeedbacks,
  resetDismissedFeedbacksForTest,
} from "../dismissedFeedbacks";

const fb = (id: string, updated_at: string) => ({ id, updated_at });

describe("dismissedFeedbacks", () => {
  beforeEach(() => resetDismissedFeedbacksForTest());

  it("閉じていない FB はそのまま (順序も保つ)", () => {
    const items = [fb("b", "2026-11-26T10:00:00Z"), fb("a", "2026-11-26T09:00:00Z")];
    expect(filterUndismissedFeedbacks(items)).toEqual(items);
  });

  it("閉じた FB は除外され、閉じていない FB だけが残る", () => {
    const a = fb("a", "2026-11-26T09:00:00Z");
    const b = fb("b", "2026-11-26T10:00:00Z");
    dismissFeedbacks([a]);
    expect(filterUndismissedFeedbacks([b, a])).toEqual([b]);
  });

  it("本文が編集された (updated_at が進んだ) FB は再び表示対象になる", () => {
    dismissFeedbacks([fb("a", "2026-11-26T09:00:00Z")]);
    const edited = fb("a", "2026-11-26T12:00:00Z");
    expect(filterUndismissedFeedbacks([edited])).toEqual([edited]);
  });

  it("キーは id:updated_at", () => {
    expect(feedbackDismissKey(fb("x", "t1"))).toBe("x:t1");
  });
});
