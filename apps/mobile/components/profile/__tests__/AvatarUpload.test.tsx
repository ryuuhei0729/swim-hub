/**
 * AvatarUpload.test.tsx
 *
 * Sprint Contract (Bug1: プロフィール画像登録失敗 (Android)) 検証観点:
 *
 * [D1-a] Android picker オプションの統一
 *   apps/mobile/components/profile/AvatarUpload.tsx の
 *   `mediaTypes: ImagePicker.MediaTypeOptions.Images` (非推奨 API) を
 *   `mediaTypes: ["images"]` + `legacy: true` に統一する
 *   (components/shared/ImageUploader.tsx:180-188 と同一パターン)。
 *   allowsEditing: true / aspect: [1, 1] は維持する。
 *
 * [D1-b] 削除処理を Web API 経由に統一
 *   handleRemoveAvatar の Supabase Storage 直叩きを deleteProfileImageViaApi
 *   (utils/imageUpload.ts) 経由に置き換える。
 *
 * [V-P-12〜17] D1-a: launchImageLibraryAsync の呼び出しオプション
 * [V-P-18〜20] D1-a: 回帰 (権限拒否・選択後コールバック・base64/sizeチェック等の既存動作)
 * [V-P-21〜24] D1-b: 削除処理が Web API 経由になること・回帰
 *
 * 重要な前提 (Phase A で確認済み):
 *   AvatarUpload.tsx の画像選択ロジックは Platform.OS === "web" で分岐しており、"web" のときは
 *   DOM <input type="file"> パスに入るため ImagePicker は一切呼ばれない。D1-a の対象は else 分岐
 *   (ネイティブ = iOS/Android 共通コード) のため、react-native モックの Platform.OS を "android"
 *   (および回帰確認用に "ios") に上書きする。
 *
 * トートロジー防止メモ:
 *   - 期待する mediaTypes/legacy の値は Sprint Contract (ImageUploader.tsx:180-188 と同一パターン)
 *     に基づいて QA が独立に定義したものであり、Developer の diff を見て書いたものではない。
 *   - 内部 state (selectedImageUri 等) を直接検査せず、ImagePicker のモック呼び出し引数と
 *     onImageSelected / onAvatarChange コールバックの引数で外部から観察する。
 *
 * Phase B 実装メモ:
 *   - AvatarUpload.tsx は useAuth() から { user, getAccessToken } のみを取得する (supabase は不使用に
 *     なった。D1-b の実装確認)。モックもそれに合わせている。
 *   - useSignedImageUrl フックは本テストの対象外のため、個別にモックしてバイパスする
 *     (currentAvatarUrl の署名URL解決は Bug1 の検証範囲外)。
 *   - カメラアイコン/削除アイコンは Feather の data-testid (icon-camera / icon-x) 経由でクリックする
 *     (vitest.setup.ts の Feather モックが data-testid={`icon-${name}`} を付与する)。
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  deleteProfileImageViaApi: vi.fn(() => Promise.resolve()),
  alertFn: vi.fn(),
  // 実際の useAuth().getAccessToken は () => Promise<string | null> (AuthProvider.tsx) のため、
  // 型を合わせて null を返すケース ([V-P-24b]) もテストできるようにする
  getAccessToken: vi.fn<() => Promise<string | null>>(() => Promise.resolve("mock-token")),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
  // 旧 API。D1-a 実装後は AvatarUpload.tsx から参照されなくなっていることを確認する
  MediaTypeOptions: { Images: "Images" },
}));

vi.mock("@/utils/imageUpload", () => ({
  deleteProfileImageViaApi: mocks.deleteProfileImageViaApi,
}));

vi.mock("@/hooks/useSignedImageUrl", () => ({
  useSignedImageUrl: () => ({ url: null, isLoading: false }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  })),
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Platform: { ...original.Platform, OS: "android" as const },
    Alert: { alert: mocks.alertFn },
  };
});

import { AvatarUpload } from "../AvatarUpload";

/** Alert.alert のボタン群から text 一致するものを自動押下するヘルパー */
function mockAlertPressButton(buttonText: string) {
  mocks.alertFn.mockImplementation(
    (
      _title: string,
      _message: string,
      buttons?: Array<{ text?: string; onPress?: () => void }>,
    ) => {
      const button = buttons?.find((b) => b?.text === buttonText);
      button?.onPress?.();
    },
  );
}

const BASE_PROPS = {
  userName: "Taro",
  onAvatarChange: vi.fn(),
};

