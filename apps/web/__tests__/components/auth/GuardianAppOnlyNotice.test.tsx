// =============================================================================
// GuardianAppOnlyNotice — 保護者アカウントが Web にログインしたときの案内
// =============================================================================
//
//   [GA-1] 「アプリでご利用ください」と説明・App Store へのリンク・ログアウトだけを出す
//   [GA-2] ログアウトはこのブラウザだけ (scope: "local")。終わったらログイン画面を読み直す
//   [GA-3] ログアウトに失敗したら画面に知らせ、遷移しない
// =============================================================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";

vi.mock("@/contexts");

const replace = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/fullPageNavigation", () => ({
  useFullPageRouter: () => ({ push: vi.fn(), replace }),
}));

import { useAuth } from "@/contexts";
import { GuardianAppOnlyNotice } from "@/components/auth/GuardianAppOnlyNotice";

const signOut = vi.fn();

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  replace.mockReset();
  vi.mocked(useAuth).mockReturnValue(
    buildAuthContext({ supabase: { auth: { signOut } } as never }),
  );
});

describe("GuardianAppOnlyNotice", () => {
  it("[GA-1] 「アプリでご利用ください」と App Store へのリンク・ログアウトを出す", () => {
    render(<GuardianAppOnlyNotice />);

    expect(screen.getByRole("heading", { name: "アプリでご利用ください" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "App Store でアプリを入手" });
    expect(link).toHaveAttribute("href", "https://apps.apple.com/us/app/swimhub/id6756808731/");
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });

  it("[GA-2] ログアウトはこのブラウザだけで行い、ログイン画面を読み直す", async () => {
    render(<GuardianAppOnlyNotice />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("[GA-3] ログアウトに失敗したら知らせ、ログイン画面へは移らない", async () => {
    signOut.mockResolvedValue({ error: { message: "network" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GuardianAppOnlyNotice />);

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ログアウトに失敗しました");
    expect(replace).not.toHaveBeenCalled();
  });
});
