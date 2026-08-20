// =============================================================================
// parser/parseGames.ts - /games (大会一覧) レスポンス
// =============================================================================
import type { PoolLength } from "../types";
import { GAME_STATUS_CONFIRMED, toPoolLength } from "./enums";

export interface GameSummary {
  gameCode: string;
  gameName?: string;
  startDate?: string;
  endDate?: string;
  poolLength: PoolLength | null;
  statusCode: number | null;
  contestants: number;
}

export interface GamesListPage {
  games: GameSummary[];
  currentPage: number;
  lastPage: number;
  total: number;
}

export function parseGamesList(response: unknown): GamesListPage {
  const res = response as {
    data?: unknown[];
    meta?: { current_page?: number; last_page?: number; total?: number };
  };
  const rows = Array.isArray(res?.data) ? res.data : [];

  interface GameRow {
    game_code?: unknown;
    game_name?: string;
    start_date?: string;
    end_date?: string;
    waterway?: { code?: number | null; name?: string | null };
    game_status?: { code?: number };
    contestants?: unknown;
  }

  const games: GameSummary[] = rows
    .filter((r): r is GameRow => !!r && typeof r === "object")
    .map((r) => ({
      gameCode: String(r.game_code),
      gameName: r.game_name ?? undefined,
      startDate: r.start_date ?? undefined,
      endDate: r.end_date ?? undefined,
      poolLength: toPoolLength(r.waterway),
      statusCode: r.game_status?.code ?? null,
      contestants: Number(r.contestants ?? 0),
    }));

  return {
    games,
    currentPage: res?.meta?.current_page ?? 1,
    lastPage: res?.meta?.last_page ?? 1,
    total: res?.meta?.total ?? games.length,
  };
}

/**
 * 収集対象の大会だけを残す。
 * 記録確定 (game_status=5) かつ プール長が判定できたものに限る。
 */
export function selectCrawlableGames(games: GameSummary[]): GameSummary[] {
  return games.filter(
    (g) => g.statusCode === GAME_STATUS_CONFIRMED && g.poolLength !== null,
  );
}
