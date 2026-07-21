/**
 * AvatarUpload.test.tsx
 *
 * Sprint Contract (Android READ_MEDIA_* 権限撤去 → システム Photo Picker 移行) 検証観点:
 *
 * 背景: Android の READ_MEDIA_IMAGES/VIDEO/VISUAL_USER_SELECTED 権限宣言未提出で Google Play
 * submit が失敗したため、legacy image picker を廃止し、Android は権限不要の新（非legacy）
 * システム Photo Picker を使う。Photo Picker は allowsEditing/aspect によるクロップを
 * サポートしないため、選択後に AvatarUpload 側で ImageManipulator を使い中央正方形クロップ +
 * JPEG 変換 (HEIC/HEIF 対応) を行う。iOS は従来どおり legacy:true な Picker を維持する
 * (allowsEditing/aspect によるネイティブクロップ)。
 *
 * [V-P-12〜18] Android: 権限リクエストなし・非legacy呼び出し・自前クロップ・HEIC→JPEG・
 *              base64サイズ概算チェック・base64欠落エラー・キャンセル時no-op
 * [V-P-19〜23] iOS (回帰): legacy:true 維持・権限リクエスト・allowsEditing/aspect維持
 * [V-P-21〜24b] アバター削除 (Web API 経由) — Photo Picker 移行と無関係な既存動作の回帰確認
 *
 * トートロジー防止メモ:
 *   - 期待するクロップ座標 (originX/originY/width/height) は「短辺を一致させ、はみ出す長辺を
 *     中央基準で切り落とす」という Sprint Contract の仕様から QA が独立に算出したものであり、
 *     Developer の実装コードを見て決めた値ではない (800x600 → size=600,originX=100,originY=0 等)。
 *   - 内部 state (selectedImageUri 等) を直接検査せず、ImagePicker / ImageManipulator の
 *     モック呼び出し引数と onImageSelected / onAvatarChange コールバックの引数で外部から観察する。
 *
 * Phase B 実装メモ:
 *   - AvatarUpload.tsx は useAuth() から { user, getAccessToken } のみを取得する。
 *   - useSignedImageUrl フックは本テストの対象外のため、個別にモックしてバイパスする。
 *   - カメラアイコン/削除アイコンは Feather の data-testid (icon-camera / icon-x) 経由でクリックする。
 *   - resolveAssetDimensions が参照する react-native の Image.getSize は静的モックのため、
 *     react-native モック内で Image.getSize を注入する。
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  deleteProfileImageViaApi: vi.fn(() => Promise.resolve()),
  alertFn: vi.fn(),
  getSize: vi.fn(),
  manipulate: vi.fn(),
  crop: vi.fn(),
  renderAsync: vi.fn(),
  saveAsync: vi.fn(),
  // 実際の useAuth().getAccessToken は () => Promise<string | null> (AuthProvider.tsx) のため、
  // 型を合わせて null を返すケース ([V-P-24b]) もテストできるようにする
  getAccessToken: vi.fn<() => Promise<string | null>>(() => Promise.resolve("mock-token")),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
}));

vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
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
    Image: { getSize: mocks.getSize },
  };
});

import { AvatarUpload } from "../AvatarUpload";
import { SaveFormat } from "expo-image-manipulator";

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

/** ImageManipulator.manipulate(...).crop(...).renderAsync() チェーンをセットアップする */
function setupManipulatorChain(saveResult: { uri: string; base64?: string }) {
  mocks.crop.mockReturnValue({ renderAsync: mocks.renderAsync });
  mocks.manipulate.mockReturnValue({ crop: mocks.crop });
  mocks.renderAsync.mockResolvedValue({ saveAsync: mocks.saveAsync });
  mocks.saveAsync.mockResolvedValue(saveResult);
}

async function setPlatform(os: "android" | "ios") {
  const RN = await import("react-native");
  (RN.Platform as unknown as { OS: string }).OS = os;
}

const BASE_PROPS = {
  userName: "Taro",
  onAvatarChange: vi.fn(),
};

