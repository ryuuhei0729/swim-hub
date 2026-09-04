/**
 * GroupMemberModal.test.tsx — Sprint Contract [Bug1] メンバー選択モーダルの機能検証
 *
 * 対象: apps/mobile/components/teams/group-management/GroupMemberModal.tsx
 *
 * 背景 (Sprint Contract より):
 *   グループカードの「人+」アイコンから開くメンバー選択モーダルが縦に潰れ、
 *   メンバー選択リストが高さ0で見えず機能不能というバグが報告されている。
 *   PM 実測による確定原因は `body` スタイルの `flex: 1`（高さ未確定の親の中で
 *   flexBasis:0 のまま伸長先を得られず高さ0に収束する）。
 *
 * jsdom 制約に関する重要な注意 (実測済み):
 *   このプロジェクトの vitest 環境は React Native の View/FlatList 等を
 *   `__mocks__/react-native.ts` で `<div>`/`<span>` に静的変換するのみで、
 *   実際のレイアウト計算 (flex の解決結果としての実ピクセル高さ) は一切行わない。
 *   そのため「flex:1 によって高さが0になる」という表示バグ自体は
 *   このテストスイートでは再現も検知もできない (jsdom はレンダーツリーの
 *   構造は検証できるが、算出後のボックス高さは常に 0 として扱われる)。
 *   -> 実際に高さが確保されているかの最終確認は Verification Checklist の
 *      実機/シミュレータ目視項目 (V-B1-VISUAL) に委ねる。
 *
 *   本ファイルが担保するのは「リストが機能として正しく動く」という
 *   回帰防止のセーフティネットである:
 *     - メンバー行がレンダーされる（0件で止まっていない）
 *     - チェックボックスのトグル、全選択/全解除、検索フィルタが機能する
 *     - 保存時に選択済み userId 配列が渡り、成否に応じて開閉が制御される
 *     - ローディング/空状態が正しく出し分けられる
 *
 * トートロジー防止メモ: 期待する文言は apps/shared/messages/ja.json の実際の値を
 * 直接書き出しており (GroupMemberModal.tsx の実装をコピーしていない)、
 * アサーションはユーザーから観測可能な結果 (レンダーされたテキスト・onSave への
 * 引数・onClose の呼び出し有無) のみを検証する。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// 共有モック __mocks__/react-native.ts の TextInput は onChangeText (RN 標準の変更
// コールバック) を DOM の onChange に橋渡ししていない (`{...props}` をそのまま <input>
// にスプレッドするだけ) ため、fireEvent.change だけでは検索欄の入力状態が更新されない。
// PasswordChangeModal.test.tsx で確立済みの手法に倣い、このファイル内限定で
// onChangeText を onChange 経由で発火させる (共有モックは変更しない)。
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({
      onChangeText,
      value,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

import { GroupMemberModal } from "../GroupMemberModal";
import type { TeamGroupWithCount } from "../hooks";

const GROUP: TeamGroupWithCount = {
  id: "g1",
  team_id: "t1",
  category: null,
  name: "Aチーム",
  member_count: 0,
} as unknown as TeamGroupWithCount;

const member = (userId: string, name: string) => ({
  id: `m-${userId}`,
  user_id: userId,
  users: { id: userId, name, profile_image_path: null },
});

const TEAM_MEMBERS = [member("u1", "Taro"), member("u2", "Hanako"), member("u3", "Jiro")];

const baseProps = {
  visible: true,
  onClose: vi.fn(),
  group: GROUP,
  teamMembers: TEAM_MEMBERS,
  currentMemberUserIds: [] as string[],
  onSave: vi.fn(async () => true),
  saving: false,
  loading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GroupMemberModal - メンバー一覧の表示", () => {
  it("[V-B1-01] teamMembers に渡した全員が行として表示される", () => {
    render(<GroupMemberModal {...baseProps} />);
    expect(screen.getByText("Taro")).toBeTruthy();
    expect(screen.getByText("Hanako")).toBeTruthy();
    expect(screen.getByText("Jiro")).toBeTruthy();
  });

  it("[V-B1-02] currentMemberUserIds に含まれるメンバー数が選択中カウントに反映される", () => {
    render(<GroupMemberModal {...baseProps} currentMemberUserIds={["u1", "u2"]} />);
    expect(screen.getByText("2 / 3 人選択中")).toBeTruthy();
  });

  it("[V-B1-03] teamMembers が空配列のとき、行が1件も表示されず選択数は 0/0 になる", () => {
    // 注: 共有モック __mocks__/react-native.ts の FlatList は ListEmptyComponent を
    // 一切解釈しない (data のみを描画する) ため、「メンバーがいません」という
    // 空状態メッセージ自体の表示はこのテスト環境では検証できない。
    // ここでは「0件で描画が止まっている (エラーにならず、行も出ない)」ことのみを保証し、
    // 空状態メッセージの文言確認は Verification Checklist の実機/目視項目に委ねる。
    render(<GroupMemberModal {...baseProps} teamMembers={[]} />);
    expect(screen.getByText("0 / 0 人選択中")).toBeTruthy();
    expect(screen.queryByText("Taro")).toBeNull();
  });

  it("[V-B1-04] loading=true のときリストではなく読み込み中表示になる", () => {
    render(<GroupMemberModal {...baseProps} loading />);
    expect(screen.getByText("読み込み中...")).toBeTruthy();
    expect(screen.queryByText("Taro")).toBeNull();
  });
});

describe("GroupMemberModal - 選択操作", () => {
  it("[V-B1-05] メンバー行をタップすると選択され、再タップで解除される", () => {
    render(<GroupMemberModal {...baseProps} />);
    const row = screen.getByText("Taro").closest("button")!;

    expect(screen.getByText("0 / 3 人選択中")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.getByText("1 / 3 人選択中")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.getByText("0 / 3 人選択中")).toBeTruthy();
  });

  it("[V-B1-06] 全選択で teamMembers 全員分の件数になり、全解除で0件に戻る", () => {
    render(<GroupMemberModal {...baseProps} />);
    fireEvent.click(screen.getByText("全選択"));
    expect(screen.getByText("3 / 3 人選択中")).toBeTruthy();

    fireEvent.click(screen.getByText("全解除"));
    expect(screen.getByText("0 / 3 人選択中")).toBeTruthy();
  });

  it("[V-B1-07] visible が再度 true になる (再オープン) と currentMemberUserIds で選択状態が初期化される", () => {
    const { rerender } = render(
      <GroupMemberModal {...baseProps} currentMemberUserIds={["u1"]} />,
    );
    expect(screen.getByText("1 / 3 人選択中")).toBeTruthy();

    fireEvent.click(screen.getByText("全選択"));
    expect(screen.getByText("3 / 3 人選択中")).toBeTruthy();

    // 一度閉じて (currentMemberUserIds はそのまま) 再度開き直す
    rerender(<GroupMemberModal {...baseProps} currentMemberUserIds={["u1"]} visible={false} />);
    rerender(<GroupMemberModal {...baseProps} currentMemberUserIds={["u1"]} visible />);
    expect(screen.getByText("1 / 3 人選択中")).toBeTruthy();
  });
});

describe("GroupMemberModal - 検索フィルタ", () => {
  it("[V-B1-08] 検索語に一致するメンバーのみ表示される", () => {
    render(<GroupMemberModal {...baseProps} />);
    const input = screen.getByPlaceholderText("メンバーを検索...");
    fireEvent.change(input, { target: { value: "hana" } });

    expect(screen.getByText("Hanako")).toBeTruthy();
    expect(screen.queryByText("Taro")).toBeNull();
    expect(screen.queryByText("Jiro")).toBeNull();
  });

  it("[V-B1-09] 一致するメンバーがいない検索語では全員が非表示になる", () => {
    // 注: [V-B1-03] と同じ理由で、「該当するメンバーがいません」という空状態メッセージの
    // 文言確認自体はこのテスト環境では検証できない (FlatList モックが ListEmptyComponent
    // を解釈しないため)。フィルタ結果として行が0件になることのみを検証する。
    render(<GroupMemberModal {...baseProps} />);
    const input = screen.getByPlaceholderText("メンバーを検索...");
    fireEvent.change(input, { target: { value: "存在しない名前" } });

    expect(screen.queryByText("Taro")).toBeNull();
    expect(screen.queryByText("Hanako")).toBeNull();
    expect(screen.queryByText("Jiro")).toBeNull();
  });
});

describe("GroupMemberModal - 保存/クローズ", () => {
  it("[V-B1-10] 保存ボタンで選択中の userId 配列を onSave に渡し、成功時は onClose を呼ぶ", async () => {
    const onSave = vi.fn(async (_groupId: string, _userIds: string[]) => true);
    const onClose = vi.fn();
    render(
      <GroupMemberModal {...baseProps} onSave={onSave} onClose={onClose} currentMemberUserIds={[]} />,
    );

    fireEvent.click(screen.getByText("Taro").closest("button")!);
    fireEvent.click(screen.getByText("Jiro").closest("button")!);
    fireEvent.click(screen.getByText("保存"));

    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    const [calledGroupId, calledUserIds] = onSave.mock.calls[0]!; // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
    expect(calledGroupId).toBe("g1");
    expect(new Set(calledUserIds)).toEqual(new Set(["u1", "u3"]));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-B1-11] onSave が false を返した場合 onClose は呼ばれずモーダルは開いたままになる", async () => {
    const onSave = vi.fn(async () => false);
    const onClose = vi.fn();
    render(<GroupMemberModal {...baseProps} onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByText("保存"));
    await Promise.resolve();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[V-B1-12] saving=true のとき保存/キャンセルボタンが無効化される", () => {
    // 注: このプロジェクトの mobile vitest には @testing-library/jest-dom が
    // 導入されていないため toBeDisabled() は使えない。DOM の disabled プロパティを直接見る。
    render(<GroupMemberModal {...baseProps} saving />);
    const saveButton = screen.getByText("保存中...").closest("button") as HTMLButtonElement;
    const cancelButton = screen.getByText("キャンセル").closest("button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(cancelButton.disabled).toBe(true);
  });

  it("[V-B1-13] saving=true のときキャンセルを押しても onClose は呼ばれない", () => {
    const onClose = vi.fn();
    render(<GroupMemberModal {...baseProps} saving onClose={onClose} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[V-B1-14] group が null の場合は何もレンダーしない", () => {
    const { container } = render(<GroupMemberModal {...baseProps} group={null} />);
    expect(container.innerHTML).toBe("");
  });
});
