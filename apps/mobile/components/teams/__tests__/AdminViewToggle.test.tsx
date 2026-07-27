/**
 * AdminViewToggle.test.tsx — QA Sprint Contract Phase A スケルトン
 *
 * 対象コンポーネント（未実装・Phase B で App Developer が作成）:
 *   apps/mobile/components/teams/AdminViewToggle.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-03] value=true のとき状態テキストが「管理者ビュー」(admin キー) になる
 *   [V-04] value=false のとき状態テキストが「利用者ビュー」(user キー) になる
 *   [V-05] Switch を操作すると onValueChange(!value) が呼ばれる
 *   [V-06] accessibilityRole="switch" が設定され、accessibilityLabel が状態ごとに動的に変わる
 *   [V-15] 5言語 (ja/en/ko/zh/de) で adminToggle.admin / adminToggle.user が
 *          空文字列でなく定義されている（回帰: キー削除・タイポ防止）
 *
 * NOTE (テスト環境の注意):
 *   __mocks__/react-native.ts は共有インフラのため QA からは編集しない
 *  （担当外ファイル編集禁止のルールに従う）。
 *   Switch は共有モックに存在しないため、既存の
 *   VideoUploader.test.tsx / ImageUploader.test.tsx と同じ手法
 *   ( vi.mock("react-native", async (importOriginal) => ({ ...original, Switch: ... })) )
 *   でこのテストファイル内にローカルスコープの Switch モックを追加している。
 *   本番の RN Switch とは props の受け渡し（value/onValueChange/
 *   accessibilityRole/accessibilityLabel/trackColor/thumbColor）のみ検証し、
 *   実際のネイティブ挙動（トラック描画等）は実機/シミュレータで確認する。
 *
 * トートロジー防止メモ:
 *   - コンポーネント内部の value state 等は検査しない
 *   - onValueChange に渡された引数と、DOM に描画された属性 (data-value 等) の
 *     みを外部から観察する
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    // NOTE: 共有 __mocks__/react-native.ts に Switch が無いため、このテストファイル内でのみ追加。
    // 本番の AdminViewToggle.tsx が react-native から Switch を import する前提。
    Switch: ({
      value,
      onValueChange,
      accessibilityRole,
      accessibilityLabel,
      trackColor,
      thumbColor,
      disabled,
      ...props
    }: {
      value?: boolean;
      onValueChange?: (next: boolean) => void;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      trackColor?: { false: string; true: string };
      thumbColor?: string;
      disabled?: boolean;
    } & Record<string, unknown>) =>
      React.createElement("button", {
        ...props,
        "data-testid": "admin-view-switch",
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "data-value": String(value),
        "data-track-color": trackColor ? JSON.stringify(trackColor) : undefined,
        "data-thumb-color": thumbColor,
        disabled,
        onClick: () => onValueChange?.(!value),
      }),
  };
});

import { AdminViewToggle } from "../AdminViewToggle";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

describe("AdminViewToggle", () => {
  // [V-03] value=true のとき「管理者ビュー」が表示される
  it("value=true のとき管理者ビューのテキストが表示される", () => {
    render(<AdminViewToggle value={true} onValueChange={vi.fn()} />);
    // vitest.setup.ts の react-i18next モックは ja.json を解決するため、
    // 実際の日本語文言 (adminToggle.admin) がそのまま検証できる。
    expect(screen.getByText(jaMessages.teams.mobile.adminToggle.admin)).toBeTruthy();
    expect(screen.getByTestId("admin-view-switch").getAttribute("data-value")).toBe("true");
  });

  // [V-04] value=false のとき「利用者ビュー」が表示される
  it("value=false のとき利用者ビューのテキストが表示される", () => {
    render(<AdminViewToggle value={false} onValueChange={vi.fn()} />);
    expect(screen.getByText(jaMessages.teams.mobile.adminToggle.user)).toBeTruthy();
    expect(screen.getByTestId("admin-view-switch").getAttribute("data-value")).toBe("false");
  });

  // [V-05] Switch 操作で onValueChange(!value) が呼ばれる（ON→OFF）
  it("ON状態でスイッチを操作すると onValueChange(false) が呼ばれる", () => {
    const onValueChange = vi.fn();
    render(<AdminViewToggle value={true} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByTestId("admin-view-switch"));
    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  // [V-05] Switch 操作で onValueChange(!value) が呼ばれる（OFF→ON）
  it("OFF状態でスイッチを操作すると onValueChange(true) が呼ばれる", () => {
    const onValueChange = vi.fn();
    render(<AdminViewToggle value={false} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByTestId("admin-view-switch"));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  // [V-06] accessibilityRole="switch" が設定される
  it("accessibilityRole が switch である", () => {
    render(<AdminViewToggle value={true} onValueChange={vi.fn()} />);
    expect(screen.getByTestId("admin-view-switch").getAttribute("role")).toBe("switch");
  });

  // [V-06] accessibilityLabel が状態によって動的に変わる（固定文字列でないことのみ要求）
  it("accessibilityLabel が value=true と value=false で異なる", () => {
    const { rerender } = render(<AdminViewToggle value={true} onValueChange={vi.fn()} />);
    const labelOn = screen.getByTestId("admin-view-switch").getAttribute("aria-label");
    expect(labelOn).toBeTruthy();

    rerender(<AdminViewToggle value={false} onValueChange={vi.fn()} />);
    const labelOff = screen.getByTestId("admin-view-switch").getAttribute("aria-label");
    expect(labelOff).toBeTruthy();

    expect(labelOn).not.toBe(labelOff);
  });

  // 既存 Switch スタイル踏襲（GoogleCalendarSyncSettings.tsx 参照）の回帰確認
  it("trackColor/thumbColor が既存 Switch スタイルと一致する", () => {
    const { rerender } = render(<AdminViewToggle value={true} onValueChange={vi.fn()} />);
    let switchEl = screen.getByTestId("admin-view-switch");
    expect(switchEl.getAttribute("data-track-color")).toBe(
      JSON.stringify({ false: "#D1D5DB", true: "#93C5FD" }),
    );
    expect(switchEl.getAttribute("data-thumb-color")).toBe("#2563EB");

    rerender(<AdminViewToggle value={false} onValueChange={vi.fn()} />);
    switchEl = screen.getByTestId("admin-view-switch");
    expect(switchEl.getAttribute("data-thumb-color")).toBe("#F3F4F6");
  });

  // 境界値: onValueChange を連続で複数回呼んでもクラッシュしない・都度最新の value を反映する
  it("value の変化に追従してテキストが切り替わる（連続トグル）", () => {
    const { rerender } = render(<AdminViewToggle value={false} onValueChange={vi.fn()} />);
    expect(screen.getByText(jaMessages.teams.mobile.adminToggle.user)).toBeTruthy();

    rerender(<AdminViewToggle value={true} onValueChange={vi.fn()} />);
    expect(screen.getByText(jaMessages.teams.mobile.adminToggle.admin)).toBeTruthy();
    expect(screen.queryByText(jaMessages.teams.mobile.adminToggle.user)).toBeNull();

    rerender(<AdminViewToggle value={false} onValueChange={vi.fn()} />);
    expect(screen.getByText(jaMessages.teams.mobile.adminToggle.user)).toBeTruthy();
    expect(screen.queryByText(jaMessages.teams.mobile.adminToggle.admin)).toBeNull();
  });
});

// [V-15] 5言語パリティ: teams.mobile.adminToggle.admin / .user が全ロケールで非空
// NOTE: レンダリングを介さず messages/*.json を直接検証する
// （vitest.setup.ts の i18n モックは ja 固定のため、他言語はコンポーネント経由で検証できない）。
describe("[V-15] adminToggle 5言語パリティ (messages/*.json)", () => {
  const locales: Record<string, typeof jaMessages> = {
    ja: jaMessages,
    en: enMessages,
    ko: koMessages,
    zh: zhMessages,
    de: deMessages,
  };

  it.each(Object.entries(locales))("%s: adminToggle.admin / .user が空文字でない", (_locale, messages) => {
    expect(messages.teams.mobile.adminToggle.admin).toBeTruthy();
    expect(messages.teams.mobile.adminToggle.user).toBeTruthy();
  });
});