describe("AvatarUpload — Android Photo Picker (権限撤去・自前クロップ)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPlatform("android");
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    setupManipulatorChain({ uri: "file:///cropped.jpg", base64: "CROPPEDBASE64" });
    mocks.getSize.mockImplementation(
      (_uri: string, success: (w: number, h: number) => void) => success(800, 600),
    );
  });

  it(
    "[V-P-12] Android でカメラアイコンを押しても requestMediaLibraryPermissionsAsync は呼ばれない " +
      "(新 Photo Picker は権限不要)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
      expect(mocks.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "[V-P-13] launchImageLibraryAsync が mediaTypes:[\"images\"] で呼ばれ、legacy/allowsEditing/aspect は" +
      "渡されない (Photo Picker は非legacy・クロップ非対応)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
      expect(options.mediaTypes).toEqual(["images"]);
      expect(options.legacy).toBeUndefined();
      expect(options.allowsEditing).toBeUndefined();
      expect(options.aspect).toBeUndefined();
      // クロップ・base64化は ImageManipulator 側で行うため picker 自体は base64 を取得しない
      expect(options.base64).toBe(false);
    },
  );

  it(
    "[V-P-14] 横長画像 (800x600) は短辺基準で中央正方形クロップされる " +
      "(size=600, originX=100, originY=0)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///wide.jpg", width: 800, height: 600, type: "image/jpeg" }],
      });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.manipulate).toHaveBeenCalledWith("file:///wide.jpg");
      expect(mocks.crop).toHaveBeenCalledWith({
        originX: 100,
        originY: 0,
        width: 600,
        height: 600,
      });
    },
  );

  it(
    "[V-P-14b] 縦長画像 (600x800) は短辺基準で中央正方形クロップされる " +
      "(size=600, originX=0, originY=100)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///tall.jpg", width: 600, height: 800, type: "image/jpeg" }],
      });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.crop).toHaveBeenCalledWith({
        originX: 0,
        originY: 100,
        width: 600,
        height: 600,
      });
    },
  );

  it(
    "[V-P-14c] asset.width/height が 0 のとき RNImage.getSize フォールバックで解決した" +
      "寸法でクロップされる",
    async () => {
      mocks.getSize.mockImplementation(
        (_uri: string, success: (w: number, h: number) => void) => success(400, 300),
      );
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///nodim.jpg", width: 0, height: 0, type: "image/jpeg" }],
      });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.getSize).toHaveBeenCalledWith(
        "file:///nodim.jpg",
        expect.any(Function),
        expect.any(Function),
      );
      expect(mocks.crop).toHaveBeenCalledWith({
        originX: 50,
        originY: 0,
        width: 300,
        height: 300,
      });
    },
  );

  it(
    "[V-P-14d] RNImage.getSize が失敗 (reject) した場合、未処理 Promise 例外にならず" +
      "外側 try/catch の汎用エラー Alert に伝播する",
    async () => {
      mocks.getSize.mockImplementation(
        (_uri: string, _success: (w: number, h: number) => void, failure: (err: Error) => void) =>
          failure(new Error("getSize failed")),
      );
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///nodim.jpg", width: 0, height: 0, type: "image/jpeg" }],
      });
      const onImageSelected = vi.fn();
      render(
        <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.crop).not.toHaveBeenCalled();
      expect(onImageSelected).not.toHaveBeenCalled();
      expect(mocks.alertFn).toHaveBeenCalledWith(
        expect.anything(),
        "getSize failed",
        expect.anything(),
      );
    },
  );

  it(
    "[V-P-14e] 正方形画像 (400x400) はクロップなしと同じ座標 (originX:0, originY:0, size:400) になる " +
      "(境界値: width===height)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///square.jpg", width: 400, height: 400, type: "image/jpeg" }],
      });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.crop).toHaveBeenCalledWith({
        originX: 0,
        originY: 0,
        width: 400,
        height: 400,
      });
    },
  );

  it(
    "[V-P-14f] 極小画像 (1x1) でもクロップ座標が破綻しない (境界値)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///tiny.jpg", width: 1, height: 1, type: "image/jpeg" }],
      });
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.crop).toHaveBeenCalledWith({
        originX: 0,
        originY: 0,
        width: 1,
        height: 1,
      });
    },
  );

  it(
    "[V-P-15] saveAsync が format: SaveFormat.JPEG, base64:true で呼ばれ、HEIC 入力でも " +
      'onImageSelected(uri, base64, "jpg") が呼ばれる (HEIC/HEIF→JPEG 変換維持)',
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.heic", width: 800, height: 600, type: "image/heic" }],
      });
      const onImageSelected = vi.fn();
      render(
        <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.saveAsync).toHaveBeenCalledWith(
        expect.objectContaining({ format: SaveFormat.JPEG, base64: true }),
      );
      expect(onImageSelected).toHaveBeenCalledWith("file:///cropped.jpg", "CROPPEDBASE64", "jpg");
    },
  );

  it(
    "[V-P-16] クロップ後 base64 が取得できない場合エラー Alert が表示され、onImageSelected は" +
      "呼ばれない",
    async () => {
      setupManipulatorChain({ uri: "file:///cropped.jpg", base64: undefined });
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.jpg", width: 800, height: 600, type: "image/jpeg" }],
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
    "[V-P-17] クロップ後の base64 概算サイズが5MBを超える場合エラー Alert が表示され、" +
      "onImageSelected は呼ばれない",
    async () => {
      // base64.length * 0.75 > 5MB となる長さの文字列を用意する
      const oversizedBase64 = "a".repeat(7_000_000);
      setupManipulatorChain({ uri: "file:///cropped.jpg", base64: oversizedBase64 });
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.jpg", width: 800, height: 600, type: "image/jpeg" }],
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
    "[V-P-18] キャンセル時は ImageManipulator が呼ばれず、onImageSelected も呼ばれない (回帰)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] });
      const onImageSelected = vi.fn();
      render(
        <AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} onImageSelected={onImageSelected} />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      expect(mocks.manipulate).not.toHaveBeenCalled();
      expect(onImageSelected).not.toHaveBeenCalled();
      expect(mocks.alertFn).not.toHaveBeenCalled();
    },
  );
});

