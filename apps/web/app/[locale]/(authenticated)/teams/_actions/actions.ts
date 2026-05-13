"use server";

import { createAuthenticatedServerClient } from "@/lib/supabase-server-auth";
import { TeamMembersAPI } from "@apps/shared/api/teams/members";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";

async function getActionsT() {
  const locale = await getLocale();
  return getTranslations({ locale, namespace: "teams.actions" });
}

/**
 * Server Action内で認証チェックを行うヘルパー（defense-in-depth）
 */
async function getAuthenticatedUser() {
  const supabase = await createAuthenticatedServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

/**
 * チームに参加するServer Action
 */
export async function joinTeam(inviteCode: string) {
  const { supabase } = await getAuthenticatedUser();
  const api = new TeamMembersAPI(supabase);

  try {
    const membership = await api.join(inviteCode);

    after(() => {
      revalidatePath("/teams");
    });

    return { success: true, membership };
  } catch (error) {
    const t = await getActionsT();
    const message = error instanceof Error ? error.message : t("joinFailed");
    return { success: false, error: message };
  }
}

/**
 * 非アクティブなメンバーシップを再アクティブ化するServer Action
 */
export async function reactivateTeamMembership(membershipId: string, joinedAt: string) {
  const { supabase } = await getAuthenticatedUser();
  const api = new TeamMembersAPI(supabase);

  try {
    const membership = await api.reactivateMembership(membershipId, joinedAt);

    after(() => {
      revalidatePath("/teams");
    });

    return { success: true, membership };
  } catch (error) {
    const t = await getActionsT();
    const message = error instanceof Error ? error.message : t("reactivateFailed");
    return { success: false, error: message };
  }
}

/**
 * メンバーシップを承認するServer Action
 */
export async function approveMembership(membershipId: string, teamId: string) {
  const { supabase } = await getAuthenticatedUser();
  const api = new TeamMembersAPI(supabase);

  try {
    const membership = await api.approve(membershipId);

    after(() => {
      revalidatePath("/teams");
      revalidatePath(`/teams-admin/${teamId}`);
    });

    return { success: true, membership };
  } catch (error) {
    const t = await getActionsT();
    const message = error instanceof Error ? error.message : t("approveFailed");
    return { success: false, error: message };
  }
}

/**
 * メンバーシップを拒否するServer Action
 */
export async function rejectMembership(membershipId: string, teamId: string) {
  const { supabase } = await getAuthenticatedUser();
  const api = new TeamMembersAPI(supabase);

  try {
    const membership = await api.reject(membershipId);

    after(() => {
      revalidatePath("/teams");
      revalidatePath(`/teams-admin/${teamId}`);
    });

    return { success: true, membership };
  } catch (error) {
    const t = await getActionsT();
    const message = error instanceof Error ? error.message : t("rejectFailed");
    return { success: false, error: message };
  }
}
