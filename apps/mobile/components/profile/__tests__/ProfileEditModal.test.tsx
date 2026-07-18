/**
 * ProfileEditModal.test.tsx
 *
 * Sprint Contract (Bug1: プロフィール画像登録失敗 (Android)) 検証観点:
 *
 * [D1-b] アップロード処理を Web API 経由に統一
 *   handleSubmit 内の画像アップロード処理が行っていた Supabase Storage 直叩き
 *   (list → remove → base64ToArrayBuffer → upload) を、uploadProfileImageViaApi
 *   (utils/imageUpload.ts) 経由に置き換える。
 *
 * [V-P-25〜30] アップロード処理の呼び出し方法の変更・回帰
 * [V-P-31〜33] 画像未変更時の通常のプロフィール更新に回帰がないこと
 *
 * 複雑度についての判断:
 *   本コンポーネントは Modal だが、DayDetailModal と異なり Supabase への複雑な非同期データ
 *   フェッチ連鎖を持たない。既存の VideoUploader.test.tsx / ImageViewerModal.test.tsx と同程度の
 *   複雑度であるため、jsdom でのレンダーテストが可能と判断する (TimeInputModal の OOM 事例とは
 *   構造が異なり、navigation-guard 系の useEffect が存在しない)。
 *
 * トートロジー防止メモ:
 *   - useAuth() のモックから意図的に supabase を省略している。もし実装が退行して
 *     supabase.storage.from(...) を直接呼び出せば、supabase が undefined のため
 *     TypeError で即座にテストが失敗する。これにより「Supabase 直叩きに戻っていないこと」を
 *     モックの不在という形で強制的に検証する（新関数のモック呼び出し確認と両輪）。
 *
 * Phase B 実装メモ:
 *   - AvatarUpload は本ファイルの検証範囲外 (AvatarUpload.test.tsx で別途検証済み) のため、
 *     onImageSelected を直接発火できる軽量スタブに差し替える。
 *   - ProfileEditModal.tsx は base64ToArrayBuffer を import しなくなったことを確認済み
 *     (D1-b 実装後、Web API 経由のアップロードでは base64 文字列をそのまま渡すため不要になった)。
 */

import React from "react";
import { render, fireEvent, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadProfileImageViaApi: vi.fn(),
  // 実際の useAuth().getAccessToken は () => Promise<string | null> (AuthProvider.tsx) のため、
  // 型を合わせて null を返すケース ([V-P-29]) もテストできるようにする
  getAccessToken: vi.fn<() => Promise<string | null>>(() => Promise.resolve("mock-token")),
}));

vi.mock("@/utils/imageUpload", () => ({
  uploadProfileImageViaApi: mocks.uploadProfileImageViaApi,
}));

// AvatarUpload 自体は検証範囲外。onImageSelected を直接発火できる軽量スタブに差し替える。
vi.mock("../AvatarUpload", () => ({
  AvatarUpload: ({
    onImageSelected,
  }: {
    onImageSelected?: (uri: string, base64: string, ext: string) => void;
  }) =>
    React.createElement(
      "button",
      {
        "data-testid": "avatar-upload-stub",
        onClick: () => onImageSelected?.("file:///avatar.jpg", "BASE64DATA", "jpg"),
      },
      "avatar-stub",
    ),
}));

// 意図的に supabase を省略 (トートロジー防止メモ参照)
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  })),
}));

import { ProfileEditModal } from "../ProfileEditModal";

const BASE_PROFILE = {
  name: "Taro",
  birthday: "2000-01-01",
  bio: "",
  gender: 0,
  profile_image_path: null,
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ProfileEditModal>> = {}) {
  const onUpdate = vi.fn(() => Promise.resolve());
  const onAvatarChange = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  const utils = render(
    <ProfileEditModal
      visible={true}
      onClose={onClose}
      profile={BASE_PROFILE}
      onUpdate={onUpdate}
      onAvatarChange={onAvatarChange}
      {...overrides}
    />,
  );
  return { ...utils, onUpdate, onAvatarChange, onClose };
}

