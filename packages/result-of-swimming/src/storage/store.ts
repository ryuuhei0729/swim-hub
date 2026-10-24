// =============================================================================
// storage/store.ts - RawRace の JSONL 保存
// =============================================================================
// JSONL にしているのは、追記が安全 (途中で落ちても既存行が壊れない) で、
// かつ DuckDB が read_json_auto でそのまま読めるため。
// 規模が増えたらこのファイルを Parquet へ変換して集計を SQL 側へ移す。
// =============================================================================
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RawRace } from "../types";

export class RaceStore {
  constructor(private readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  /** 既に保存済みの sourceRaceId (二重登録を防ぐ) */
  existingIds(): Set<string> {
    if (!existsSync(this.file)) return new Set();
    const ids = new Set<string>();
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        ids.add((JSON.parse(line) as RawRace).sourceRaceId);
      } catch {
        // 追記中に落ちた最終行など、壊れた行は無視する
      }
    }
    return ids;
  }

  append(races: RawRace[]): number {
    if (races.length === 0) return 0;
    appendFileSync(this.file, races.map((r) => JSON.stringify(r)).join("\n") + "\n");
    return races.length;
  }

  readAll(): RawRace[] {
    if (!existsSync(this.file)) return [];
    const out: RawRace[] = [];
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as RawRace);
      } catch {
        /* 壊れた行は捨てる */
      }
    }
    return out;
  }

  reset(): void {
    writeFileSync(this.file, "");
  }
}
