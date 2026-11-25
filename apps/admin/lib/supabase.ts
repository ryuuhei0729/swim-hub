import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types/supabase-schema";

// service role は RLS を越えて書き込みもできる。このコンソールは読むだけなので、
// GET / HEAD 以外のリクエストは送信前に落とす (rpc も POST なので通らない)。
const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return Promise.reject(
      new Error(`読み取り専用コンソールのため ${method} リクエストは送信しません`),
    );
  }
  return fetch(input, init);
};

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
