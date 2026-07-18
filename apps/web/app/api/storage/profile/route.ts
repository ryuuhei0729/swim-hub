/**
 * プロフィール画像のアップロード/削除 API
 * R2優先、Supabase Storageフォールバック
 */
import { authenticateApiRequest } from "@/lib/auth-api";
import { isR2Enabled, uploadToR2, listR2Objects, deleteMultipleFromR2 } from "@/lib/r2";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/**
 * POST: プロフィール画像をアップロード
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });
    }

    // バリデーション
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "JPEG、PNG、WebPのみ対応しています" }, { status: 400 });
    }

    // ファイル名を生成（セキュリティ対策済み）
    // パス文字を除去してファイル名のみ取得
    const sanitizedName = file.name.replace(/^.*[\\/]/, "");
    // 拡張子を抽出し、許可リストで検証
    const rawExt = sanitizedName.split(".").pop()?.toLowerCase() || "";
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "webp";
    // 衝突耐性のあるUUIDを使用
    const fileName = `${randomUUID()}.${ext}`;
    // バケット内相対パス（DBに保存する形式。practice-images/competition-images と同じ規約:
    // "{userId}/{fileName}"。R2キー / Supabaseバケット内パスの両方でこの相対パスをそのまま用いる）
    const relativePath = `${user.id}/${fileName}`;

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      const key = `profile-images/${relativePath}`;

      // 削除対象の旧ファイルをアップロード前にキャプチャ（新旧両方のプレフィックスを対象・並行取得）。
      // 新ファイル名はUUIDで衝突しないため、後で削除してもこの後アップロードする新ファイルを巻き込まない
      const [newPrefixFiles, legacyPrefixFiles] = await Promise.all([
        listR2Objects(`profile-images/${user.id}/`),
        listR2Objects(`profiles/avatars/${user.id}/`),
      ]);
      const existingFilesToDelete = [...newPrefixFiles, ...legacyPrefixFiles];

      // 新しい画像をアップロード（private バケットのため公開URLは使わない）
      // ここで失敗した場合は旧画像に一切触れずエラーを返す
      const buffer = Buffer.from(await file.arrayBuffer());
      await uploadToR2(buffer, key, file.type);

      // アップロード成功後に旧ファイルを削除。失敗は非致命
      // （次回アップロード時のキャプチャに残骸が含まれ自己修復されるため、レスポンスには影響させない）
      if (existingFilesToDelete.length > 0) {
        await deleteMultipleFromR2(existingFilesToDelete).catch((cleanupError) => {
          console.error("旧プロフィール画像(R2)の削除に失敗しました:", cleanupError);
        });
      }

      return NextResponse.json({ path: relativePath });
    }

    // フォールバック: Supabase Storage
    const userFolderPath = user.id;

    // 削除対象の旧ファイルをアップロード前にキャプチャ
    // （新ファイル名はUUIDで衝突しないため、後で削除してもこの後アップロードする新ファイルを巻き込まない）
    const { data: files } = await supabase.storage.from("profile-images").list(userFolderPath);

    // 新しい画像をアップロード。ここで失敗した場合は旧画像に一切触れずエラーを返す
    const { error: uploadError } = await supabase.storage
      .from("profile-images")
      .upload(relativePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Storageアップロードエラー:", uploadError);
      return NextResponse.json({ error: "画像のアップロードに失敗しました" }, { status: 500 });
    }

    // アップロード成功後に旧ファイルを削除。失敗は非致命
    // （次回アップロード時のキャプチャに残骸が含まれ自己修復されるため、レスポンスには影響させない）
    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${userFolderPath}/${f.name}`);
      try {
        const { error: removeError } = await supabase.storage
          .from("profile-images")
          .remove(filePaths);
        if (removeError) throw removeError;
      } catch (cleanupError) {
        console.error("旧プロフィール画像(Supabase Storage)の削除に失敗しました:", cleanupError);
      }
    }

    return NextResponse.json({ path: relativePath });
  } catch (error) {
    console.error("プロフィール画像アップロードエラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}

/**
 * DELETE: プロフィール画像を削除
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const { user, supabase } = auth;

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      // 新旧両方のプレフィックスからファイルを削除（並行取得）
      const [newPrefixFiles, legacyPrefixFiles] = await Promise.all([
        listR2Objects(`profile-images/${user.id}/`),
        listR2Objects(`profiles/avatars/${user.id}/`),
      ]);
      const allExistingFiles = [...newPrefixFiles, ...legacyPrefixFiles];
      if (allExistingFiles.length > 0) {
        await deleteMultipleFromR2(allExistingFiles);
      }
      return NextResponse.json({ success: true });
    }

    // フォールバック: Supabase Storage
    const userFolderPath = user.id;

    const { data: files } = await supabase.storage.from("profile-images").list(userFolderPath);

    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${userFolderPath}/${f.name}`);
      await supabase.storage.from("profile-images").remove(filePaths);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("プロフィール画像削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