describe("AvatarUpload — ネイティブ画像選択オプション (Bug1 D1-a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
  });

  it(
    "[V-P-12] Android (Platform.OS='android') でカメラアイコンを押すと launchImageLibraryAsync が " +
      'mediaTypes: ["images"] で呼ばれる (旧 MediaTypeOptions.Images ではない)',
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
      const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
      expect(options.mediaTypes).toEqual(["images"]);
    },
  );

  it("[V-P-13] launchImageLibraryAsync が legacy: true で呼ばれる (HEIC/HEIF 変換のため)", async () => {
    render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-camera"));
    });
    const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
    expect(options.legacy).toBe(true);
  });

  it("[V-P-14] allowsEditing: true と aspect: [1, 1] は維持される (回帰)", async () => {
    render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-camera"));
    });
    const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
    expect(options.allowsEditing).toBe(true);
    expect(options.aspect).toEqual([1, 1]);
  });

  it("[V-P-15] quality: 0.7 と base64: true は維持される (回帰)", async () => {
    render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-camera"));
    });
    const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
    expect(options.quality).toBe(0.7);
    expect(options.base64).toBe(true);
  });

  it(
    "[V-P-16] iOS (Platform.OS='ios') でも同じオプション (mediaTypes:[\"images\"], legacy:true) で" +
      "呼ばれる (回帰・プラットフォーム分岐が増えないことの確認)",
    async () => {
      const RN = await import("react-native");
      (RN.Platform as unknown as { OS: string }).OS = "ios";
      try {
        render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
        await act(async () => {
          fireEvent.click(screen.getByTestId("icon-camera"));
        });
        const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
        expect(options.mediaTypes).toEqual(["images"]);
        expect(options.legacy).toBe(true);
      } finally {
        (RN.Platform as unknown as { OS: string }).OS = "android";
      }
    },
  );

  it(
    "[V-P-17] 権限が denied のとき Alert が表示され、launchImageLibraryAsync は呼ばれない (回帰)",
    async () => {
      mocks.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.alertFn).toHaveBeenCalled();
      expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled();
    },
  );
});

describe("AvatarUpload — 画像選択後のコールバック (回帰)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
  });

  it("[V-P-18] 選択・クロップ後、onImageSelected(uri, base64, fileExtension) が呼ばれる", async () => {
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///avatar.jpg", base64: "BASE64DATA", type: "image/jpeg" }],
    });
    const onImageSelected = vi.fn();
    render(
      <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-camera"));
    });
    expect(onImageSelected).toHaveBeenCalledWith("file:///avatar.jpg", "BASE64DATA", "jpg");
  });

  it(
    "[V-P-19] base64 が取得できない場合エラー Alert が表示され、onImageSelected は呼ばれない",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///avatar.jpg", base64: null, type: "image/jpeg" }],
      });
      const onImageSelected = vi.fn();
      render(
        <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.alertFn).toHaveBeenCalled();
      expect(onImageSelected).not.toHaveBeenCalled();
    },
  );

  it(
    "[V-P-20] ファイルサイズが5MBを超える場合エラー Alert が表示され、onImageSelected は呼ばれない",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: "file:///avatar.jpg",
            base64: "BASE64DATA",
            type: "image/jpeg",
            fileSize: 6 * 1024 * 1024,
          },
        ],
      });
      const onImageSelected = vi.fn();
      render(
        <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.alertFn).toHaveBeenCalled();
      expect(onImageSelected).not.toHaveBeenCalled();
    },
  );
});

describe("AvatarUpload — アバター削除 (Bug1 D1-b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("mock-token");
    mocks.deleteProfileImageViaApi.mockResolvedValue(undefined);
    mockAlertPressButton("削除");
  });

  it(
    "[V-P-21] 削除確認後、deleteProfileImageViaApi (Web API 経由) が呼ばれる (accessToken 付き)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-x"));
      });
      expect(mocks.deleteProfileImageViaApi).toHaveBeenCalledWith("mock-token");
    },
  );

  it("[V-P-22] 削除成功後 onAvatarChange(null) が呼ばれる (回帰)", async () => {
    const onAvatarChange = vi.fn();
    render(
      <AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" onAvatarChange={onAvatarChange} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-x"));
    });
    expect(onAvatarChange).toHaveBeenCalledWith(null);
  });

  it("[V-P-23] 削除失敗時にエラーメッセージが表示される (回帰)", async () => {
    mocks.deleteProfileImageViaApi.mockRejectedValueOnce(new Error("削除に失敗しました"));
    const onAvatarChange = vi.fn();
    render(
      <AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" onAvatarChange={onAvatarChange} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-x"));
    });
    expect(onAvatarChange).not.toHaveBeenCalled();
    // Android (Alert.alert) 経由でエラー表示される (回帰)
    expect(mocks.alertFn).toHaveBeenCalledWith(
      expect.anything(),
      "削除に失敗しました",
      expect.anything(),
    );
  });

  it(
    "[V-P-24] 削除確認ダイアログのプラットフォーム分岐 (native=Alert.alert) は変更されない (回帰)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-x"));
      });
      // 確認ダイアログ (削除可否) + 削除実行の2回 Alert.alert が呼ばれ得るため、
      // 少なくとも確認ダイアログが Alert.alert 経由で呼ばれたことを確認する
      expect(mocks.alertFn).toHaveBeenCalled();
    },
  );

  it(
    "[V-P-24b] accessToken が取得できない場合、deleteProfileImageViaApi を呼ばずエラー表示になる " +
      "(ProfileEditModal の [V-P-29] と同一パターンの防御コード)",
    async () => {
      mocks.getAccessToken.mockResolvedValueOnce(null);
      const onAvatarChange = vi.fn();
      render(
        <AvatarUpload
          {...BASE_PROPS}
          currentAvatarUrl="user-1/avatar.jpg"
          onAvatarChange={onAvatarChange}
        />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-x"));
      });
      expect(mocks.deleteProfileImageViaApi).not.toHaveBeenCalled();
      expect(onAvatarChange).not.toHaveBeenCalled();
      expect(mocks.alertFn).toHaveBeenCalled();
    },
  );
});
