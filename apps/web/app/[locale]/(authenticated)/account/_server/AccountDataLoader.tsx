// =============================================================================
// アカウント画面のデータローダー (プロフィールをサーバー側で先に取る)
// =============================================================================

import React from "react";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import AccountClient from "../_client/AccountClient";

interface UserProfileData {
  id: string;
  name: string;
  gender?: number;
  birthday?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  profile_image_path?: string | null;
  google_calendar_enabled?: boolean;
  google_calendar_sync_practices?: boolean;
  google_calendar_sync_competitions?: boolean;
}

/**
 * ユーザープロフィールを取得
 */
async function getProfile(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerClient>>,
  userId: string,
): Promise<UserProfileData | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, name, gender, birthday, bio, profile_image_path, google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions",
    )
    .eq("id", userId)
    .single();

  if (error) {
    console.error("プロフィール取得エラー:", error);
    return null;
  }

  if (!data) return null;

  // Supabaseから取得したデータの型（null/undefinedを許容）
  const userData = data as {
    id: string;
    name: string;
    gender?: number | null;
    birthday?: string | null;
    bio?: string | null;
    profile_image_path?: string | null;
    google_calendar_enabled?: boolean | null;
    google_calendar_sync_practices?: boolean | null;
    google_calendar_sync_competitions?: boolean | null;
  };

  // UserProfileDataに合わせて変換（null/undefinedを適切に処理）
  return {
    id: userData.id,
    name: userData.name,
    gender: userData.gender ?? undefined,
    birthday: userData.birthday ?? undefined,
    bio: userData.bio ?? undefined,
    avatar_url: userData.profile_image_path ?? undefined,
    profile_image_path: userData.profile_image_path ?? undefined,
    google_calendar_enabled: userData.google_calendar_enabled ?? undefined,
    google_calendar_sync_practices: userData.google_calendar_sync_practices ?? undefined,
    google_calendar_sync_competitions: userData.google_calendar_sync_competitions ?? undefined,
  };
}

/**
 * アカウント画面のプロフィールを取得する Server Component
 */
export default async function AccountDataLoader() {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  if (!user) {
    return <AccountClient initialProfile={null} />;
  }

  // ベストタイム表は 2026-11-07 にダッシュボードへ移したので、ここではプロフィールだけを取る
  const profileResult = await getProfile(supabase, user.id).catch((error) => {
    console.error("プロフィール取得エラー:", error);
    return null;
  });

  return <AccountClient initialProfile={profileResult} />;
}
