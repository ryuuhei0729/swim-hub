import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types/supabase-schema";
import { readOnlyFetch } from "./read-only-fetch";

let client: SupabaseClient<Database> | undefined;

export function getReadOnlyClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が読めません。`pnpm admin` か `pnpm admin:local` で起動してください",
    );
  }

  client = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: readOnlyFetch },
  });
  return client;
}

export function getConnectionInfo(): { environment: string; host: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let host = "未設定";
  if (url) {
    try {
      host = new URL(url).host;
    } catch {
      host = "不正な URL";
    }
  }
  return { environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? "unknown", host };
}
