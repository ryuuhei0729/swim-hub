/**
 * MyMonthlyAttendance.quickStateSync.test.tsx — PM 裁定 Critical 1 再検証
 *
 * 対象: apps/mobile/components/teams/MyMonthlyAttendance.tsx の `syncQuickStateAfterSave`
 *
 * 背景(修正前の Critical): 月モーダルからイベントAを保存すると、末尾で
 * `loadQuickAttendances()` を呼んでいたため、その内部の `setQuickEditStates(initialEditStates)`
 * が即回答セクションの `quickEditStates` を丸ごとサーバー値で上書きしていた。これにより、
 * 即回答セクションで入力中(未保存)だったイベントBの内容が警告なく消えるデータ損失があった。
 *
 * 修正後: `handleSaveEvent` は `loadQuickAttendances()` を呼ばず、保存対象の eventId 1件だけを
 * 差分反映する `syncQuickStateAfterSave` を経由する。
 *
 * Sprint Contract 検証観点(PM裁定 再検証項目2):
 *   [V-CRIT1] 即回答セクションに未保存入力があるイベントBが存在する状態で、
 *             月モーダルからイベントAを保存しても、Bの未保存入力(ステータス・備考)が
 *             一切変更されずに保持される。
 *
 * 実現方針: MyMonthlyAttendance は1694行で全依存(useAuth/AttendanceAPI/supabase.from の
 * 複数テーブルチェーン)を伴うが、TeamMemberList(1001行)/AdminMonthlyAttendance(1130行)が
 * 既に同等以上の規模で正常に RTL フルレンダーできている前例があるため、本ファイルでも
 * フルレンダーで検証する(OOMは発生しなかった)。
 *
 * 判定方法: 「Bの備考テキストが保存前の入力値のまま表示されているか」に加え、
 * 「Bの保存ボタンが引き続き有効(=変更ありと判定されている)か」を見る。もし
 * loadQuickAttendances() のフル初期化バグが再発すれば、B の quickEditStates が
 * サーバー値(既存出欠データ無し=status:null, note:"")に巻き戻り、
 * isQuickEventChanged(B) が false になって保存ボタンが disabled になる
 * (=このテストがそのまま検出できる)。
 *
 * トートロジー防止メモ: 期待値(Bの備考文字列・disabled状態)はテスト側でハードコードしており、
 * syncQuickStateAfterSave の実装コードをコピーしていない。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

// 共有モック __mocks__/react-native.ts の TextInput は onChangeText(RN標準の変更コールバック)を
// DOM の onChange に橋渡ししていない(`{...props}` をそのまま <input> にスプレッドするだけ)ため、
// fireEvent.change だけでは入力状態が更新されない。PasswordChangeModal.test.tsx と同じ手法で
// このテストファイル内限定で TextInput をローカルに上書きし、onChangeText を onChange 経由で
// 発火させる(共有モック自体は担当外のため変更しない)。
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({
      onChangeText,
      ...props
    }: { onChangeText?: (text: string) => void } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

// useAuth() は MyMonthlyAttendance のレンダーごとに呼ばれる。戻り値オブジェクトの参照が
// 毎回変わると attendanceAPI(useMemo)/calculateMonthStatus/loadMonthList(useCallback)の
// 依存が壊れ、mount 時の useEffect(loadMonthList) が無限に再実行されてしまうため、
// 必ず同一参照を返す(TeamMemberList.test.tsx と同じ注意点)。
const mocks = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  const getUser = vi.fn();
  return {
    getMyAttendancesByMonth: vi.fn(),
    bulkUpdateMyAttendances: vi.fn(),
    getUser,
    insert: vi.fn(),
    supabaseFrom,
    authValue: { supabase: { from: supabaseFrom, auth: { getUser } } },
  };
});

vi.mock("@swim-hub/shared/api/attendance", () => ({
  AttendanceAPI: class {
    getMyAttendancesByMonth = mocks.getMyAttendancesByMonth;
    bulkUpdateMyAttendances = mocks.bulkUpdateMyAttendances;
  },
}));

vi.mock("@/hooks/useDateLocale", () => ({
  useDateLocale: vi.fn(() => undefined),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mocks.authValue,
}));

import { MyMonthlyAttendance } from "../MyMonthlyAttendance";

function makeQueryBuilder(data: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data, error: null }),
  };
  return builder;
}

describe("MyMonthlyAttendance - 即回答セクションの状態保護 (PM裁定 Critical 1 再検証)", () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  // イベント日は「今日」にする。過去日にすると resolveAttendanceStatus により
  // 表示上「受付終了」になり、保存時に締切後編集の確認ダイアログ (Alert.alert) が
  // 割り込んで本テストの検証対象 (未保存入力の保持) に到達できない。
  // 当月固定日 (例: 15日) にすると月の後半だけ落ちるため日付は必ず相対で作る。
  const eventDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const makePractice = (id: string, place: string) => ({
    id,
    team_id: "team-1",
    date: eventDate,
    title: null,
    place,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    image_paths: [],
    attendance_status: "open" as const,
  });

  const practicesData = [makePractice("prac-A", "Aプール"), makePractice("prac-B", "Bプール")];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMyAttendancesByMonth.mockResolvedValue([]);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "me" } } });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "practices") return makeQueryBuilder(practicesData);
      if (table === "competitions") return makeQueryBuilder([]);
      if (table === "team_attendance") return { insert: mocks.insert };
      return makeQueryBuilder([]);
    });
  });

  it("[V-CRIT1] 月モーダルでイベントAを保存しても、即回答セクションのイベントBの未保存入力(備考・保存可否)は保持される", async () => {
render(<MyMonthlyAttendance teamId="team-1" />);

    // 即回答セクションに A/B 両方のカードが表示されるまで待つ
    await screen.findByText("@Aプール");
    await screen.findByText("@Bプール");

    // --- イベントB: 即回答セクションで「欠席」を選択 + 備考入力(保存はしない) ---
    // 月モーダルを開くと、モーダル側にも同月の B が同じテキストで表示されるため、
    // DOM 出現順で先頭(=即回答セクション側。モーダルは JSX 上で後段に配置される)を取る。
    const bCardQuick = () =>
      screen.getAllByText("@Bプール")[0]!.closest("button")!.parentElement!; // getAllByText は1件以上見つからなければ throw するため必ず存在
    fireEvent.click(within(bCardQuick()).getByText("欠席"));
    fireEvent.change(within(bCardQuick()).getByPlaceholderText("備考を入力（任意）"), {
      target: { value: "B用未保存メモ" },
    });

    // Bの保存ボタンが有効化されている(=未保存の変更がある)ことを確認
    expect(within(bCardQuick()).getByText("保存").closest("button")!.hasAttribute("disabled")).toBe(
      false,
    );
    expect(
      within(bCardQuick()).getByPlaceholderText("備考を入力（任意）").getAttribute("value"),
    ).toBe("B用未保存メモ");

    // --- 月一覧から当月モーダルを開く ---
    const monthLabel = `${currentYear}年${currentMonth}月`;
    fireEvent.click(screen.getByText(monthLabel));

    // モーダル内にもAが表示されるまで待つ(即回答セクション分と合わせて2箇所になる)
    await waitFor(() => {
      expect(screen.getAllByText("@Aプール").length).toBe(2);
    });

    // モーダル側のAカードを特定して「出席」を選択して保存する
    // (モーダル側は eventHeader が View で Pressable(eventInfo) をラップする1段深い構造のため、
    //  即回答セクション側より1階層多く遡って eventCard まで戻る)
    const aCardsInModal = screen.getAllByText("@Aプール");
    const aCardModal =
      aCardsInModal[aCardsInModal.length - 1]!.closest("button")!.parentElement!.parentElement!; // getAllByText は1件以上見つからなければ throw するため必ず存在
    fireEvent.click(within(aCardModal).getByText("出席"));
    fireEvent.click(within(aCardModal).getByText("保存").closest("button")!);

    // 保存完了を待つ(team_attendance への insert が呼ばれる = 新規保存が実行された)
    await waitFor(() => {
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    });

    // --- 検証(最重要): 即回答セクションのBの未保存入力が消えていないこと ---
    // 修正前バグ再発時は quickEditStates 全体がサーバー値({status:null,note:""})で
    // 上書きされ、備考が空になり保存ボタンが disabled になる。
    await waitFor(() => {
      expect(
        within(bCardQuick()).getByPlaceholderText("備考を入力（任意）").getAttribute("value"),
      ).toBe("B用未保存メモ");
    });
    expect(within(bCardQuick()).getByText("保存").closest("button")!.hasAttribute("disabled")).toBe(
      false,
    );
  }, 15000);
});
