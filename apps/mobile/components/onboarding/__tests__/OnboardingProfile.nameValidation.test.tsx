// =============================================================================
// OnboardingProfile.nameValidation.test.tsx
// =============================================================================
//
// オンボーディングの名前は web の Step2Profile と同じく、空欄・メールアドレス形式・
// 50文字超を弾いて保存しない (swimhub-tasks#98)。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/BirthdayInput", () => ({ BirthdayInput: () => null }));
vi.mock("@/components/ui/GenderToggle", () => ({ GenderToggle: () => null }));

import { OnboardingProfile } from "../OnboardingProfile";

const renderWithName = (name: string) => {
  const onNext = vi.fn().mockResolvedValue(undefined);
  render(<OnboardingProfile initialProfile={{ name }} onNext={onNext} onBack={vi.fn()} />);
  const next = document.querySelector('[accessibilitylabel="次へ"]');
  if (!next) throw new Error("次へボタンが見つからない");
  fireEvent.click(next);
  return onNext;
};

describe("OnboardingProfile — 名前の検証", () => {
  it("メールアドレス形式の名前は弾く", async () => {
    const onNext = renderWithName("taro@example.com");
    await waitFor(() =>
      expect(screen.getByText("メールアドレス形式ではなく、お名前を入力してください")).toBeTruthy(),
    );
    expect(onNext).not.toHaveBeenCalled();
  });

  it("50文字を超える名前は弾く", async () => {
    const onNext = renderWithName("あ".repeat(51));
    await waitFor(() => expect(screen.getByText("名前は50文字以内で入力してください")).toBeTruthy());
    expect(onNext).not.toHaveBeenCalled();
  });

  it("50文字ちょうどの名前は保存する", async () => {
    const name = "あ".repeat(50);
    const onNext = renderWithName(name);
    await waitFor(() => expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ name })));
  });
});
