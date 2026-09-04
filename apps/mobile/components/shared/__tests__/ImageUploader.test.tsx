/**
 * ImageUploader.test.tsx
 *
 * Sprint Contract (Android READ_MEDIA_* 権限撤去 → システム Photo Picker 移行) 検証観点:
 *
 * 背景: components/profile/AvatarUpload.tsx と同様、components/shared/ImageUploader.tsx も
 * Android 分岐で権限リクエストなし・非legacy Photo Picker を使うよう変更された。
 *
 * Reviewer 指摘 Critical (修正後の再検証):
 *   非legacy Photo Picker は元フォーマット (PNG/WEBP/HEIC 等) のまま asset を返すため、
 *   `getFileExtensionFromAsset` (asset.type を MIME 扱いする関数。実際の asset.type は
 *   `"image"|"video"` というメディア種別であり MIME ではない) を使って拡張子を決め打ちすると、
 *   実バイトと拡張子/Content-Type が矛盾する (例: PNG のバイトなのに "jpg" と判定される等)。
 *   修正後は Android 分岐で `ImageManipulator.manipulate(asset.uri).renderAsync().saveAsync({format:
 *   SaveFormat.JPEG, ...})` により選択画像を常に JPEG に再エンコードしてから拡張子を "jpg" 固定にする
 *   (asset.type/mimeType には一切依存しない)。iOS (legacy:true) は従来どおり
 *   `getFileExtensionFromAsset` を使い続ける。
 *
 * トートロジー防止メモ:
 *   - HEIC 系のテストは実 SDK の asset 形状 (type: "image"|"video"、実MIMEは mimeType フィールド)
 *     でモックする。旧テストの `type: "image/heic"` は実装の誤解 (asset.type を MIME 扱いする
 *     バグ) をそのままテストに転写していたトートロジーであり、Reviewer 指摘を受けて是正した。
 *   - Android 分岐が asset.type/mimeType の値に一切左右されず常に "jpg" になることを、
 *     PNG 相当・HEIC 相当など複数の入力形状で確認し、実装の分岐ロジックではなく
 *     「常に JPEG 再エンコードする」という Sprint Contract の仕様を検証する。
 *   - 内部 state (newFiles 等) を直接検査せず、ImagePicker / ImageManipulator のモック呼び出し
 *     引数と onImagesChange コールバックの引数で外部から観察する。
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  alertFn: vi.fn(),
  manipulate: vi.fn(),
  renderAsync: vi.fn(),
  saveAsync: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
}));

vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Platform: { ...original.Platform, OS: "android" as const },
    Alert: { alert: mocks.alertFn },
  };
});

import { ImageUploader } from "../ImageUploader";
import { SaveFormat } from "expo-image-manipulator";

async function setPlatform(os: "android" | "ios") {
  const RN = await import("react-native");
  (RN.Platform as unknown as { OS: string }).OS = os;
}

/** ImageManipulator.manipulate(...).renderAsync().saveAsync() チェーンをセットアップする (クロップなし) */
function setupManipulatorChain(saveResult: { uri: string; base64?: string }) {
  mocks.manipulate.mockReturnValue({ renderAsync: mocks.renderAsync });
  mocks.renderAsync.mockResolvedValue({ saveAsync: mocks.saveAsync });
  mocks.saveAsync.mockResolvedValue(saveResult);
}

const BASE_PROPS = {
  onImagesChange: vi.fn(),
};

