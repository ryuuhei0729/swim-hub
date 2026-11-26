/**
 * FocusPointFormScreen (フォーカスポイントの追加・編集)
 */
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { Alert, Keyboard } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusPointLimitError } from "@apps/shared/api/focusPoints";
import type { FocusPoint } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  goBack: vi.fn(),
  params: undefined as { focusPointId?: string } | undefined,
  query: { data: [] as FocusPoint[] | undefined, isPending: false, isError: false },
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/focusPoints", () => {
  const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false });
  return {
    useFocusPointsQuery: () => mocks.query,
    useCreateFocusPointMutation: () => mutation(mocks.create),
    useUpdateFocusPointMutation: () => mutation(mocks.update),
    useSetFocusPointStatusMutation: () => mutation(mocks.setStatus),
    useDeleteFocusPointMutation: () => mutation(mocks.remove),
  };
});
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
  useRoute: () => ({ params: mocks.params }),
}));
// 共有モックの TextInput は onChangeText を結線しないので、DOM の onChange から呼ぶよう差し替える
// (CompetitionTabFormScreen.bestTimePrefill.test.tsx と同じ方式。共有モック自体は変えない)
vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("../../__mocks__/react-native")>(
    "../../__mocks__/react-native",
  );
  return {
    ...actual,
    TextInput: ({
      onChangeText,
      value,
      testID,
      multiline: _multiline,
      textAlignVertical: _textAlignVertical,
      placeholderTextColor: _placeholderTextColor,
      returnKeyType: _returnKeyType,
      autoFocus: _autoFocus,
      maxLength,
      placeholder,
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      testID?: string;
      maxLength?: number;
      placeholder?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        value,
        maxLength,
        placeholder,
        "data-testid": testID,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});
vi.mock("@/components/forms/FormKeyboardAvoidingView", () => ({
  FormKeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { FocusPointFormScreen } from "../FocusPointFormScreen";

const point = (overrides: Partial<FocusPoint> = {}): FocusPoint => ({
  id: "fp-1",
  user_id: "user-1",
  title: "腰を浮かせる",
  note: "コーチに言われた",
  status: "active",
  mastered_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mocks.goBack.mockReset();
  mocks.params = undefined;
  mocks.query = { data: [], isPending: false, isError: false };
  mocks.create.mockReset().mockResolvedValue(point());
  mocks.update.mockReset().mockResolvedValue(point());
  mocks.setStatus.mockReset().mockResolvedValue(point());
  mocks.remove.mockReset().mockResolvedValue(undefined);
  vi.mocked(Alert.alert).mockReset();
  vi.mocked(Keyboard.dismiss).mockClear();
});

describe("FocusPointFormScreen — 追加", () => {
  it("入力して追加すると保存して閉じる", async () => {
    const { getByTestId, getByText } = render(<FocusPointFormScreen />);
    fireEvent.change(getByTestId("focus-point-title-input"), {
      target: { value: "右手の入水を遠くに" },
    });
    fireEvent.click(getByText("追加する"));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({ title: "右手の入水を遠くに", note: "" }),
    );
    expect(mocks.goBack).toHaveBeenCalled();
    // Android ではキーボードが閉じないまま前の画面に残ることがあるので、閉じてから戻る
    expect(Keyboard.dismiss).toHaveBeenCalled();
  });

  it("空欄のエラーは、タイトルを入力し直したら消える", () => {
    const { getByTestId, getByText, queryByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("追加する"));
    expect(getByText("意識することを入力してください")).toBeTruthy();
    fireEvent.change(getByTestId("focus-point-title-input"), { target: { value: "腰" } });
    expect(queryByText("意識することを入力してください")).toBeNull();
    expect(getByText("1 / 100")).toBeTruthy();
  });

  it("空欄ならエラーを出して保存しない", () => {
    const { getByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("追加する"));
    expect(getByText("意識することを入力してください")).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("上限で止められたら「3つまで」のエラーを出し、画面は閉じない", async () => {
    mocks.create.mockRejectedValue(new FocusPointLimitError());
    const { getByTestId, getByText, findByText } = render(<FocusPointFormScreen />);
    fireEvent.change(getByTestId("focus-point-title-input"), { target: { value: "x" } });
    fireEvent.click(getByText("追加する"));
    expect(await findByText(/同時に3つまでです/)).toBeTruthy();
    expect(mocks.goBack).not.toHaveBeenCalled();
  });

  it("追加のときは「身についた」「削除」を出さない", () => {
    const { queryByText } = render(<FocusPointFormScreen />);
    expect(queryByText("身についた")).toBeNull();
    expect(queryByText("削除")).toBeNull();
  });
});

describe("FocusPointFormScreen — 編集", () => {
  beforeEach(() => {
    mocks.params = { focusPointId: "fp-1" };
    mocks.query = { data: [point()], isPending: false, isError: false };
  });

  it("今の内容を入れた状態で開き、保存すると更新する", async () => {
    const { getByTestId, getByText } = render(<FocusPointFormScreen />);
    const input = getByTestId("focus-point-title-input") as HTMLInputElement;
    expect(input.value).toBe("腰を浮かせる");
    fireEvent.change(input, { target: { value: "腰を高く保つ" } });
    fireEvent.click(getByText("保存する"));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        id: "fp-1",
        input: { title: "腰を高く保つ", note: "コーチに言われた" },
      }),
    );
  });

  it("「身についた」で状態を変えて閉じる", async () => {
    const { getByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("身についた"));
    await waitFor(() =>
      expect(mocks.setStatus).toHaveBeenCalledWith({ id: "fp-1", status: "mastered" }),
    );
    expect(mocks.goBack).toHaveBeenCalled();
  });

  it("身についたものは「もう一度取り組む」を出し、上限ならエラーを出す", async () => {
    mocks.query = {
      data: [point({ status: "mastered", mastered_at: "2026-10-01T00:00:00Z" })],
      isPending: false,
      isError: false,
    };
    mocks.setStatus.mockRejectedValue(new FocusPointLimitError());
    const { getByText, findByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("もう一度取り組む"));
    expect(await findByText(/同時に3つまでです/)).toBeTruthy();
    expect(mocks.setStatus).toHaveBeenCalledWith({ id: "fp-1", status: "active" });
    expect(mocks.goBack).not.toHaveBeenCalled();
  });

  it("削除は確認ダイアログで「削除」を選んだときだけ消す", async () => {
    const { getByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("削除"));
    expect(mocks.remove).not.toHaveBeenCalled();

    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => Promise<void>;
    }>;
    await buttons.find((b) => b.text === "削除")!.onPress!();
    expect(mocks.remove).toHaveBeenCalledWith("fp-1");
    expect(mocks.goBack).toHaveBeenCalled();
  });

  it("削除で一覧から消えても、閉じるまでの間に「見つかりませんでした」を出さない", async () => {
    // 実際は削除の成功時に一覧を取り直し、対象が消えた状態で画面が描き直される
    mocks.remove.mockImplementation(async () => {
      mocks.query = { data: [], isPending: false, isError: false };
    });
    const { getByText, queryByText, rerender } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("削除"));
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => Promise<void>;
    }>;
    await act(async () => {
      await buttons.find((b) => b.text === "削除")!.onPress!();
    });
    rerender(<FocusPointFormScreen />);
    expect(mocks.goBack).toHaveBeenCalled();
    expect(queryByText("このフォーカスポイントは見つかりませんでした")).toBeNull();
  });

  it("削除に失敗したらエラーを出し、画面は閉じない", async () => {
    mocks.remove.mockRejectedValue(new Error("network"));
    const { getByText, findByText } = render(<FocusPointFormScreen />);
    fireEvent.click(getByText("削除"));
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => Promise<void>;
    }>;
    await act(async () => {
      await buttons.find((b) => b.text === "削除")!.onPress!();
    });
    expect(await findByText(/削除できませんでした/)).toBeTruthy();
    expect(mocks.goBack).not.toHaveBeenCalled();
  });

  it("見つからなければその旨を出す", () => {
    mocks.query = { data: [], isPending: false, isError: false };
    const { getByText } = render(<FocusPointFormScreen />);
    expect(getByText("このフォーカスポイントは見つかりませんでした")).toBeTruthy();
  });
});
