// =============================================================================
// crawler/httpClient.ts - サイトに配慮した HTTP クライアント
// =============================================================================
// 方針:
//   - 直列 (concurrency 1)。スループットではなく相手側の負荷を優先する
//   - リクエスト間に最低間隔を空ける
//   - API が返す x-ratelimit-remaining を読み、閾値を割ったら待つ
//   - 429 / 5xx は指数バックオフ、リトライ回数に上限
//   - 404 等の恒久的エラーはリトライしない
//   - 取得済み URL はキャッシュから返し、二度取らない
//   - UA は偽装しない (headless 判定の回避などは行わない)
// =============================================================================
import type { ResponseCache } from "./cache";
import { nullJournal, type Journal } from "./journal";

export interface HttpResult {
  url: string;
  status: number;
  body: string;
  fromCache: boolean;
}

export interface PoliteClientOptions {
  cache?: ResponseCache;
  journal?: Journal;
  /** リクエスト間の最低間隔 */
  minIntervalMs?: number;
  /** 429/5xx のリトライ上限 */
  maxRetries?: number;
  /** x-ratelimit-remaining がこれを下回ったら待つ */
  rateLimitFloor?: number;
  /** 残量が floor を割ったときの待機時間 */
  throttleWaitMs?: number;
  /** バックオフの基準値 */
  backoffBaseMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowImpl?: () => number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PoliteHttpClient {
  private readonly cache?: ResponseCache;
  private readonly journal: Journal;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly rateLimitFloor: number;
  private readonly throttleWaitMs: number;
  private readonly backoffBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private lastRequestAt = 0;
  /** 直近に観測した残クォータ */
  private remaining: number | null = null;

  constructor(options: PoliteClientOptions = {}) {
    this.cache = options.cache;
    this.journal = options.journal ?? nullJournal;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 3;
    this.rateLimitFloor = options.rateLimitFloor ?? 200;
    this.throttleWaitMs = options.throttleWaitMs ?? 60_000;
    this.backoffBaseMs = options.backoffBaseMs ?? 2000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleepImpl ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = options.nowImpl ?? Date.now;
  }

  get remainingQuota(): number | null {
    return this.remaining;
  }

  async get(url: string): Promise<HttpResult> {
    const cached = this.cache?.get(url);
    if (cached) {
      this.journal.write({ type: "cache_hit", url });
      return { url, status: cached.status, body: cached.body, fromCache: true };
    }

    let lastStatus: number | null = null;
    let lastError = "";

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      await this.respectRateLimit();
      await this.respectMinInterval();

      const startedAt = this.now();
      let status: number | null = null;
      let body = "";

      try {
        const res = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
        status = res.status;
        body = await res.text();
        this.observeRateLimitHeaders(res);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }

      this.lastRequestAt = this.now();

      if (status !== null) {
        this.journal.write({ type: "fetch", url, status, ms: this.lastRequestAt - startedAt });
      }
      lastStatus = status;

      // 成功
      if (status !== null && status >= 200 && status < 300) {
        this.cache?.set({ url, status, fetchedAt: new Date().toISOString(), body });
        return { url, status, body, fromCache: false };
      }

      // 恒久的エラーはリトライしない
      if (status !== null && !RETRYABLE_STATUS.has(status)) {
        this.journal.write({ type: "give_up", url, attempts: attempt, reason: `status ${status}` });
        return { url, status, body, fromCache: false };
      }

      if (attempt <= this.maxRetries) {
        const waitMs = this.backoffBaseMs * 2 ** (attempt - 1);
        this.journal.write({ type: "retry", url, attempt, status, waitMs });
        await this.sleep(waitMs);
      }
    }

    this.journal.write({
      type: "give_up",
      url,
      attempts: this.maxRetries + 1,
      reason: lastStatus !== null ? `status ${lastStatus}` : lastError || "network error",
    });
    return { url, status: lastStatus ?? 0, body: "", fromCache: false };
  }

  private observeRateLimitHeaders(res: Response): void {
    const raw = res.headers.get("x-ratelimit-remaining");
    if (raw === null) return;
    const value = Number(raw);
    if (Number.isFinite(value)) this.remaining = value;
  }

  private async respectRateLimit(): Promise<void> {
    if (this.remaining === null || this.remaining > this.rateLimitFloor) return;
    this.journal.write({ type: "throttle", remaining: this.remaining, waitMs: this.throttleWaitMs });
    await this.sleep(this.throttleWaitMs);
    // 待った後は未知として扱い、次のレスポンスで再観測する
    this.remaining = null;
  }

  private async respectMinInterval(): Promise<void> {
    if (this.lastRequestAt === 0) return;
    const elapsed = this.now() - this.lastRequestAt;
    const wait = this.minIntervalMs - elapsed;
    if (wait > 0) await this.sleep(wait);
  }
}
