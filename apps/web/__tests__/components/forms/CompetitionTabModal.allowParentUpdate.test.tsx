/**
 * CompetitionTabModal — allowParentUpdate による basicData フィールド無効化 (Sprint Contract 2 D3)
 *
 * D2 (usePracticeTabSave/useCompetitionTabSave の allowParentUpdate) は保存時に
 * 親 UPDATE をスキップするだけで、フィールド自体は入力可能なまま残ってしまうと
 * 「入力したのに保存されない」という無言の UX 劣化になる。D3 はこれを防ぐため
 * CompetitionTabModal 自身にも同名の allowParentUpdate prop を渡し、大会タブの
 * 基本情報フィールド (日付/終了日/タイトル/場所/プール種別/メモ/画像) を
 * disabled にし、制限バナーを表示する。
 *
 * SC2 の核心: allowParentUpdate=false でも record/entry タブの子データ編集は
 * 無効化されないこと (親のロックが子に波及しないこと) も併せて確認する。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 D3 の記述から導出したものであり、
 * 実装の disabled={!allowParentUpdate} をそのままコピーしたものではない
 * (disabled 属性の有無を実際の DOM から読む)。
 */

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EditingData } from "@/stores/types";
import type { StyleOption } from "@/components/forms/record-log/types";

function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => chain,
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

let currentSupabase: { from: ReturnType<typeof vi.fn> };
vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, subscription: null, supabase: currentSupabase }),
}));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));
vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));
vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

const styles: StyleOption[] = [{ id: 2, nameJp: "50m自由形", distance: 50 }];
const PAST_DATE = "2020-01-01";

function renderModal(allowParentUpdate?: boolean) {
  currentSupabase = {
    from: vi.fn(() => makeChain({ data: { image_paths: [] }, error: null })),
  };
  const editingData = {
    id: "comp-1",
    type: "competition",
    date: PAST_DATE,
    title: "チーム大会テスト",
    place: "テストプール",
    pool_type: 1,
  } as EditingData;

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionTabModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        selectedDate={new Date(PAST_DATE)}
        editingData={editingData}
        editingCompetitionId="comp-1"
        styles={styles}
        isLoading={false}
        initialTab="record"
        {...(allowParentUpdate === undefined ? {} : { allowParentUpdate })}
      />
    </NextIntlClientProvider>,
  );
}

describe("CompetitionTabModal allowParentUpdate", () => {
  it("[V-1] allowParentUpdate=false のとき、日付・タイトル・場所・メモの入力欄が disabled になる", () => {
    renderModal(false);

    // DatePicker は data-testid をテスト用の隠し input (value 読み取り専用) にも
    // 付与しており、実際の disabled 制御は同名 + "-button" サフィックスの
    // <button> 側にある (DatePicker.tsx 参照)。隠し input は type="hidden" の
    // ため disabled 属性を持たない。
    expect(screen.getByTestId("competition-tab-date-button")).toBeDisabled();
    expect(screen.getByTestId("competition-tab-title")).toBeDisabled();
    expect(screen.getByTestId("competition-tab-place")).toBeDisabled();
    expect(screen.getByTestId("competition-tab-note")).toBeDisabled();
  });

  it("[V-2] allowParentUpdate=false のとき、制限バナーが表示される", () => {
    renderModal(false);

    expect(screen.getByTestId("competition-tab-edit-restricted-notice")).toBeInTheDocument();
  });

  it("[V-3 / セレクタの健全性確認] allowParentUpdate=true のとき、入力欄は disabled にならない", () => {
    renderModal(true);

    expect(screen.getByTestId("competition-tab-date-button")).not.toBeDisabled();
    expect(screen.getByTestId("competition-tab-title")).not.toBeDisabled();
    expect(screen.getByTestId("competition-tab-place")).not.toBeDisabled();
    expect(screen.getByTestId("competition-tab-note")).not.toBeDisabled();
    expect(screen.queryByTestId("competition-tab-edit-restricted-notice")).toBeNull();
  });

  it("[V-4 / 非退行] allowParentUpdate 省略時 (デフォルト true) は入力欄が disabled にならない" +
    " (チームタブ (TeamCompetitions.tsx) は明示的に渡さずこの既定値に委ねる設計のため)", () => {
    renderModal(undefined);

    expect(screen.getByTestId("competition-tab-date-button")).not.toBeDisabled();
    expect(screen.queryByTestId("competition-tab-edit-restricted-notice")).toBeNull();
  });

  it("[V-5 / SC2の核心] allowParentUpdate=false でも record タブの「記録追加」ボタンは無効化されない" +
    " (親のロックが子データ編集に波及しないこと)", () => {
    renderModal(false);

    // initialTab="record" で開いているため、record タブの追加ボタンが disabled でないことを見る。
    const addButton = screen.getByTestId("record-add-button");
    expect(addButton).not.toBeDisabled();
  });
});
