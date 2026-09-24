/**
 * PracticeTabModal — allowParentUpdate による basicData フィールド無効化 (Sprint Contract 2 D3)
 *
 * CompetitionTabModal.allowParentUpdate.test.tsx と対をなす。usePracticeTabSave の
 * allowParentUpdate (D2) は保存時に親 (practices) 行の UPDATE をスキップするだけなので、
 * フィールド自体を disabled にしないと「入力したのに保存されない」という無言の
 * UX 劣化になる。PracticeTabModal 自身も同名の allowParentUpdate prop を受け取り、
 * 練習タブの基本情報 (日付/タイトル/場所/メモ) を disabled にし、制限バナーを表示する。
 *
 * SC2 の核心: allowParentUpdate=false でも practiceLog タブのメニュー追加 (子データ) は
 * 無効化されないこと (親のロックが子に波及しないこと) も併せて確認する。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 D3 の記述から導出したものであり、
 * 実装の disabled={!allowParentUpdate} をそのままコピーしたものではない
 * (disabled 属性の有無を実際の DOM から読む)。
 */

import { renderWithI18n as render, screen } from "../../utils/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: {} }),
}));

vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// PracticeLogTemplateSelectModal は常時マウントされ next-intl の useRouter を呼ぶため、
// AppRouterContext 無しの単体テストではクラッシュする (本テストの関心事とは無関係)。
vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

import PracticeTabModal from "@/components/forms/PracticeTabModal";

const FUTURE_DATE = new Date("2099-01-01");

function renderModal(allowParentUpdate?: boolean) {
  return render(
    <PracticeTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={vi.fn()}
      selectedDate={FUTURE_DATE}
      editingData={null}
      editingPracticeId={null}
      availableTags={[]}
      setAvailableTags={vi.fn()}
      isLoading={false}
      initialTab="practiceLog"
      {...(allowParentUpdate === undefined ? {} : { allowParentUpdate })}
    />,
  );
}

describe("PracticeTabModal allowParentUpdate", () => {
  it("[V-1] allowParentUpdate=false のとき、日付・タイトル・場所・メモの入力欄が disabled になる", () => {
    renderModal(false);

    // DatePicker は disabled 制御を testid + "-button" サフィックスのボタン側で行う
    // (CompetitionTabModal と同じ DatePicker 共通コンポーネントを使うため)。
    expect(screen.getByTestId("practice-tab-date-button")).toBeDisabled();
    expect(screen.getByTestId("practice-tab-title")).toBeDisabled();
    expect(screen.getByTestId("practice-tab-place")).toBeDisabled();
    expect(screen.getByTestId("practice-tab-note")).toBeDisabled();
  });

  it("[V-2] allowParentUpdate=false のとき、制限バナーが表示される", () => {
    renderModal(false);

    expect(screen.getByTestId("practice-tab-edit-restricted-notice")).toBeInTheDocument();
  });

  it("[V-3 / セレクタの健全性確認] allowParentUpdate=true のとき、入力欄は disabled にならない", () => {
    renderModal(true);

    expect(screen.getByTestId("practice-tab-date-button")).not.toBeDisabled();
    expect(screen.getByTestId("practice-tab-title")).not.toBeDisabled();
    expect(screen.getByTestId("practice-tab-place")).not.toBeDisabled();
    expect(screen.getByTestId("practice-tab-note")).not.toBeDisabled();
    expect(screen.queryByTestId("practice-tab-edit-restricted-notice")).toBeNull();
  });

  it("[V-4 / 非退行] allowParentUpdate 省略時 (デフォルト true) は入力欄が disabled にならない" +
    " (チームタブ (TeamPractices.tsx) は明示的に渡さずこの既定値に委ねる設計のため)", () => {
    renderModal(undefined);

    expect(screen.getByTestId("practice-tab-date-button")).not.toBeDisabled();
    expect(screen.queryByTestId("practice-tab-edit-restricted-notice")).toBeNull();
  });

  it("[V-5 / SC2の核心] allowParentUpdate=false でも practiceLog タブの「メニュー追加」ボタンは" +
    " 無効化されない (親のロックが子データ編集に波及しないこと)", () => {
    renderModal(false);

    // initialTab="practiceLog" で開いているため、ログタブのメニュー追加ボタンが
    // disabled でないことを見る。
    const addMenuButton = screen.getByTestId("add-menu-button");
    expect(addMenuButton).not.toBeDisabled();
  });
});
