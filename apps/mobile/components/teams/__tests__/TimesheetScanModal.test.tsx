/**
 * TimesheetScanModal — 写真からタイム表を読み取る (mobile, swimhub-tasks#66)
 *
 * web components/team/OcrScanModal と同じく scan-timesheet を呼び、
 * 選手ごとのメンバー割り当て・タイムの修正を経て、種目ごとのメニューを onApply に渡す。
 * 無料プランの回数上限 (サーバーが 429 を返す) は専用の文言で知らせる。
 *
 * 画像の選択・加工 (expo-image-picker / expo-image-manipulator) と Edge Function の呼び出しはモックする。
 */

import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  resize: vi.fn(),
  saveAsync: vi.fn(),
  alertFn: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { functions: { invoke: mocks.invoke } } }),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  launchCameraAsync: mocks.launchCameraAsync,
  requestCameraPermissionsAsync: mocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
}));

vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: mocks.resize,
      renderAsync: () => Promise.resolve({ saveAsync: mocks.saveAsync }),
    }),
  },
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Alert: { alert: mocks.alertFn },
    // 共通モックの TextInput は onChange を onChangeText へ渡さないため差し替える
    TextInput: ({
      onChangeText,
      testID,
      ...props
    }: { onChangeText?: (text: string) => void; testID?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        "data-testid": testID,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

/** Pressable (共通モックでは button) の testID は DOM 属性 testid になる */
const byTestId = (id: string): HTMLElement => {
  const el = document.querySelector(`[testid="${id}"]`);
  if (!el) throw new Error(`testid=${id} が見つからない`);
  return el as HTMLElement;
};

import { TimesheetScanModal } from "../TimesheetScanModal";

const members = [
  { user_id: "u-taro", users: { name: "山田太郎" } },
  { user_id: "u-hana", users: { name: "佐藤花子" } },
];

const SCAN = {
  menu: { distance: 50, repCount: 2, setCount: 1, circle: 60, description: "2 x 50" },
  swimmers: [
    { no: 1, name: "山田", style: "Fr", times: [30.1, 30.5] },
    { no: 2, name: "", style: "Fr", times: [32.0, null] },
  ],
};

function renderModal() {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<TimesheetScanModal visible onClose={onClose} members={members} onApply={onApply} />);
  return { onApply, onClose };
}

async function pickAndAnalyze() {
  fireEvent.click(screen.getByText("ライブラリから選択"));
  await waitFor(() => expect(mocks.saveAsync).toHaveBeenCalled());
  await waitFor(() => expect((byTestId("timesheet-scan-analyze") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(byTestId("timesheet-scan-analyze"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///sheet.heic", width: 4000, height: 3000 }],
  });
  mocks.saveAsync.mockResolvedValue({ uri: "file:///sheet.jpg", base64: "QUJD" });
  mocks.invoke.mockResolvedValue({ data: SCAN, error: null });
});

describe("TimesheetScanModal", () => {
  it("選んだ写真を JPEG・長辺 2000px にして scan-timesheet に送る", async () => {
    renderModal();
    await pickAndAnalyze();

    expect(mocks.resize).toHaveBeenCalledWith({ width: 2000 });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledWith(
      "scan-timesheet",
      expect.objectContaining({ body: { image: "QUJD", mimeType: "image/jpeg" } }),
    );
  });

  it("名前から割り当てたメンバーと直したタイムで、種目ごとのメニューを反映する (未割り当ては確認のうえ捨てる)", async () => {
    const { onApply, onClose } = renderModal();
    await pickAndAnalyze();

    // 1番は名前から自動で山田太郎、2番は未割り当て
    await waitFor(() => expect(byTestId("timesheet-scan-member-1").textContent).toContain("山田太郎"));
    expect(byTestId("timesheet-scan-member-2").textContent).toContain("未選択");

    const cell = screen.getByTestId("timesheet-scan-time-1-1");
    fireEvent.change(cell, { target: { value: "29.9" } });
    fireEvent.blur(cell);

    fireEvent.click(byTestId("timesheet-scan-apply"));

    // 未割り当てがあるので確認を出し、「破棄して反映」で反映する
    expect(mocks.alertFn).toHaveBeenCalledTimes(1);
    const buttons = mocks.alertFn.mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((b) => b.text === "破棄して反映")!.onPress!();

    expect(onApply).toHaveBeenCalledWith([
      {
        style: "Fr",
        distance: 50,
        reps: 2,
        sets: 1,
        circle: 60,
        note: "2 x 50",
        members: [
          {
            userId: "u-taro",
            times: [
              { setNumber: 1, repNumber: 1, time: 30.1 },
              { setNumber: 1, repNumber: 2, time: 29.9 },
            ],
          },
        ],
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("未割り当ての選手にメンバーを選ぶと、確認なしで反映する", async () => {
    const { onApply } = renderModal();
    await pickAndAnalyze();

    await waitFor(() => byTestId("timesheet-scan-member-2"));
    fireEvent.click(byTestId("timesheet-scan-member-2"));
    fireEvent.click(screen.getByText("佐藤花子"));
    fireEvent.click(byTestId("timesheet-scan-apply"));

    expect(mocks.alertFn).not.toHaveBeenCalled();
    expect(onApply.mock.calls[0]![0][0].members.map((m: { userId: string }) => m.userId)).toEqual([
      "u-taro",
      "u-hana",
    ]);
  });

  it("無料プランの回数上限 (429) では上限の文言を出して選び直せる状態に戻る", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: { status: 429 } } });
    renderModal();
    await pickAndAnalyze();

    expect(
      await screen.findByText("今日の利用回数に達しました。Premiumにアップグレードすると無制限に利用できます"),
    ).toBeTruthy();
    expect(byTestId("timesheet-scan-analyze")).toBeTruthy();
  });

  it("解析結果の形が不正なら、フォームに流し込まずにエラーを出す", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "x" }, error: null });
    const { onApply } = renderModal();
    await pickAndAnalyze();

    expect(await screen.findByText("解析結果の形式が不正です。再度お試しください")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
  });
});
