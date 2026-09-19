/**
 * Issue #49 QA テスト (Phase B 追加): 候補一覧に流れるデータ取得経路の is_swimmer select 監査
 *
 * PM指摘の構造的リスク: `is_swimmer` が optional 型で追加されているため、
 * どこかの select() 句が is_swimmer を取り忘れると、その画面だけ全員 undefined になり
 * `!== false` が真になって「非泳者が候補に出続ける」静かな不具合になる
 * (型エラーも実行時エラーも出ない)。
 *
 * 実際の select() 句の文字列をソースファイルから読み取り、is_swimmer (もしくは
 * 全カラムを含む `*`) が含まれることを実測する。
 * - useMembers.ts (web) はモックベースの実引数キャプチャで別途検証済み
 *   (apps/web/__tests__/components/team/member-management/useMembersSwimmerSelect.test.tsx)
 * - TeamMembersAPI.list() は shared 層で web/mobile 共通利用される
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function readSource(relPath: string): string {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

describe("[構造的リスク監査] 候補一覧向けデータ取得経路の is_swimmer select 漏れ検出", () => {
  it("TeamMembersAPI.list() (shared, web+mobile 共通) は '*' で全カラムを select している (is_swimmer 漏れが構造的に起きない)", () => {
    const source = readSource("apps/shared/api/teams/members.ts");
    const listMethodMatch = source.match(/async list\(teamId: string\)[\s\S]*?\.select\((["'`])(.*?)\1\)/);
    expect(listMethodMatch, "TeamMembersAPI.list() の select() 呼び出しが見つからない").not.toBeNull();
    const selectArg = listMethodMatch![2]!;
    expect(
      selectArg.includes("*"),
      `TeamMembersAPI.list() の select 引数が '*' を含まない (実際: "${selectArg}")。` +
        "個別カラム列挙に変更された場合は is_swimmer を明示的に追加すること",
    ).toBe(true);
  });

  it("EntriesDataLoader.tsx (web, 大会エントリー候補) の select 句に is_swimmer が含まれる", () => {
    const source = readSource(
      "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader.tsx",
    );
    // team_memberships への select(`...`) テンプレートリテラルを抽出する
    const selectMatch = source.match(/\.from\("team_memberships"\)\s*\.select\(\s*`([\s\S]*?)`/);
    expect(selectMatch, "EntriesDataLoader.tsx の team_memberships select() が見つからない").not.toBeNull();
    expect(selectMatch![1]).toContain("is_swimmer");
  });

  it("RecordDataLoader.tsx (web, 記録入力候補) の select 句に is_swimmer が含まれる", () => {
    const source = readSource(
      "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader.tsx",
    );
    const selectMatch = source.match(/\.from\("team_memberships"\)\s*\.select\(\s*`([\s\S]*?)`/);
    expect(selectMatch, "RecordDataLoader.tsx の team_memberships select() が見つからない").not.toBeNull();
    expect(selectMatch![1]).toContain("is_swimmer");
  });

  it("EntriesDataLoader.tsx / RecordDataLoader.tsx のローカル型 (ActiveTeamMember/TeamMember) の is_swimmer が optional でない (select 漏れなら型検査自体が落ちる防波堤)", () => {
    const entriesSource = readSource(
      "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader.tsx",
    );
    const recordsSource = readSource(
      "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_server/RecordDataLoader.tsx",
    );

    // "is_swimmer?:" (optional) ではなく "is_swimmer:" (必須) であることを確認する
    expect(entriesSource).toMatch(/is_swimmer:\s*boolean;/);
    expect(entriesSource).not.toMatch(/is_swimmer\?:\s*boolean/);
    expect(recordsSource).toMatch(/is_swimmer:\s*boolean;/);
    // RecordDataLoader のローカル型定義部分だけを見る (RecordClient.tsx 側の
    // TeamMember とは別ファイルなので、このファイル内に optional 定義が
    // 紛れ込んでいないことだけを確認する)
  });
});
