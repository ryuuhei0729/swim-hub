// 週次利用レポートのメール整形 (純関数)。
// 仕様: docs/specs/weekly-usage-report.md の「メール」。
// 指標キーの表示名・区分の順序の唯一の定義元はこのファイル (集計側の SQL はキーだけを持つ)。

export type WeeklyMetrics = Record<string, number>;

// RPC generate_weekly_usage_report の返り値
export interface WeeklyReportPayload {
  week_start: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  metrics: WeeklyMetrics;
  uncategorized_tables: string[];
  email_sent_at: string | null;
  previous_metrics: WeeklyMetrics | null;
  previous_email_sent_at: string | null;
}

// 静的なキー (exact) か、動的なキー (match: 一致したら行に添える接尾辞を返す)
type Item =
  | { key: string; label: string; percentOfCohort?: true }
  | { match: (key: string) => string | null; label: string };

interface Section {
  heading: string;
  items: Item[];
}

function prefixed(prefix: string): (key: string) => string | null {
  return (key) => (key.startsWith(prefix) && key.length > prefix.length ? key.slice(prefix.length) : null);
}

const SECTIONS: Section[] = [
  {
    heading: "1. アカウント・利用",
    items: [
      { key: "account.users_new", label: "新規アカウント登録" },
      { key: "account.active_users", label: "アクティブユーザー (週内に何か登録した人)" },
    ],
  },
  {
    heading: "2. 個人の練習",
    items: [
      { key: "practice.personal_practices", label: "練習登録" },
      { key: "practice.personal_practices_with_image", label: "うち画像付き" },
      { key: "practice.personal_logs", label: "練習ログ登録" },
      { key: "practice.personal_logs_with_times", label: "うちタイム付き" },
      { key: "practice.tags", label: "練習タグ作成" },
      { key: "practice.log_templates", label: "練習テンプレート作成" },
    ],
  },
  {
    heading: "3. 個人の大会",
    items: [
      { key: "competition.personal_competitions", label: "大会登録" },
      { key: "competition.personal_entries", label: "エントリー登録" },
      { key: "competition.personal_records", label: "レースレコード登録" },
      { key: "competition.personal_records_with_video", label: "うち動画付き" },
      { key: "competition.personal_records_with_splits", label: "うちラップタイム付き" },
    ],
  },
  {
    heading: "4. チーム",
    items: [
      { key: "team.teams", label: "チーム作成" },
      { key: "team.memberships_new", label: "チーム加入 (申請・招待を含む)" },
      { key: "team.memberships_approved", label: "うち承認済み (集計時点)" },
      { key: "team.practices", label: "チーム練習登録" },
      { key: "team.practices_with_logs", label: "うち練習ログ付き" },
      { key: "team.competitions", label: "チーム大会登録" },
      { key: "team.entries", label: "チームエントリー" },
      { key: "team.records", label: "チームの記録登録" },
      { key: "team.records_with_splits", label: "うちラップタイム付き" },
      { key: "team.relay_records", label: "リレー記録" },
      { key: "team.attendance", label: "出欠回答" },
      { key: "team.announcements", label: "お知らせ投稿" },
      { key: "team.groups", label: "グループ作成" },
    ],
  },
  {
    heading: "5. 目標",
    items: [
      { key: "goal.created", label: "目標設定" },
      { key: "goal.achieved", label: "目標達成" },
      { match: prefixed("goal.milestones_created."), label: "マイルストーン設定 (種類別)" },
      { key: "goal.milestones_achieved", label: "マイルストーン達成" },
    ],
  },
  {
    heading: "6. 課金",
    items: [
      { match: prefixed("billing.premium_total."), label: "有料会員数 (集計時点)" },
      { key: "billing.cancel_pending", label: "うち解約予約中" },
      { match: prefixed("billing.new_premium."), label: "新規有料" },
      { key: "billing.new_cancel_pending", label: "新規解約予約" },
      { key: "billing.churned", label: "有料終了" },
      { key: "billing.sandbox_premium_total", label: "sandbox の有料 (参考)" },
    ],
  },
  {
    heading: "7. Scanner / Timer",
    items: [
      { match: prefixed("token."), label: "AI 読み取り回数" },
      {
        match: (key) => /^usage\.(.+)\.active_users$/.exec(key)?.[1] ?? null,
        label: "アプリ別の利用者数",
      },
      { key: "guest.scans", label: "ゲストの読み取り回数" },
      { key: "guest.unique_ips", label: "ゲストの IP 数" },
    ],
  },
  {
    heading: "8. サポート",
    items: [{ key: "support.contact_messages", label: "問い合わせ" }],
  },
  {
    heading: "9. 動線 (前週の新規登録者の、登録から7日以内の行動)",
    items: [
      { key: "funnel.cohort_size", label: "前週の新規登録者" },
      { key: "funnel.practice", label: "7日以内に練習", percentOfCohort: true },
      { key: "funnel.competition", label: "7日以内に大会・記録", percentOfCohort: true },
      { key: "funnel.team", label: "7日以内にチーム参加", percentOfCohort: true },
      { key: "funnel.goal", label: "7日以内に目標", percentOfCohort: true },
    ],
  },
];

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface JstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function toJst(ms: number): JstParts {
  const d = new Date(ms + JST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year: String(d.getUTCFullYear()),
    month: pad(d.getUTCMonth() + 1),
    day: pad(d.getUTCDate()),
    hour: pad(d.getUTCHours()),
    minute: pad(d.getUTCMinutes()),
  };
}

