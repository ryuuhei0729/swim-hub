// =============================================================================
// crawler/journal.ts - 追記専用の実行ログ (JSONL)
// =============================================================================
// 何を取り、何が失敗し、なぜ止まったかを後から追えるようにする。
// キャッシュが「成功した取得」を表すので、journal の主目的は失敗と抑制の記録。
// =============================================================================
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type JournalEvent =
  | { type: "fetch"; url: string; status: number; ms: number }
  | { type: "cache_hit"; url: string }
  | { type: "retry"; url: string; attempt: number; status: number | null; waitMs: number }
  | { type: "give_up"; url: string; attempts: number; reason: string }
  | { type: "throttle"; remaining: number; waitMs: number }
  | { type: "skip"; url: string; reason: string }
  | { type: "note"; message: string };

export interface Journal {
  write(event: JournalEvent): void;
}

export class FileJournal implements Journal {
  constructor(private readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  write(event: JournalEvent): void {
    appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  }
}

/** テスト・ドライラン用。副作用を持たない */
export const nullJournal: Journal = { write: () => {} };

/** 記録した event を保持する。テストで発火内容を検証するため */
export class MemoryJournal implements Journal {
  readonly events: JournalEvent[] = [];
  write(event: JournalEvent): void {
    this.events.push(event);
  }
}