describe("AvatarUpload — iOS legacy Picker (回帰: クロップ・権限フロー維持)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPlatform("ios");
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
  });

  afterEach(async () => {
    await setPlatform("android");
  });

  it(
    "[V-P-19] iOS では launchImageLibraryAsync 前に権限がリクエストされ、denied のとき Alert が" +
      "表示されて launchImageLibraryAsync は呼ばれない",
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

  it(
    "[V-P-20] iOS では mediaTypes:[\"images\"], legacy:true, allowsEditing:true, aspect:[1,1], " +
      "quality:0.7, base64:true で呼ばれる (ネイティブクロップ維持)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl={null} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-camera"));
      });
      const options = mocks.launchImageLibraryAsync.mock.calls[0][0];
      expect(options.mediaTypes).toEqual(["images"]);
      expect(options.legacy).toBe(true);
      expect(options.allowsEditing).toBe(true);
      expect(options.aspect).toEqual([1, 1]);
      expect(options.quality).toBe(0.7);
      expect(options.base64).toBe(true);
      // iOS は ImageManipulator による自前クロップを経由しない
      expect(mocks.manipulate).not.toHaveBeenCalled();
    },
  );

  it("[V-P-21] 選択後、onImageSelected(uri, base64, fileExtension) が呼ばれる (回帰)", async () => {
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
    "[V-P-22] base64 が取得できない場合エラー Alert が表示され、onImageSelected は呼ばれない (回帰)",
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
    "[V-P-23] ファイルサイズが5MBを超える場合エラー Alert が表示され、onImageSelected は呼ばれない (回帰)",
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

describe("AvatarUpload — アバター削除 (Photo Picker 移行と無関係な既存動作の回帰)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPlatform("android");
    mocks.getAccessToken.mockResolvedValue("mock-token");
    mocks.deleteProfileImageViaApi.mockResolvedValue(undefined);
    mockAlertPressButton("削除");
  });

  it(
    "[V-P-24] 削除確認後、deleteProfileImageViaApi (Web API 経由) が呼ばれる (accessToken 付き)",
    async () => {
      render(<AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("icon-x"));
      });
      expect(mocks.deleteProfileImageViaApi).toHaveBeenCalledWith("mock-token");
    },
  );

  it("[V-P-25] 削除成功後 onAvatarChange(null) が呼ばれる (回帰)", async () => {
    const onAvatarChange = vi.fn();
    render(
      <AvatarUpload {...BASE_PROPS} currentAvatarUrl="user-1/avatar.jpg" onAvatarChange={onAvatarChange} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-x"));
    });
    expect(onAvatarChange).toHaveBeenCalledWith(null);
  });

  it("[V-P-26] 削除失敗時にエラーメッセージが表示される (回帰)", async () => {
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
    "[V-P-27] accessToken が取得できない場合、deleteProfileImageViaApi を呼ばずエラー表示になる " +
      "(ProfileEditModal の同一パターンの防御コード)",
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