function ymd(p: JstParts): string {
  return `${p.year}/${p.month}/${p.day}`;
}

function formatDiff(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return "±0";
  return diff > 0 ? `+${diff}` : String(diff);
}

function formatPeriod(report: WeeklyReportPayload): { start: JstParts; end: JstParts } {
  const start = toJst(new Date(report.period_start).getTime());
  // period_end は翌週の土曜 00:00。終了日は金曜の包含表記にするので 1 日戻す
  const end = toJst(new Date(report.period_end).getTime() - DAY_MS);
  return { start, end };
}

export function formatWeeklyReport(report: WeeklyReportPayload): { subject: string; text: string } {
  const { start, end } = formatPeriod(report);
  const endShort = start.year === end.year ? `${end.month}/${end.day}` : ymd(end);
  const subject = `【週次レポート】${ymd(start)}〜${endShort} の利用状況`;

  const metrics = report.metrics;
  const previous = report.previous_metrics;
  const cohort = metrics["funnel.cohort_size"];

  const comparison = (key: string, value: number): string => {
    if (previous === null) return " (先週データなし)";
    const prev = previous[key];
    if (prev === undefined) return " (新規指標)";
    return ` (先週 ${prev} / ${formatDiff(value, prev)})`;
  };

  const lines: string[] = [];
  lines.push("SwimHub 週次利用レポート");
  lines.push(`集計期間 (JST): ${ymd(start)} 〜 ${ymd(end)}`);
  const generated = toJst(new Date(report.generated_at).getTime());
  lines.push(`生成: ${ymd(generated)} ${generated.hour}:${generated.minute} (JST)`);
  if (previous !== null && report.previous_email_sent_at === null) {
    lines.push("※ 前週のレポートは未送信でした");
  }

  const used = new Set<string>();
  for (const section of SECTIONS) {
    lines.push("");
    lines.push(`■ ${section.heading}`);
    for (const item of section.items) {
      if ("key" in item) {
        const value = metrics[item.key];
        if (value === undefined) continue;
        used.add(item.key);
        const percent =
          item.percentOfCohort && cohort !== undefined && cohort > 0
            ? ` (${Math.round((value / cohort) * 100)}%)`
            : "";
        lines.push(`${item.label}: ${value}${percent}${comparison(item.key, value)}`);
      } else {
        for (const key of Object.keys(metrics).sort()) {
          const suffix = item.match(key);
          if (suffix === null) continue;
          const value = metrics[key]!;
          used.add(key);
          lines.push(`${item.label} / ${suffix}: ${value}${comparison(key, value)}`);
        }
      }
    }
    // 前週のスナップショットが無い週は、フローの指標 (新規有料・新規解約予約・有料終了) が metrics に無い
    if (
      section.heading.startsWith("6.") &&
      metrics["billing.new_cancel_pending"] === undefined &&
      metrics["billing.churned"] === undefined
    ) {
      lines.push("新規有料・新規解約予約・有料終了: 比較なし (前週のスナップショットなし)");
    }
  }

  lines.push("");
  lines.push("■ その他の指標 (表示名の無いもの)");
  const others = Object.keys(metrics)
    .filter((key) => !used.has(key))
    .sort();
  if (others.length === 0) {
    lines.push("なし");
  } else {
    for (const key of others) {
      lines.push(`${key}: ${metrics[key]}${comparison(key, metrics[key]!)}`);
    }
  }

  lines.push("");
  lines.push("■ 未分類テーブル (集計の分類に無いテーブル)");
  if (report.uncategorized_tables.length === 0) {
    lines.push("なし");
  } else {
    for (const table of report.uncategorized_tables) lines.push(table);
  }

  return { subject, text: lines.join("\n") };
}