describe("ProfileEditModal — 画像アップロード (Bug1 D1-b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("mock-token");
    mocks.uploadProfileImageViaApi.mockResolvedValue({ path: "user-1/new-avatar.jpg" });
  });

  it(
    "[V-P-25] 画像を選択して保存しても supabase.storage 直叩きは起きない " +
      "(useAuth モックに supabase を渡していないため、直叩きがあれば TypeError で失敗する)",
    async () => {
      const { onUpdate } = renderModal();
      fireEvent.click(screen.getByTestId("avatar-upload-stub"));
      await act(async () => {
        fireEvent.click(screen.getByText("更新"));
      });
      await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    },
  );

  it("[V-P-26] 画像を選択して保存すると、uploadProfileImageViaApi(file, accessToken) が呼ばれる", async () => {
    renderModal();
    fireEvent.click(screen.getByTestId("avatar-upload-stub"));
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    await waitFor(() => expect(mocks.uploadProfileImageViaApi).toHaveBeenCalledTimes(1));
    expect(mocks.uploadProfileImageViaApi).toHaveBeenCalledWith(
      { base64: "BASE64DATA", fileExtension: "jpg" },
      "mock-token",
    );
  });

  it(
    "[V-P-27] uploadProfileImageViaApi の返す path が onAvatarChange(path) に渡される " +
      "(回帰: バケット内相対パスを DB に保存する契約は維持)",
    async () => {
      const { onAvatarChange } = renderModal();
      fireEvent.click(screen.getByTestId("avatar-upload-stub"));
      await act(async () => {
        fireEvent.click(screen.getByText("更新"));
      });
      await waitFor(() =>
        expect(onAvatarChange).toHaveBeenCalledWith("user-1/new-avatar.jpg"),
      );
    },
  );

  it(
    "[V-P-28] uploadProfileImageViaApi が失敗した場合、エラーメッセージが表示され、onUpdate は呼ばれない (回帰)",
    async () => {
      mocks.uploadProfileImageViaApi.mockRejectedValueOnce(new Error("upload failed"));
      const { onUpdate } = renderModal();
      fireEvent.click(screen.getByTestId("avatar-upload-stub"));
      await act(async () => {
        fireEvent.click(screen.getByText("更新"));
      });
      await waitFor(() =>
        expect(screen.getByText("プロフィールの更新に失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
      );
      expect(onUpdate).not.toHaveBeenCalled();
    },
  );

  it("[V-P-29] accessToken が取得できない場合でもクラッシュせず、エラー表示になる", async () => {
    mocks.getAccessToken.mockResolvedValueOnce(null);
    const { onUpdate } = renderModal();
    fireEvent.click(screen.getByTestId("avatar-upload-stub"));
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    await waitFor(() =>
      expect(screen.getByText("プロフィールの更新に失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
    );
    expect(mocks.uploadProfileImageViaApi).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("[V-P-30] アップロード成功後、モーダルが閉じてフォームがリセットされる (回帰)", async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId("avatar-upload-stub"));
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("ProfileEditModal — 画像未変更時の通常更新 (回帰)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("mock-token");
  });

  it(
    "[V-P-31] 画像を選択しない場合、uploadProfileImageViaApi は呼ばれず、" +
      "onUpdate(name, birthday, bio, gender) のみが呼ばれる",
    async () => {
      const { onUpdate } = renderModal();
      await act(async () => {
        fireEvent.click(screen.getByText("更新"));
      });
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(mocks.uploadProfileImageViaApi).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith({
        name: "Taro",
        birthday: "2000-01-01",
        bio: null,
        gender: 0,
      });
    },
  );

  it("[V-P-32] name が空のとき送信できず、必須エラーが表示される (回帰)", async () => {
    const { onUpdate } = renderModal({ profile: { ...BASE_PROFILE, name: "" } });
    // 送信ボタンは name が空の間 disabled になる (実装の disabled 属性の回帰確認)。
    // jest-dom 未導入のため toBeDisabled() は使わず、DOM の disabled プロパティを直接見る。
    const submitButton = screen.getByText("更新").closest("button") as HTMLButtonElement | null;
    expect(submitButton?.disabled).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("[V-P-33] 送信中 (isUpdating=true) はボタンが disabled になる (回帰)", async () => {
    let resolveUpdate: (() => void) | undefined;
    const onUpdate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderModal({ onUpdate });
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    const submitButton = screen.getByText("更新中...").closest("button") as HTMLButtonElement | null;
    expect(submitButton?.disabled).toBe(true);
    await act(async () => {
      resolveUpdate?.();
    });
  });
});
