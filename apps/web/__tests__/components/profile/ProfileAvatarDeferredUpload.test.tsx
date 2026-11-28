/**
 * プロフィール画像 — 削除の確認 (swimhub-tasks#130) と「保存」でのアップロード (swimhub-tasks#91)
 *
 * - 削除ボタンは確認を出し、キャンセルなら何も送らない (mobile の AvatarUpload と同じ)
 * - プロフィール編集では、トリミングを確定してもアップロードせずプレビューだけ差し替え、
 *   「更新」を押したときにアップロードして反映する。キャンセルならアップロードしない (mobile の ProfileEditModal と同じ)
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/image-url", () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue("https://example.test/avatar.jpg"),
}));

// トリミング画面は「確定」ボタンだけのスタブにする (react-easy-crop は jsdom で動かない)
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () =>
    function ImageCropModalStub({
      isOpen,
      onCropComplete,
    }: {
      isOpen: boolean;
      onCropComplete: (file: File) => void;
    }) {
      if (!isOpen) return null;
      return (
        <button
          type="button"
          onClick={() => onCropComplete(new File(["x"], "avatar.jpg", { type: "image/jpeg" }))}
        >
          crop-confirm
        </button>
      );
    },
}));

import AvatarUpload from "@/components/profile/AvatarUpload";
import ProfileEditModal from "@/components/profile/ProfileEditModal";

const fetchMock = vi.fn();
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

async function pickAndCrop(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(["x"], "photo.jpg", { type: "image/jpeg" }));
  await user.click(await screen.findByText("crop-confirm"));
}

describe("AvatarUpload — 削除の確認", () => {
  it("削除ボタンで確認を出し、キャンセルなら削除しない", async () => {
    const user = userEvent.setup();
    const onAvatarChange = vi.fn();
    render(
      <AvatarUpload currentAvatarUrl="user-1/a.jpg" userName="太郎" onAvatarChange={onAvatarChange} />,
    );

    await user.click(await screen.findByLabelText("アバターを削除"));
    expect(screen.getByText("プロフィール画像を削除しますか？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAvatarChange).not.toHaveBeenCalled();
  });

  it("確認で「削除」を選ぶと削除して onAvatarChange(null)", async () => {
    const user = userEvent.setup();
    const onAvatarChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    render(
      <AvatarUpload currentAvatarUrl="user-1/a.jpg" userName="太郎" onAvatarChange={onAvatarChange} />,
    );

    await user.click(await screen.findByLabelText("アバターを削除"));
    await user.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => expect(onAvatarChange).toHaveBeenCalledWith(null));
    expect(fetchMock).toHaveBeenCalledWith("/api/storage/profile", { method: "DELETE" });
  });
});

describe("ProfileEditModal — 画像は「更新」でアップロードする", () => {
  const profile = { name: "太郎", profile_image_path: "user-1/a.jpg" };

  it("トリミングを確定してもアップロードせず、キャンセルしたら何も反映しない", async () => {
    const user = userEvent.setup();
    const onAvatarChange = vi.fn();
    const onClose = vi.fn();
    render(
      <ProfileEditModal
        isOpen
        onClose={onClose}
        profile={profile}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onAvatarChange={onAvatarChange}
      />,
    );

    await pickAndCrop(user);
    expect(screen.getByAltText("プロフィール画像")).toHaveAttribute("src", "blob:preview");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAvatarChange).not.toHaveBeenCalled();
  });

  it("「更新」でアップロードし、返ったパスを反映してからプロフィールを更新する", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const onAvatarChange = vi.fn(async (path: string | null) => {
      calls.push(`avatar:${path}`);
    });
    const onUpdate = vi.fn(async () => {
      calls.push("profile");
    });
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ path: "user-1/new.jpg" }) });
    render(
      <ProfileEditModal
        isOpen
        onClose={vi.fn()}
        profile={profile}
        onUpdate={onUpdate}
        onAvatarChange={onAvatarChange}
      />,
    );

    await pickAndCrop(user);
    await user.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/storage/profile");
    expect(calls).toEqual(["avatar:user-1/new.jpg", "profile"]);
  });

  it("アップロードに失敗したらエラーを出し、プロフィールも更新しない", async () => {
    const user = userEvent.setup();
    const onAvatarChange = vi.fn();
    const onUpdate = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "raw" }) });
    render(
      <ProfileEditModal
        isOpen
        onClose={vi.fn()}
        profile={profile}
        onUpdate={onUpdate}
        onAvatarChange={onAvatarChange}
      />,
    );

    await pickAndCrop(user);
    await user.click(screen.getByRole("button", { name: "更新" }));

    expect(await screen.findByText("画像のアップロードに失敗しました")).toBeInTheDocument();
    expect(onAvatarChange).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
