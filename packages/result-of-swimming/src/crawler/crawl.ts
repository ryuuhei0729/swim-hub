// =============================================================================
// crawler/crawl.ts - 大会一覧 -> 種目 -> 組 -> 結果 の順に辿る
// =============================================================================
// 取得順序を「浅い順」にしているのは、途中で止めても
// 「一部の大会が完全に取れている」状態になるため (中途半端な断片が残りにくい)。
// 途中再開はキャッシュが担うので、ここに状態管理は持たない。
// =============================================================================
import { aggregateRequestCount } from "./stats";
import type { PoliteHttpClient } from "./httpClient";
import { nullJournal, type Journal } from "./journal";
import { parseGamesList, selectCrawlableGames, type GameSummary } from "../parser/parseGames";
import { GAME_STATUS_CONFIRMED } from "../parser/enums";
import { flattenRaceTree, type RaceTarget } from "../parser/parseRaces";
import { selectHeats } from "../parser/parseHeats";
import { API_BASE, parseResults, type ResultsContext } from "../parser/parseResults";
import type { RawRace } from "../types";

export const DEFAULT_CONSECUTIVE_BLOCK_LIMIT = 5;

export interface CrawlOptions {
  client: PoliteHttpClient;
  journal?: Journal;
  year: number;
  /** 取得する大会数の上限 */
  gameLimit?: number;
  /** 結果リクエスト数の上限 (段階的に増やすための安全弁) */
  resultRequestLimit?: number;
  /** 403 がこの回数連続したらブロックと判断して中断する */
  consecutiveBlockLimit?: number;
  /** 1件ずつ受け取って保存する。戻り値は新規に保存された件数 */
  onRaces?: (races: RawRace[]) => number;
  onProgress?: (message: string) => void;
}

export interface CrawlSummary {
  gamesSeen: number;
  gamesCrawled: number;
  resultRequests: number;
  racesParsed: number;
  racesStored: number;
  aggregateHeatsUsed: number;
  individualHeatsUsed: number;
  quotaRemaining: number | null;
  /** 2xx 以外で終わったリクエスト数 */
  fetchFailures: number;
  /** 403 連続でブロック判定して中断したか */
  blocked: boolean;
}

