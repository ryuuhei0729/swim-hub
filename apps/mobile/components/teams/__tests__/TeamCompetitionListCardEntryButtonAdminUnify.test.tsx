/**
 * TeamCompetitionList — 大会カードの admin ボタン置換 (mobile, 要件B前半 / D3, R3)
 *
 * Sprint Contract: `sprint-contract.md` D3, R3
 * 検証観点 (Verification Checklist): V-M-05
 *
 * QA Phase A: このファイルはスケルトンのみ。アサーションの実装は Phase B (実装完了後) で行う。
 *
 * 【インターフェース契約 / PM 裁定】
 * - R3: admin の未来日ボタンを「エントリー代理入力」(`entryBulkButton` accessibilityLabel) から
 *   「エントリー」(モーダルを開く) に**置換**する。カード上に代理入力ボタンは残さない。
 * - 「記録代理入力」(`recordBulkButton`, isEntryTabVisible=false 側) はこの Deliverable の
 *   対象外で無変更。admin は今回も「エントリー(未来)/記録代理入力(それ以外)」の排他は維持する
 *   前提だが、エントリー側の遷移先がモーダルに変わる。
 *
 * 【既存テストとの関係 (QA Phase A 棚卸し結果、詳細は QA 完了報告を参照)】
 * `TeamCompetitionList.test.tsx` 内で `screen.getByRole("button", { name: "エントリー代理入力" })`
 * を**存在前提**にしているケース (例: L716-732 の「[旧SC-1] admin 時のボタン構成」、
 * L1538/L1740 の it.each、L2050、L2125、L2554-2620 の一部) は、admin の未来日ボタンが
 * 「エントリー」に置き換わることで **本物の退行ではなく仕様変更として** 落ちる。
 * 「エントリー代理入力」の**不在**だけを確認しているケース (過去日/今日の admin ケース等) は
 * 引き続き真であるため無変更のはず。個別の内訳は QA 完了報告 (Phase A) の A-2 節を参照。
 * この既存ファイルの書き換え自体は Phase B で行う (本スケルトンファイルとは別に扱う)。
 */

import { describe, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  entryModalSpy: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
}));

// Phase B で render/screen/fireEvent ("@testing-library/react")、
// makeCompetition 相当のテストデータビルダー、FUTURE_DATE/PAST_DATE/TODAY_DATE の
// 相対日付導出 (固定日付ハードコード禁止)、および TeamCompetitionEntryModal の
// スタブ化 (props.visible で "ENTRY_MODAL_OPEN" を描画する既存パターン) を追加すること。

describe("TeamCompetitionList — 大会カードの admin ボタン置換 (mobile)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-M-05] SC5: admin が最初に見るボタンが「エントリー」であり、同じモーダルが開く", () => {
    it.todo("未来日 + admin のカードで、accessibilityLabel が「エントリー」のボタンが表示される");
    it.todo("admin がそのボタンを押すと、非admin と同じ TeamCompetitionEntryModal が開く (isAdmin: true で props が渡る)");
    it.todo("[回帰] 未来日 + admin のカードに「エントリー代理入力」ボタンは存在しない");
    it.todo("[非退行] 過去日/今日 + admin では「記録代理入力」ボタンが引き続き表示される (D3 の対象外)");
    it.todo("[非退行] 非admin のカードのエントリーボタンの見た目・遷移は変わらない");
  });
});
