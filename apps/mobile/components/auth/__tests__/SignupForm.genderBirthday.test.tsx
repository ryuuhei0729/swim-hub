/**
 * SignupForm: 性別・生年月日を入力して新規登録できる (web の AuthForm と同じ。swimhub-tasks#132)
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";
import ja from "@apps/shared/messages/ja.json";

vi.mock("@/contexts/AuthProvider");

// 共通モックの TextInput は onChangeText を DOM の change に繋がないので、ここだけ繋ぐ
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({
      onChangeText,
      editable,
      testID,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      editable?: boolean;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        "data-testid": testID,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

import { SignupForm } from "../SignupForm";

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText(ja.auth.fields.namePlaceholder), {
    target: { value: "テストユーザー" },
  });
  fireEvent.change(screen.getByPlaceholderText(ja.auth.fields.emailPlaceholder), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText(ja.auth.fields.passwordPlaceholder), {
    target: { value: "Test1234!" },
  });
}

describe("SignupForm: 性別・生年月日", () => {
  it("性別と生年月日の入力欄がある", () => {
    render(<SignupForm />);

    expect(screen.getByText(ja.mypage.profileEdit.genderMale)).toBeTruthy();
    expect(screen.getByText(ja.mypage.profileEdit.genderFemale)).toBeTruthy();
    expect(screen.getByText(ja.auth.fields.birthday)).toBeTruthy();
  });

  it("選んだ性別を signUp に渡す (生年月日が未入力なら undefined)", async () => {
    const signUp = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({ signUp }));
    render(<SignupForm />);

    fillRequired();
    fireEvent.click(screen.getByText(ja.mypage.profileEdit.genderFemale));
    await act(async () => {
      fireEvent.click(screen.getByText(ja.auth.signup.submitButton));
    });

    expect(signUp).toHaveBeenCalledWith("new@example.com", "Test1234!", "テストユーザー", 1, undefined);
  });

  it("入力した生年月日を yyyy-MM-dd で signUp に渡す (性別は既定の男性)", async () => {
    const signUp = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({ signUp }));
    render(<SignupForm />);

    fillRequired();
    fireEvent.change(screen.getByPlaceholderText("1996"), { target: { value: "2005" } });
    fireEvent.change(screen.getByPlaceholderText("2"), { target: { value: "4" } });
    fireEvent.change(screen.getByPlaceholderText("22"), { target: { value: "9" } });
    await act(async () => {
      fireEvent.click(screen.getByText(ja.auth.signup.submitButton));
    });

    expect(signUp).toHaveBeenCalledWith("new@example.com", "Test1234!", "テストユーザー", 0, "2005-04-09");
  });
});
