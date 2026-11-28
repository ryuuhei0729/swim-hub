"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { CameraIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { validateImageFile } from "@/utils/imageUtils";
import { getSignedImageUrl } from "@/lib/image-url";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// react-easy-cropを含むImageCropModalを動的インポート（バンドルサイズ削減）
const ImageCropModal = dynamic(() => import("./ImageCropModal"), { ssr: false });

interface AvatarUploadProps {
  /** プロフィール画像のバケット内相対パス（"{userId}/{fileName}"）。旧データはフルURLの場合もある */
  currentAvatarUrl?: string | null;
  userName: string;
  /** アップロード/削除成功時に、保存すべき値（バケット内相対パス、削除時はnull）を渡す */
  onAvatarChange: (newAvatarUrl: string | null) => void;
  disabled?: boolean;
  /** アバターサイズの Tailwind クラス (デフォルト: "h-40 w-40") */
  sizeClassName?: string;
  /**
   * 指定すると、トリミングを確定してもアップロードせず、プレビューだけ出してこのコールバックに
   * トリミング後のファイルを渡す (null は選択の取り消し)。アップロード・反映は呼び出し元が
   * 「保存」を押したときに行う (プロフィール編集。mobile の ProfileEditModal と同じ)。
   * 指定しないときは従来どおりトリミング確定時にアップロードし onAvatarChange を呼ぶ。
   */
  onPendingFileChange?: (file: File | null) => void;
}

