/**
 * PracticeLogDetail（「その他アイテム」= competition/team_competition の裸大会ブロック）
 * 削除ボタンの isTeamCompetition 引き渡し / team 系削除ボタン非表示ガード テスト
 *
 * 対象: apps/mobile/components/calendar/DayDetailModal/components/PracticeLogDetail.tsx:691-702
 *
 * 背景 (PM 追加指摘 2026-08-26):
 *   entries/records が紐づかない裸の大会アイテム (competition/team_competition) は
 *   DayDetailModal から MemoizedPracticeLogDetail (= PracticeLogDetail) 経由で削除される。
 *   この経路は PM/Planner が当初把握していなかった4つ目の削除経路。
 *
 * PM 裁定 (2026-09-19, Sprint Contract D4/SC1 反映):
 *   [V-M-C07] は旧挙動「team_competition でも削除ボタンが表示され
 *   onDeleteCompetition(id, true) が呼ばれる」を pin していたが、これは本スプリントの
 *   修正対象のバグそのものであり仕様ではない。個人画面 (dashboard/大会タブ/練習タブ) から
 *   チーム大会は admin であっても削除不可という新仕様に合わせ、
 *   「team_competition では削除ボタン自体が描画されない」ことを検証する形に更新した。
 *   実装を旧挙動に戻す方向のテスト修正は禁止 (過去に観測挙動の pin でバグが仕様に
 *   昇格した事故がある)。
 *
 * Sprint Contract 検証観点:
 *   [V-M-C06] type="competition" (個人) では削除ボタンが描画され、押下で
 *             onDeleteCompetition(id, false) が呼ばれる (従来通り・非退行)
 *   [V-M-C07] type="team_competition" では削除ボタン自体が描画されない
 *             (同じ icon-trash-2 セレクタを使う V-M-C06 で「ボタンが存在する場合は
 *             見つかる」ことを証明済みのため、本テストの queryByTestId(null) は
 *             セレクタ自体の不備による偽陽性ではない)
 *   [V-M-C08] type="practice"/"record"/"entry" では、この競技削除ボタン自体が
 *             描画されない (誤って別種別で削除ボタンが出ないことの回帰防止)
 *
 * トートロジー防止メモ: onDeleteCompetition はテスト側の spy であり実装からコピーした
 * assertion ではない。「押した item の id とその item.type から導かれる真偽値」という
 * Sprint Contract の仕様のみを検証する。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__mocks__/supabase";
import type { CalendarItem } from "@apps/shared/types/ui";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
}));

vi.mock("@/components/share", () => ({
  ShareCardModal: () => null,
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  const React = await import("react");
  return {
    ...original,
    Dimensions: {
      get: vi.fn((_dim: string) => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
  };
});

import { PracticeLogDetail } from "../components/PracticeLogDetail";

function makeItem(type: CalendarItem["type"], id: string, teamId?: string): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: teamId ? { team_id: teamId } : {},
  } as CalendarItem;
}

function renderItem(
  item: CalendarItem,
  handlers: Partial<{
    onDeleteCompetition: (competitionId: string, isTeamCompetition: boolean) => void;
    onEditCompetition: (item: CalendarItem) => void;
    onDeletePractice: (itemId: string) => void;
    onDeleteRecord: (recordId: string) => void;
    onDeleteEntry: (entryId: string) => void;
  }> = {},
) {
  return render(
    <PracticeLogDetail
      item={item}
      title="title"
      color="#10B981"
      typeLabel="大会"
      isPractice={false}
      isPracticeLog={false}
      practiceId=""
      onClose={vi.fn()}
      {...handlers}
    />,
  );
}

describe("PracticeLogDetail (その他アイテム) 削除ボタンの isTeamCompetition 引き渡し", () => {
  beforeEach(() => {
    const supabase = createMockSupabaseClient({ queryData: null });
    mockUseAuth.mockReturnValue({ supabase, getAccessToken: vi.fn().mockResolvedValue(null) });
  });

  it("[V-M-C06] type=competition (個人大会) の削除ボタンは onDeleteCompetition(id, false) を呼ぶ", () => {
    const onDeleteCompetition = vi.fn();
    renderItem(makeItem("competition", "comp-personal-1"), { onDeleteCompetition });

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeleteCompetition).toHaveBeenCalledTimes(1);
    expect(onDeleteCompetition).toHaveBeenCalledWith("comp-personal-1", false);
  });

  it("[V-M-C07] type=team_competition では削除ボタン(trash-2アイコン)自体が描画されない (新仕様: 個人画面からチーム大会は削除不可)", () => {
    const onDeleteCompetition = vi.fn();
    renderItem(makeItem("team_competition", "comp-team-1", "team-x"), { onDeleteCompetition });

    // V-M-C06 で同じセレクタが個人大会では実際にヒットすることを確認済みのため、
    // ここで見つからないのはセレクタの不備ではなく team 系ガードが効いている証拠。
    expect(screen.queryByTestId("icon-trash-2")).toBeNull();
  });

  it("[V-M-C08] type=practice の削除ボタン押下は onDeletePractice を呼び、onDeleteCompetition は呼ばれない (誤配線の回帰防止)", () => {
    // Reviewer 指摘 (修正ラウンド1, T2) への対応:
    // renderItem 内で isPractice={false} が固定されていたため、type="practice" でも
    // isPractice 分岐が常に短絡し、「competition 用ボタンが出ない」ことと
    // 「isPractice=false で全ボタンが出ない」ことを区別できなかった。
    // isPractice を実アプリ (DayDetailModal.tsx:335) と同じ式で計算し、
    // onDeletePractice を実際に渡してクリックすることで、practice アイテムが
    // onDeletePractice に正しく配線され onDeleteCompetition には配線されないことを検証する。
    const onDeletePractice = vi.fn();
    const onDeleteCompetition = vi.fn();
    const item = makeItem("practice", "practice-1");
    const isPractice = item.type === "practice" || item.type === "team_practice";

    render(
      <PracticeLogDetail
        item={item}
        title="title"
        color="#10B981"
        typeLabel="練習"
        isPractice={isPractice}
        isPracticeLog={false}
        practiceId={item.id}
        onClose={vi.fn()}
        onDeletePractice={onDeletePractice}
        onDeleteCompetition={onDeleteCompetition}
      />,
    );

    fireEvent.click(screen.getByTestId("icon-trash-2").closest("button")!);

    expect(onDeletePractice).toHaveBeenCalledTimes(1);
    expect(onDeletePractice).toHaveBeenCalledWith("practice-1");
    expect(onDeleteCompetition).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// 編集ボタン (Sprint Contract 2 / D4 / SC1): 削除ボタンと同一条件
// (!isTeamItem) を編集ボタンにも適用する。
// -----------------------------------------------------------------------
describe("PracticeLogDetail (その他アイテム) 編集ボタンの isTeamCompetition ガード", () => {
  beforeEach(() => {
    const supabase = createMockSupabaseClient({ queryData: null });
    mockUseAuth.mockReturnValue({ supabase, getAccessToken: vi.fn().mockResolvedValue(null) });
  });

  it("[V-M-CE06] type=competition (個人大会) の編集ボタンは onEditCompetition(item) を呼ぶ", () => {
    const onEditCompetition = vi.fn();
    const item = makeItem("competition", "comp-personal-1");
    renderItem(item, { onEditCompetition });

    fireEvent.click(screen.getByTestId("icon-edit").closest("button")!);

    expect(onEditCompetition).toHaveBeenCalledTimes(1);
    expect(onEditCompetition).toHaveBeenCalledWith(item);
  });

  it("[V-M-CE07] type=team_competition では編集ボタン(editアイコン)自体が描画されない", () => {
    const onEditCompetition = vi.fn();
    renderItem(makeItem("team_competition", "comp-team-1", "team-x"), { onEditCompetition });

    // V-M-CE06 で同じセレクタが個人大会では実際にヒットすることを確認済みのため、
    // ここで見つからないのはセレクタの不備ではなく team 系ガードが効いている証拠。
    expect(screen.queryByTestId("icon-edit")).toBeNull();
  });
});