describe("ImageUploader — Android Photo Picker (権限撤去・JPEG再エンコード)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPlatform("android");
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    setupManipulatorChain({ uri: "file:///reencoded.jpg", base64: "JPEGBASE64" });
  });

  it("追加ボタン押下で requestMediaLibraryPermissionsAsync は呼ばれない (Photo Picker は権限不要)", async () => {
    render(<ImageUploader {...BASE_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(mocks.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mocks.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it(
    "launchImageLibraryAsync が mediaTypes:[\"images\"], allowsEditing:false, base64:false で呼ばれ、" +
      "legacy は渡されない (非legacy Picker・base64取得はJPEG再エンコード後に行う)",
    async () => {
      render(<ImageUploader {...BASE_PROPS} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      const options = mocks.launchImageLibraryAsync.mock.calls[0]![0]; // fireEvent.click で必ず1回呼ばれる設計のため必ず存在
      expect(options.mediaTypes).toEqual(["images"]);
      expect(options.allowsEditing).toBe(false);
      expect(options.legacy).toBeUndefined();
      expect(options.base64).toBe(false);
    },
  );

  it(
    "選択後、ImageManipulator.manipulate(asset.uri).renderAsync().saveAsync() が " +
      "format:SaveFormat.JPEG, base64:true で呼ばれ、onImagesChange は JPEG 再エンコード結果" +
      "(jpeg.uri / jpeg.base64 / fileExtension:\"jpg\") で呼ばれる",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.png", type: "image", mimeType: "image/png" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      expect(mocks.manipulate).toHaveBeenCalledWith("file:///photo.png");
      expect(mocks.saveAsync).toHaveBeenCalledWith(
        expect.objectContaining({ format: SaveFormat.JPEG, base64: true }),
      );
      expect(onImagesChange).toHaveBeenCalledWith(
        [{ uri: "file:///reencoded.jpg", base64: "JPEGBASE64", fileExtension: "jpg" }],
        [],
      );
    },
  );

  it(
    "PNG 相当の asset (type:\"image\", mimeType:\"image/png\") を選択しても、実バイトは JPEG 再エンコード" +
      "され、拡張子は \"jpg\" で一貫する (Reviewer Critical: 実MIMEに依存した拡張子決め打ちの再発防止)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.png", type: "image", mimeType: "image/png" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      // onImagesChange は直前の fireEvent.click で必ず1回呼ばれる設計のため calls[0]/[0] は必ず存在
      const newFiles = onImagesChange.mock.calls[0]![0];
      expect(newFiles[0].fileExtension).toBe("jpg");
      expect(newFiles[0].base64).toBe("JPEGBASE64"); // saveAsync (JPEG化後) の出力を使っている
    },
  );

  it(
    "HEIC 相当の asset (実 SDK 形状: type:\"image\", mimeType:\"image/heic\"。asset.type は" +
      "メディア種別でありMIMEではない) を選択しても、getFileExtensionFromAsset を経由せず " +
      "JPEG 再エンコードにより \"jpg\" になる",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.heic", type: "image", mimeType: "image/heic" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      expect(onImagesChange).toHaveBeenCalledWith(
        [{ uri: "file:///reencoded.jpg", base64: "JPEGBASE64", fileExtension: "jpg" }],
        [],
      );
    },
  );

  it(
    "asset.mimeType が undefined (取得不能) でも、JPEG 再エンコードのため拡張子判定に影響しない",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.unknown", type: "image" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      expect(onImagesChange).toHaveBeenCalledWith(
        [expect.objectContaining({ fileExtension: "jpg" })],
        [],
      );
    },
  );

  it("再エンコード後 base64 が取得できない場合エラー表示され、onImagesChange は呼ばれない", async () => {
    setupManipulatorChain({ uri: "file:///reencoded.jpg", base64: undefined });
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg", type: "image", mimeType: "image/jpeg" }],
    });
    const onImagesChange = vi.fn();
    render(<ImageUploader onImagesChange={onImagesChange} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(onImagesChange).not.toHaveBeenCalled();
    expect(screen.getByText("画像データの取得に失敗しました")).toBeTruthy();
  });

  it(
    "再エンコード後の base64 概算サイズが10MBを超える場合エラー表示され、onImagesChange は" +
      "呼ばれない (サイズ判定は再エンコード後の jpeg.base64 長基準)",
    async () => {
      const oversizedBase64 = "a".repeat(14_000_000); // *0.75 > 10MB
      setupManipulatorChain({ uri: "file:///reencoded.jpg", base64: oversizedBase64 });
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.jpg", type: "image", mimeType: "image/jpeg" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      expect(onImagesChange).not.toHaveBeenCalled();
      expect(screen.getByText((content) => content.includes("10MB"))).toBeTruthy();
    },
  );

  it("キャンセル時は ImageManipulator が呼ばれず onImagesChange も呼ばれない (回帰)", async () => {
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] });
    const onImagesChange = vi.fn();
    render(<ImageUploader onImagesChange={onImagesChange} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(mocks.manipulate).not.toHaveBeenCalled();
    expect(onImagesChange).not.toHaveBeenCalled();
  });

  it("最大枚数 (maxImages) に達している場合は追加ボタンが表示されない", async () => {
    render(
      <ImageUploader
        {...BASE_PROPS}
        maxImages={1}
        existingImages={[{ id: "img-1", url: "https://example.com/1.jpg" }]}
      />,
    );
    expect(screen.queryByText("追加")).toBeNull();
  });
});

describe("ImageUploader — iOS legacy Picker (回帰: getFileExtensionFromAsset 経由を維持)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setPlatform("ios");
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
  });

  afterEach(async () => {
    await setPlatform("android");
  });

  it("iOS では権限をリクエストし、denied のとき launchImageLibraryAsync は呼ばれない", async () => {
    mocks.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    render(<ImageUploader {...BASE_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(mocks.alertFn).toHaveBeenCalled();
    expect(mocks.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("iOS では legacy:true で呼ばれ、ImageManipulator は経由しない", async () => {
    render(<ImageUploader {...BASE_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    const options = mocks.launchImageLibraryAsync.mock.calls[0]![0]; // fireEvent.click で必ず1回呼ばれる設計のため必ず存在
    expect(options.legacy).toBe(true);
    expect(options.allowsEditing).toBe(false);
    expect(mocks.manipulate).not.toHaveBeenCalled();
  });

  it(
    "選択後、asset.type (MIMEタイプ) を使った拡張子判定で onImagesChange が呼ばれる " +
      "(iOS の getFileExtensionFromAsset 経路は回帰させない)",
    async () => {
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///photo.png", base64: "BASE64DATA", type: "image/png" }],
      });
      const onImagesChange = vi.fn();
      render(<ImageUploader onImagesChange={onImagesChange} />);
      await act(async () => {
        fireEvent.click(screen.getByText("追加"));
      });
      expect(onImagesChange).toHaveBeenCalledWith(
        [{ uri: "file:///photo.png", base64: "BASE64DATA", fileExtension: "png" }],
        [],
      );
    },
  );

  it("base64 が取得できない場合エラー表示され、onImagesChange は呼ばれない (回帰)", async () => {
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///photo.jpg", base64: null, type: "image/jpeg" }],
    });
    const onImagesChange = vi.fn();
    render(<ImageUploader onImagesChange={onImagesChange} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(onImagesChange).not.toHaveBeenCalled();
  });

  it("asset.fileSize が10MBを超える場合エラー表示され、onImagesChange は呼ばれない (回帰)", async () => {
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          base64: "BASE64DATA",
          type: "image/jpeg",
          fileSize: 11 * 1024 * 1024,
        },
      ],
    });
    const onImagesChange = vi.fn();
    render(<ImageUploader onImagesChange={onImagesChange} />);
    await act(async () => {
      fireEvent.click(screen.getByText("追加"));
    });
    expect(onImagesChange).not.toHaveBeenCalled();
  });
});