function json(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** (gender, style, distance, class) 単位に畳んで組一覧の取得を1回にする */
function groupTargets(targets: RaceTarget[]): Map<string, RaceTarget[]> {
  const groups = new Map<string, RaceTarget[]>();
  for (const t of targets) {
    const key = [t.genderCode, t.swimmingStyleCode, t.distanceCode, t.classCode].join("|");
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

export async function crawl(options: CrawlOptions): Promise<CrawlSummary> {
  const { client, year } = options;
  const journal = options.journal ?? nullJournal;
  const progress = options.onProgress ?? (() => {});
  const summary: CrawlSummary = {
    gamesSeen: 0,
    gamesCrawled: 0,
    resultRequests: 0,
    racesParsed: 0,
    racesStored: 0,
    aggregateHeatsUsed: 0,
    individualHeatsUsed: 0,
    quotaRemaining: null,
    fetchFailures: 0,
    blocked: false,
  };

  const gameLimit = options.gameLimit ?? Number.POSITIVE_INFINITY;
  const resultLimit = options.resultRequestLimit ?? Number.POSITIVE_INFINITY;
  const blockThreshold = options.consecutiveBlockLimit ?? DEFAULT_CONSECUTIVE_BLOCK_LIMIT;

  let consecutiveForbidden = 0;

  /**
   * 403 が連続したらブロックされたと判断して打ち切る。
   * 気づかずに叩き続けるのは相手にも無駄なので、早めに手を止める。
   * 戻り値 true = 中断すべき
   */
  function noteBlocked(status: number): boolean {
    if (status === 403) {
      consecutiveForbidden++;
      if (consecutiveForbidden >= blockThreshold) {
        summary.blocked = true;
        journal.write({
          type: "note",
          message: `403 が ${consecutiveForbidden} 回連続。アクセスがブロックされたと判断して中断する`,
        });
        return true;
      }
    } else {
      consecutiveForbidden = 0;
    }
    return false;
  }

  const games: GameSummary[] = [];
  let page = 1;
  let lastPage = 1;

  // --- 大会一覧 ---
  do {
    // game_status=5 (記録確定) をサーバー側で絞る。
    // クライアント側で捨てると開催前の大会を延々ページングする分だけ無駄に叩く。
    const res = await client.get(
      `${API_BASE}/games?year=${year}&game_status=${GAME_STATUS_CONFIRMED}&page=${page}`,
    );
    const parsed = parseGamesList(json(res.body));
    lastPage = parsed.lastPage;
    summary.gamesSeen += parsed.games.length;
    games.push(...selectCrawlableGames(parsed.games));
    progress(`大会一覧 page ${page}/${lastPage}: 収集対象 ${games.length} 件`);
    page++;
  } while (page <= lastPage && games.length < gameLimit);

  const targetGames = games.slice(0, Number.isFinite(gameLimit) ? gameLimit : games.length);

  // --- 大会ごと ---
  for (const game of targetGames) {
    if (summary.resultRequests >= resultLimit) break;
    if (game.poolLength === null) continue;

    const racesRes = await client.get(`${API_BASE}/games/${game.gameCode}/races`);

    // 取得失敗と「本当に個人種目が無い」を混同しない。
    // 混同すると 403 でブロックされた大会が「個人種目なし」と記録され、
    // 後から原因を追えなくなる (実際に一度これで誤診した)。
    if (racesRes.status < 200 || racesRes.status >= 300) {
      summary.fetchFailures++;
      journal.write({
        type: "skip",
        url: racesRes.url,
        reason: `種目ツリーの取得に失敗 (status ${racesRes.status})`,
      });
      if (noteBlocked(racesRes.status)) break;
      continue;
    }

    const targets = flattenRaceTree(json(racesRes.body), game.gameCode);
    if (targets.length === 0) {
      journal.write({ type: "skip", url: racesRes.url, reason: "個人種目なし" });
      continue;
    }
    summary.gamesCrawled++;
    progress(`大会 ${game.gameCode} (${game.gameName ?? ""}): 種目 ${targets.length} 件`);

    for (const [, group] of groupTargets(targets)) {
      if (summary.resultRequests >= resultLimit) break;
      const sample = group[0];
      if (!sample) continue; // groupTargets (59-68行目) は各キーに必ず1件以上 push してから
                              // Map に格納するため理論上ここに来ないが、Map の値配列を
                              // 添字で取り出しているため防御的にガードする

      const heatsUrl =
        `${API_BASE}/games/${game.gameCode}` +
        `/heats/genders/${sample.genderCode}` +
        `/swimming_styles/${sample.swimmingStyleCode}` +
        `/distances/${sample.distanceCode}` +
        `/classes/${sample.classCode}`;
      const heatsRes = await client.get(heatsUrl);
      const selections = selectHeats(json(heatsRes.body));

      for (const selection of selections) {
        if (summary.resultRequests >= resultLimit) break;
        // 種目ツリー側にある同じ division の情報 (round 名) を使う
        const target = group.find((t) => t.raceDivisionCode === selection.raceDivisionCode) ?? sample;
        if (selection.usedAggregate) summary.aggregateHeatsUsed++;
        else summary.individualHeatsUsed += selection.heats.length;

        for (const heat of selection.heats) {
          if (summary.resultRequests >= resultLimit) break;

          const ctx: ResultsContext = {
            gameCode: game.gameCode,
            genderCode: target.genderCode,
            swimmingStyleCode: target.swimmingStyleCode,
            distanceCode: target.distanceCode,
            classCode: target.classCode,
            raceDivisionCode: selection.raceDivisionCode,
            heat,
            distance: target.distance,
            poolLength: game.poolLength,
            roundName: selection.roundName ?? target.roundName,
            competitionName: game.gameName,
            competitionDate: target.raceDate ?? game.startDate,
          };

          const res = await client.get(
            `${API_BASE}/games/${ctx.gameCode}/results/genders/${ctx.genderCode}` +
              `/swimming_styles/${ctx.swimmingStyleCode}/distances/${ctx.distanceCode}` +
              `/classes/${ctx.classCode}/race_divisions/${ctx.raceDivisionCode}/heats/${ctx.heat}`,
          );
          summary.resultRequests++;

          if (res.status < 200 || res.status >= 300) {
            summary.fetchFailures++;
            if (noteBlocked(res.status)) return finish();
            continue;
          }
          consecutiveForbidden = 0;

          const races = parseResults(json(res.body), ctx);
          summary.racesParsed += races.length;
          summary.racesStored += options.onRaces?.(races) ?? 0;
        }
      }
    }
  }

  return finish();

  function finish(): CrawlSummary {
    summary.quotaRemaining = client.remainingQuota;
    journal.write({ type: "note", message: `crawl 終了: ${JSON.stringify(summary)}` });
    return summary;
  }
}

export { aggregateRequestCount };
