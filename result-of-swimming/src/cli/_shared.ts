// =============================================================================
// cli/_shared.ts - CLI 共通の下ごしらえ
// =============================================================================
import { CRAWL_DEFAULTS, paths } from "../config";
import { ResponseCache } from "../crawler/cache";
import { FileJournal } from "../crawler/journal";
import { PoliteHttpClient } from "../crawler/httpClient";
import { RaceStore } from "../storage/store";

export function makeClient() {
  const { consecutiveBlockLimit: _crawlOnly, ...clientDefaults } = CRAWL_DEFAULTS;
  return new PoliteHttpClient({
    cache: new ResponseCache(paths.cache),
    journal: new FileJournal(paths.journal),
    ...clientDefaults,
  });
}

export const store = () => new RaceStore(paths.races);
export const journal = () => new FileJournal(paths.journal);
export const log = (msg: string) => console.log(msg);
