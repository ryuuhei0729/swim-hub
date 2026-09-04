/**
 * RecordLogForm — 「FormModals/CompetitionClient 経路」相当の回帰テスト
 * (PM裁定: Reviewer再レビュー Critical、getEntryDataListForRecord 経路)。
 *
 * 背景: dashboard の FormModals.tsx / /competition の CompetitionClient.tsx は、
 * `getEntryDataListForRecord()` が返す EntryInfo[] をそのまま RecordLogForm の
 * `entryDataList` prop に渡す。この関数は entries を styleId でデデュープせず
 * そのまま返すため、ユーザーが同じ種目を個人枠とリレー枠の両方でエントリーしている
 * 場合、entryDataList には同じ styleId のエントリーが2件並び、
 * useRecordLogForm の `entryDataList.length > 0` 初期化パス
 * (createDefaultState を 1:1 でマップするだけで dedupe しない) により
 * 2枚のカードが自動生成される。
 *
 * PM裁定 (2026-08-21): [A] の「保存がブロックされる」挙動は限界ではなく **正しい仕様**。
 * `EntryInfo` 型 (apps/shared/types/ui.ts) は isRelaying 相当のフィールドを
 * 持たないため、自動生成される2枚のカードは両方 isRelaying=false で初期化される。
 * この状態のまま (どちらもリレー区分を表明せず) 保存すると、同一大会・同一種目の
 * 個人記録が2行できてしまう — これはまさに W2 が防ぐべき **真の重複** であり、
 * ブロックされるのが正しい。ユーザーは「どちらがリレーのレグとして泳いだ方か」を
 * 各カードのリレートグルで明示的に表明する必要がある(トグルは種目カード上に
 * 常に表示されており発見可能)。これは「観測されたバグを仕様に昇格させる」こととは
 * 異なる — ブロック自体が意図された仕様であることをPMが判定済み。
 *
 * [B] は、そのエスケープハッチ (リレートグルで区分を表明すれば保存できる) が
 * 実際に機能することを保証する。
 *
 * it.todo は、`entries.is_relaying` (DB列は既に存在: migration
 * 20260630000000_add_is_relaying_to_entries.sql) をフォームの初期カード状態まで
 * 伝播させ、ユーザーがトグル操作なしで済むようにする将来の UX 改善課題を記録する
 * (EntryInfo という shared 型の変更で mobile 含む全 consumer に波及するため、
 * 本バグ修正スプリントのスコープ外。次スプリント課題としてPMが最終報告に記載)。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EntryInfo } from "@apps/shared/types/ui";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {},
    user: { id: "member-1" },
    subscription: null,
  }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));

import RecordLogForm from "@/components/forms/record-log/RecordLogForm";
import type { StyleOption } from "@/components/forms/record-log/types";

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

// 100m自由形 (Fr, id=3) — リレー対象種目
const STYLE_FR100: StyleOption = { id: 3, nameJp: "100m自由形", distance: 100 };

// getEntryDataListForRecord() が実際に返す形をそのまま模す: 同じ styleId の
// エントリーが2件 (個人枠+リレー枠) 並ぶ。dedupe されない (実測通り)。
// EntryInfo は isRelaying を持たないため、どちらの entry がリレー由来かを
// 型レベルで区別する手段が無い。
const DUPLICATE_STYLE_ENTRY_DATA_LIST: EntryInfo[] = [
  { styleId: 3, styleName: "100m自由形", entryTime: 65.0 },
  { styleId: 3, styleName: "100m自由形", entryTime: 58.0 },
];

describe("RecordLogForm — entryDataList 経由の同一styleId自動生成カード (FormModals/CompetitionClient相当)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[A] 2枚のカードが両方リレートグルを操作せず(isRelaying=false同士のまま)保存されると、" +
      "真の重複としてformError_duplicateStyleでブロックされる(正しい挙動、PM裁定2026-08-21)",
    async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderWithIntl(
        <RecordLogForm
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={onSubmit}
          competitionId="competition-1"
          poolType={0}
          styles={[STYLE_FR100]}
          entryDataList={DUPLICATE_STYLE_ENTRY_DATA_LIST}
        />,
      );

      await screen.findByTestId("record-entry-section-1");
      expect(screen.getByTestId("record-entry-section-2")).toBeInTheDocument();

      await user.type(screen.getByTestId("record-time-1"), "1:05.00");
      await user.tab();
      await user.type(screen.getByTestId("record-time-2"), "58.00");
      await user.tab();

      await user.click(screen.getByTestId("save-record-button"));

      // 両カードとも isRelaying=false のまま保存しようとすると、同一種目の個人記録が
      // 2行できてしまう真の重複であるため、W2 のガードが正しくブロックする。
      const errorBox = await screen.findByTestId("record-form-error");
      expect(errorBox).toHaveTextContent(
        "同じ種目のカードが複数あります。重複を解消してください",
      );
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("[B] エスケープハッチ: カード2のリレートグルをONにして保存すれば、両方保存できる", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithIntl(
      <RecordLogForm
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        competitionId="competition-1"
        poolType={0}
        styles={[STYLE_FR100]}
        entryDataList={DUPLICATE_STYLE_ENTRY_DATA_LIST}
      />,
    );

    await screen.findByTestId("record-entry-section-1");
    await screen.findByTestId("record-entry-section-2");

    await user.type(screen.getByTestId("record-time-1"), "1:05.00");
    await user.tab();
    await user.type(screen.getByTestId("record-time-2"), "58.00");
    await user.tab();

    // カード2をリレー枠として明示する
    const relayToggle2 = screen.getByTestId("record-relay-2");
    expect(relayToggle2).toHaveAttribute("aria-checked", "false");
    await user.click(relayToggle2);
    expect(relayToggle2).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByTestId("save-record-button"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("record-form-error")).not.toBeInTheDocument();
    expect(onSubmit.mock.calls[0]![0]).toHaveLength(2);
  });

  // 将来課題 (次スプリント, PM記録用): entries.is_relaying をフォームの初期カード
  // 状態まで伝播させ、entryDataList 経由で自動生成されたカードがユーザーの手動
  // トグル操作なしで正しい isRelaying を持つようにする。
  // 実装が必要な範囲 (shared型のため全consumerに波及、本スプリントのスコープ外):
  //   - apps/shared/types/ui.ts: EntryInfo に isRelaying?: boolean を追加
  //   - apps/web/utils/getEntryDataListForRecord.ts: 各分岐で is_relaying/isRelaying
  //     を読み取って EntryInfo.isRelaying に反映する
  //   - apps/web/components/team/TeamCompetitions.tsx: selfRecordEntryDataList が
  //     entries の is_relaying を読めるようにクエリを拡張する (現状 select していない)
  //   - apps/web/components/forms/record-log/hooks/useRecordLogForm.ts:
  //     entryDataList 初期化パスの createDefaultState が entry.isRelaying を使う
  //   - mobile 側の同等コンポーネント/utilにも同じ拡張が必要
  // 完了後、このテストを実装し「トグル操作なしで2件とも保存できる」ことを検証する。
  it.todo(
    "[将来課題] entries.is_relaying が EntryInfo 経由でフォーム初期カード状態まで伝播し、" +
      "同一styleIdの個人枠/リレー枠エントリーから自動生成された2枚のカードが、" +
      "ユーザーの手動トグル操作なしで正しい isRelaying を持って保存できる",
  );
});
