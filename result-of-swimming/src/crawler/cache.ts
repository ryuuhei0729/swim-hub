// =============================================================================
// crawler/cache.ts - URL 単位の内容アドレス指定キャッシュ
// =============================================================================
// このキャッシュが「取得済み集合」そのものを兼ねる。
// ファイルが存在する = 取得済み なので、別途 frontier DB を持たなくても
// 途中再開ができ、同じ URL を二度取らないことが構造的に保証される。
//
// (当初 SQLite で frontier を持つ設計だったが、Node 20 に node:sqlite が無く、
//  かつ「訪問済み集合」はこのキャッシュで既に表現できるため不要と判断した。
//  失敗の記録だけ journal.ts が担う。)
// =============================================================================
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export interface CachedResponse {
  url: string;
  status: number;
  fetchedAt: string;
  body: string;
}

export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export class ResponseCache {
  constructor(private readonly root: string) {}

  private pathFor(url: string): string {
    const key = cacheKey(url);
    // 1ディレクトリにファイルが溢れないよう先頭2文字で分割する
    return path.join(this.root, key.slice(0, 2), `${key}.json.gz`);
  }

  has(url: string): boolean {
    return existsSync(this.pathFor(url));
  }

  get(url: string): CachedResponse | null {
    const file = this.pathFor(url);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as CachedResponse;
    } catch {
      return null; // 壊れたキャッシュは未取得として扱う
    }
  }

  set(entry: CachedResponse): void {
    const file = this.pathFor(entry.url);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(entry), "utf8")));
  }
}