export default function AvatarUpload({
  currentAvatarUrl,
  userName,
  onAvatarChange,
  disabled = false,
  sizeClassName = "h-40 w-40",
  onPendingFileChange,
}: AvatarUploadProps) {
  const t = useTranslations("mypage.avatarUpload");
  const tUpload = useTranslations("common.upload");
  const tCommon = useTranslations("common");
  const { user } = useAuth();
  const deferUpload = onPendingFileChange !== undefined;
  // 保存前のトリミング済み画像のプレビュー (deferUpload のときだけ使う)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ src: string; fileName: string } | null>(
    null,
  );
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // profile-images は private バケットのため、パスから署名付きURLを取得して表示する
  useEffect(() => {
    let cancelled = false;
    if (!currentAvatarUrl) {
      setResolvedAvatarUrl(null);
      return;
    }
    getSignedImageUrl("profile-images", currentAvatarUrl).then((url) => {
      if (!cancelled) setResolvedAvatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentAvatarUrl]);

  // プレビューの object URL はアンマウント・差し替え時に解放する
  useEffect(() => {
    if (!pendingPreviewUrl) return;
    return () => {
      URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!user) {
      setError(t("loginRequired"));
      return;
    }

    // ファイルバリデーション
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || t("fileInvalid"));
      return;
    }

    setError(null);

    try {
      // ファイルをURLとして読み込み
      const imageSrc = URL.createObjectURL(file);
      const fileExt = file.name.split(".").pop();
      const fileName = `avatar.${fileExt}`;

      // トリミングモーダルを開く
      setSelectedImage({ src: imageSrc, fileName });
      setIsCropModalOpen(true);
    } catch (err) {
      console.error("ファイル読み込みエラー:", err);
      setError(t("fileReadFailed"));
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;

    setIsUploading(true);
    setError(null);

    try {
      // API Route経由で削除
      const response = await fetch("/api/storage/profile", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || t("deleteImageFailed"));
      }

      onAvatarChange(null);
    } catch (err) {
      console.error("画像削除エラー:", err);
      setError(toUserFacingMessage(err, t("deleteImageFailed")));
    } finally {
      setIsUploading(false);
    }
  };

  /** 保存前のトリミング済み画像を取り消す (サーバーには何も送っていないので確認しない) */
  const clearPendingImage = () => {
    setPendingPreviewUrl(null);
    onPendingFileChange?.(null);
  };

  const releaseSelectedImage = () => {
    // メモリリークを防ぐため、生成したオブジェクトURLを解放
    try {
      const imageSrc = selectedImage?.src;
      if (typeof imageSrc === "string" && imageSrc.length > 0) {
        URL.revokeObjectURL(imageSrc);
      }
    } catch {
      // エラーは無視
    }
    setIsCropModalOpen(false);
    setSelectedImage(null);
  };

  const handleCropComplete = async (croppedFile: File) => {
    if (!user) return;

    if (deferUpload) {
      // 「保存」を押すまではアップロードしない。プレビューだけ差し替える
      setError(null);
      setPendingPreviewUrl(URL.createObjectURL(croppedFile));
      onPendingFileChange?.(croppedFile);
      releaseSelectedImage();
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // FormDataを作成
      const formData = new FormData();
      formData.append("file", croppedFile);

      // API Route経由でアップロード
      const response = await fetch("/api/storage/profile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || t("uploadImageFailed"));
      }

      const { path } = (await response.json()) as { path: string };
      onAvatarChange(path);
    } catch (err) {
      console.error("アップロードエラー:", err);
      setError(toUserFacingMessage(err, t("uploadImageFailed")));
    } finally {
      releaseSelectedImage();
      setIsUploading(false);
    }
  };

  const handleCropCancel = () => {
    setIsCropModalOpen(false);
    setSelectedImage(null);
    // メモリリークを防ぐためURLを解放
    if (selectedImage?.src) {
      URL.revokeObjectURL(selectedImage.src);
    }
  };

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  const displayedAvatarUrl = pendingPreviewUrl ?? resolvedAvatarUrl;

  return (
    <div className="relative flex flex-col items-center">
      {/* アバター表示 */}
      <div
        className={`
          relative ${sizeClassName} rounded-full flex items-center justify-center cursor-pointer
          ${disabled || isUploading ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}
          ${displayedAvatarUrl ? "bg-gray-100" : "bg-blue-500"}
          transition-opacity duration-200
        `}
        onClick={handleClick}
      >
        {displayedAvatarUrl ? (
          <img
            src={displayedAvatarUrl}
            alt={t("profileImageAlt")}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="text-4xl md:text-5xl font-bold text-white">
            {userName.charAt(0) || "?"}
          </span>
        )}

        {/* アップロード中インジケーター */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}

        {/* カメラアイコン */}
        {!isUploading && !disabled && (
          <div className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full p-2 shadow-lg">
            <CameraIcon className="h-4 w-4" />
          </div>
        )}

        {/* 削除ボタン (保存前の選択があればその取り消し。保存済みの画像は確認してから削除する) */}
        {(pendingPreviewUrl || currentAvatarUrl) && !isUploading && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (pendingPreviewUrl) {
                clearPendingImage();
              } else {
                setShowRemoveConfirm(true);
              }
            }}
            className="absolute top-1 right-1 z-10 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"
            aria-label={t("deleteAvatarAriaLabel")}
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* エラー表示 */}
      {error && <div className="mt-2 text-sm text-red-600 text-center">{error}</div>}

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* トリミングモーダル */}
      {selectedImage && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          onClose={handleCropCancel}
          imageSrc={selectedImage.src}
          fileName={selectedImage.fileName}
          onCropComplete={handleCropComplete}
        />
      )}

      {/* 削除確認 (mobile の AvatarUpload と同じ) */}
      <ConfirmDialog
        isOpen={showRemoveConfirm}
        onConfirm={() => {
          setShowRemoveConfirm(false);
          void handleRemoveAvatar();
        }}
        onCancel={() => setShowRemoveConfirm(false)}
        title={tUpload("removeConfirmTitle")}
        message={tUpload("avatarRemoveConfirm")}
        confirmLabel={tUpload("removeChoice")}
        cancelLabel={tCommon("cancel")}
        variant="danger"
        initialFocus="cancel"
      />
    </div>
  );
}
