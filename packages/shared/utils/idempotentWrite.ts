// =============================================================================
// 冪等な書き込み (再保存しても二重登録しない) のための補助
// =============================================================================
//
// 低速回線では「サーバーでは保存できたが応答が戻らない」ことがある。利用者が再保存すると、
// 同じ内容がもう1件登録されてしまう。新規作成の行 ID をクライアント側で先に決めておけば、
// 2回目の INSERT は主キー重複 (23505 / "<table>_pkey") で失敗するので、
// 「前回すでに作成済み」と判別して更新に切り替えられる。

/** PostgreSQL の unique_violation */
const UNIQUE_VIOLATION = "23505";

function readString(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

/** 一意制約違反 (23505) か */
export function isUniqueViolation(error: unknown): boolean {
  return readString(error, "code") === UNIQUE_VIOLATION;
}

/**
 * 主キーの重複か (= 同じ ID の行がすでにある)。
 * table を指定すると、その表の主キー制約 (`<table>_pkey`) に限定する。
 * 他の一意制約 (例: entries の (competition_id, user_id, style_id)) の違反とは区別する。
 */
export function isPrimaryKeyConflict(error: unknown, table?: string): boolean {
  if (!isUniqueViolation(error)) return false;
  const text = `${readString(error, "message")} ${readString(error, "details")}`;
  return table
    ? text.includes(`"${table}_pkey"`) || text.includes(`${table}_pkey`)
    : text.includes("_pkey");
}

/**
 * ID を指定して作成し、その ID の行がすでにあれば (前回の保存がサーバーには届いていた)
 * 更新に切り替える。どちらの経路でも「その ID の行が現在の内容で1件だけある」状態になる。
 */
export async function createOrUpdateById<T>(params: {
  table: string;
  create: () => Promise<T>;
  update: () => Promise<T>;
}): Promise<T> {
  try {
    return await params.create();
  } catch (error) {
    if (isPrimaryKeyConflict(error, params.table)) {
      return await params.update();
    }
    throw error;
  }
}
