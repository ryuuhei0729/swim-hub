// 週次利用レポートのメール整形 (純関数) のテスト。
//
// 仕様: docs/specs/weekly-usage-report.md の「メール」と、成功条件 10・18。
// 入力は RPC generate_weekly_usage_report の返り値 (jsonb) をそのまま渡す。
//
// 行の書式の契約 (このテストが前提にしているもの):
//   - 指標の行は「表示名: 今週の値」で始まる。行頭の空白・「-」「・」「*」の箇条書き記号は許す
//   - 先週比は同じ行に「(先週 N / +差分)」。減少は -3、同じなら ±0
//   - 先週の行が無ければ同じ行に「先週データなし」、先週にキーが無ければ「新規指標」
//   - 動的なキー (例: billing.premium_total.stripe) は「表示名」で始まり、同じ行にキーの末尾 (stripe) を含む
//
// 実行方法:
//   cd swim-hub && DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net --cached-only --frozen \
//     supabase/functions/_shared/weekly-report-format.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatWeeklyReport, type WeeklyReportPayload } from "./weekly-report-format.ts";

// 仕様の表と同じ (キー → 表示名)。値はキーごとに重ならない数にする
const STATIC_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["account.users_new", "新規アカウント登録"],
  ["account.active_users", "アクティブユーザー (週内に何か登録した人)"],
  ["practice.personal_practices", "練習登録"],
  ["practice.personal_practices_with_image", "うち画像付き"],
  ["practice.personal_logs", "練習ログ登録"],
  ["practice.personal_logs_with_times", "うちタイム付き"],
  ["practice.tags", "練習タグ作成"],
  ["practice.log_templates", "練習テンプレート作成"],
  ["competition.personal_competitions", "大会登録"],
  ["competition.personal_entries", "エントリー登録"],
  ["competition.personal_records", "レースレコード登録"],
  ["competition.personal_records_with_video", "うち動画付き"],
  ["competition.personal_records_with_splits", "うちラップタイム付き"],
  ["team.teams", "チーム作成"],
  ["team.memberships_new", "チーム加入 (申請・招待を含む)"],
  ["team.memberships_approved", "うち承認済み (集計時点)"],
  ["team.practices", "チーム練習登録"],
  ["team.practices_with_logs", "うち練習ログ付き"],
  ["team.competitions", "チーム大会登録"],
  ["team.entries", "チームエントリー"],
  ["team.records", "チームの記録登録"],
  ["team.records_with_splits", "うちラップタイム付き"],
  ["team.relay_records", "リレー記録"],
  ["team.attendance", "出欠回答"],
  ["team.announcements", "お知らせ投稿"],
  ["team.groups", "グループ作成"],
  ["goal.created", "目標設定"],
  ["goal.achieved", "目標達成"],
  ["goal.milestones_achieved", "マイルストーン達成"],
  ["billing.cancel_pending", "うち解約予約中"],
  ["billing.new_cancel_pending", "新規解約予約"],
  ["billing.churned", "有料終了"],
  ["billing.sandbox_premium_total", "sandbox の有料 (参考)"],
  ["guest.scans", "ゲストの読み取り回数"],
  ["guest.unique_ips", "ゲストの IP 数"],
  ["support.contact_messages", "問い合わせ"],
  ["funnel.cohort_size", "前週の新規登録者"],
  ["funnel.practice", "7日以内に練習"],
  ["funnel.competition", "7日以内に大会・記録"],
  ["funnel.team", "7日以内にチーム参加"],
  ["funnel.goal", "7日以内に目標"],
];

// 動的なキー: [キー, 表示名, 行に含まれるべき末尾]
const DYNAMIC_LABELS: ReadonlyArray<readonly [string, string, string]> = [
  ["goal.milestones_created.reps_time", "マイルストーン設定 (種類別)", "reps_time"],
  ["billing.premium_total.stripe", "有料会員数 (集計時点)", "stripe"],
  ["billing.new_premium.revenucat", "新規有料", "revenucat"],
  ["token.swimhub_scanner.scanner_scan", "AI 読み取り回数", "scanner_scan"],
  ["usage.swimhub_timer.active_users", "アプリ別の利用者数", "swimhub_timer"],
];

function allLabeledMetrics(): Record<string, number> {
  const metrics: Record<string, number> = {};
  STATIC_LABELS.forEach(([key], i) => {
    metrics[key] = 101 + i;
  });
  DYNAMIC_LABELS.forEach(([key], i) => {
    metrics[key] = 201 + i;
  });
  return metrics;
}

function makeReport(overrides: Partial<WeeklyReportPayload> = {}): WeeklyReportPayload {
  return {
    // 週は JST の土曜〜金曜。PostgREST は timestamptz を UTC の ISO 文字列で返す
    week_start: "2026-10-31",
    period_start: "2026-10-30T15:00:00+00:00",
    period_end: "2026-11-06T15:00:00+00:00",
    // 土曜 07:00 JST の実行
    generated_at: "2026-11-06T22:00:05.123+00:00",
    metrics: allLabeledMetrics(),
    uncategorized_tables: [],
    email_sent_at: null,
    previous_metrics: null,
    previous_email_sent_at: null,
    ...overrides,
  };
}

function lines(text: string): string[] {
  return text.split("\n");
}

function norm(line: string): string {
  return line.replace(/^[\s\-・*]+/, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 「表示名: 値」で始まる行の番号 (値の後ろに数字が続くものは別の値として除く)。無ければ -1 */
function metricLineIndex(text: string, label: string, value: number): number {
  const re = new RegExp(`^${escapeRegExp(label)}: ${value}(?!\\d)`);
  return lines(text).findIndex((l) => re.test(norm(l)));
}

function metricLine(text: string, label: string, value: number): string {
  const i = metricLineIndex(text, label, value);
  assert(i >= 0, `「${label}: ${value}」の行が無い\n---\n${text}`);
  return norm(lines(text)[i]!);
}

function dynamicLineIndex(text: string, label: string, suffix: string, value: number): number {
  return lines(text).findIndex((l) => {
    const n = norm(l);
    return n.startsWith(label) && n.includes(suffix) && new RegExp(`: ${value}(?!\\d)`).test(n);
  });
}

function headingIndex(text: string, heading: string): number {
  return lines(text).findIndex((l) => l.includes(heading));
}

// --- 件名と冒頭 ---

Deno.test("件名は【週次レポート】と JST の土曜〜金曜 (終了日は金曜の包含表記)", () => {
  const { subject } = formatWeeklyReport(makeReport());
  assertEquals(subject, "【週次レポート】2026/10/31〜11/06 の利用状況");
});

Deno.test("月をまたぐ週の件名", () => {
  const { subject } = formatWeeklyReport(
    makeReport({
      week_start: "2026-11-28",
      period_start: "2026-11-27T15:00:00+00:00",
      period_end: "2026-12-04T15:00:00+00:00",
    }),
  );
  assertEquals(subject, "【週次レポート】2026/11/28〜12/04 の利用状況");
});

Deno.test("年をまたぐ週の件名は終了日にも年を付ける", () => {
  const { subject } = formatWeeklyReport(
    makeReport({
      week_start: "2026-12-26",
      period_start: "2026-12-25T15:00:00+00:00",
      period_end: "2027-01-01T15:00:00+00:00",
    }),
  );
  assertEquals(subject, "【週次レポート】2026/12/26〜2027/01/01 の利用状況");
});

Deno.test("本文の冒頭に集計期間 (JST) と生成時刻 (JST) を書く", () => {
  const { text } = formatWeeklyReport(makeReport());
  const firstMetric = metricLineIndex(text, "新規アカウント登録", 101);
  assert(firstMetric > 0, text);
  const head = lines(text).slice(0, firstMetric);
  const period = head.find((l) => l.includes("集計期間"));
  assert(period, `冒頭に集計期間の行が無い\n${text}`);
  // period_start は UTC で 10/30 15:00。JST に直さないと 10/30 と出る
  assert(period.includes("2026/10/31"), period);
  assert(period.includes("11/06"), period);
  assert(!period.includes("10/30"), `集計期間が UTC のまま: ${period}`);
  const generated = head.find((l) => l.includes("生成"));
  assert(generated, `冒頭に生成時刻の行が無い\n${text}`);
  assert(generated.includes("2026/11/07 07:00"), `生成時刻が JST でない: ${generated}`);
});

// --- 表示名と区分の順 ---

Deno.test("ラベルのあるキーは全て「表示名: 値」の行で出る", () => {
  const { text } = formatWeeklyReport(makeReport());
  STATIC_LABELS.forEach(([key, label], i) => {
    assert(metricLineIndex(text, label, 101 + i) >= 0, `${key} (${label}: ${101 + i}) の行が無い\n---\n${text}`);
  });
  DYNAMIC_LABELS.forEach(([key, label, suffix], i) => {
    assert(
      dynamicLineIndex(text, label, suffix, 201 + i) >= 0,
      `${key} が「${label}」と「${suffix}」を含む行で出ていない\n---\n${text}`,
    );
  });
});

Deno.test("区分 1〜9、その他の指標、未分類テーブルの順に並び、各区分に見出しがある", () => {
  const { text } = formatWeeklyReport(
    makeReport({
      metrics: { ...allLabeledMetrics(), "zzz.unlabeled_metric": 7 },
      uncategorized_tables: ["qa_new_table"],
    }),
  );
  const m = allLabeledMetrics();
  // 各区分の最初の指標の行
  const firsts: Array<[string, number]> = [
    ["アカウント・利用", metricLineIndex(text, "新規アカウント登録", m["account.users_new"]!)],
    ["個人の練習", metricLineIndex(text, "練習登録", m["practice.personal_practices"]!)],
    ["個人の大会", metricLineIndex(text, "大会登録", m["competition.personal_competitions"]!)],
    ["チーム", metricLineIndex(text, "チーム作成", m["team.teams"]!)],
    ["目標", metricLineIndex(text, "目標設定", m["goal.created"]!)],
    ["課金", dynamicLineIndex(text, "有料会員数 (集計時点)", "stripe", m["billing.premium_total.stripe"]!)],
    ["Scanner / Timer", dynamicLineIndex(text, "AI 読み取り回数", "scanner_scan", m["token.swimhub_scanner.scanner_scan"]!)],
    ["サポート", metricLineIndex(text, "問い合わせ", m["support.contact_messages"]!)],
    ["動線", metricLineIndex(text, "前週の新規登録者", m["funnel.cohort_size"]!)],
  ];
  const other = headingIndex(text, "その他の指標");
  const uncategorized = headingIndex(text, "未分類テーブル");
  const order = [...firsts.map(([, i]) => i), other, uncategorized];
  for (const i of order) assert(i >= 0, `見つからない行がある: ${JSON.stringify(order)}\n---\n${text}`);
  for (let k = 1; k < order.length; k++) {
    assert(order[k - 1]! < order[k]!, `順序が違う: ${JSON.stringify(order)}\n---\n${text}`);
  }
  // 見出しは、前の区分の最初の指標より後・その区分の最初の指標より前にある
  const all = lines(text);
  firsts.forEach(([heading, first], k) => {
    const from = k === 0 ? 0 : firsts[k - 1]![1] + 1;
    const found = all.slice(from, first).some((l) => l.includes(heading));
    assert(found, `区分「${heading}」の見出しが、その区分の指標の直前に無い\n---\n${text}`);
  });
});

Deno.test("ラベルの無いキーは「その他の指標」に出し、落とさない", () => {
  const { text } = formatWeeklyReport(
    makeReport({ metrics: { ...allLabeledMetrics(), "zzz.unlabeled_metric": 7 } }),
  );
  const other = headingIndex(text, "その他の指標");
  const uncategorized = headingIndex(text, "未分類テーブル");
  const at = metricLineIndex(text, "zzz.unlabeled_metric", 7);
  assert(other >= 0 && at > other && at < uncategorized, `その他の指標の中に無い (${other}, ${at}, ${uncategorized})\n${text}`);
});

Deno.test("動的なキー (milestone の type・provider・app) は「その他の指標」に落ちない", () => {
  const { text } = formatWeeklyReport(
    makeReport({
      metrics: {
        ...allLabeledMetrics(),
        "goal.milestones_created.brand_new_type": 3,
        "billing.premium_total.some_new_provider": 4,
      },
    }),
  );
  const other = headingIndex(text, "その他の指標");
  const uncategorized = headingIndex(text, "未分類テーブル");
  const otherSection = lines(text).slice(other + 1, uncategorized).join("\n");
  for (const [key] of DYNAMIC_LABELS) {
    assert(!otherSection.includes(key), `${key} がその他の指標に出ている\n${otherSection}`);
  }
  assert(!otherSection.includes("brand_new_type"), otherSection);
  assert(!otherSection.includes("some_new_provider"), otherSection);
  assert(dynamicLineIndex(text, "マイルストーン設定 (種類別)", "brand_new_type", 3) >= 0, text);
  assert(dynamicLineIndex(text, "有料会員数 (集計時点)", "some_new_provider", 4) >= 0, text);
});

// --- 先週比 ---

Deno.test("先週比: 増加は +N、減少は -N、同じなら ±0、先週 0 からの増加も差分で出す", () => {
  const metrics = {
    ...allLabeledMetrics(),
    "account.users_new": 12,
    "practice.personal_practices": 5,
    "competition.personal_competitions": 4,
    "support.contact_messages": 3,
    "team.teams": 0,
  };
  const previous = {
    ...metrics,
    "account.users_new": 10,
    "practice.personal_practices": 8,
    "competition.personal_competitions": 4,
    "support.contact_messages": 0,
    "team.teams": 2,
  };
  const { text } = formatWeeklyReport(
    makeReport({ metrics, previous_metrics: previous, previous_email_sent_at: "2026-11-02T00:00:07+00:00" }),
  );
  assertEquals(metricLine(text, "新規アカウント登録", 12), "新規アカウント登録: 12 (先週 10 / +2)");
  assertEquals(metricLine(text, "練習登録", 5), "練習登録: 5 (先週 8 / -3)");
  assertEquals(metricLine(text, "大会登録", 4), "大会登録: 4 (先週 4 / ±0)");
  assertEquals(metricLine(text, "問い合わせ", 3), "問い合わせ: 3 (先週 0 / +3)");
  assertEquals(metricLine(text, "チーム作成", 0), "チーム作成: 0 (先週 2 / -2)");
});

Deno.test("先週の行が無い (previous_metrics が null) ときは各行に「先週データなし」と出し、差分は出さない", () => {
  const { text } = formatWeeklyReport(makeReport({ previous_metrics: null }));
  assert(metricLine(text, "新規アカウント登録", 101).includes("先週データなし"), text);
  assert(metricLine(text, "練習登録", 103).includes("先週データなし"), text);
  assert(!/\(先週 \d/.test(text), `先週の行が無いのに先週の値が出ている\n${text}`);
});

Deno.test("先週の行にキーが無い指標は「新規指標」と出す (先週 0 とは扱わない)", () => {
  const metrics = allLabeledMetrics();
  const previous: Record<string, number> = { ...metrics };
  delete previous["account.users_new"];
  delete previous["goal.milestones_created.reps_time"];
  const { text } = formatWeeklyReport(
    makeReport({ metrics, previous_metrics: previous, previous_email_sent_at: "2026-11-02T00:00:07+00:00" }),
  );
  const users = metricLine(text, "新規アカウント登録", 101);
  assert(users.includes("新規指標"), users);
  assert(!users.includes("先週 0"), users);
  const i = dynamicLineIndex(text, "マイルストーン設定 (種類別)", "reps_time", metrics["goal.milestones_created.reps_time"]!);
  assert(i >= 0 && lines(text)[i]!.includes("新規指標"), text);
  // 先週にキーがある行は通常の先週比
  assertEquals(metricLine(text, "練習登録", 103), "練習登録: 103 (先週 103 / ±0)");
});

// --- 前週の送信状況 ---

Deno.test("前週の行があり email_sent_at が NULL なら「前週のレポートは未送信でした」と注記する", () => {
  const { text } = formatWeeklyReport(
    makeReport({ previous_metrics: allLabeledMetrics(), previous_email_sent_at: null }),
  );
  assert(text.includes("前週のレポートは未送信でした"), text);
});

Deno.test("前週が送信済みなら注記しない", () => {
  const { text } = formatWeeklyReport(
    makeReport({ previous_metrics: allLabeledMetrics(), previous_email_sent_at: "2026-11-02T00:00:07+00:00" }),
  );
  assert(!text.includes("未送信"), text);
});

Deno.test("前週の行そのものが無いときは未送信の注記を出さない (先週データなしで表す)", () => {
  const { text } = formatWeeklyReport(makeReport({ previous_metrics: null, previous_email_sent_at: null }));
  assert(!text.includes("未送信"), text);
});

// --- 課金の初回 ---

Deno.test("課金のフローの指標が無い週 (前週のスナップショットなし) は「比較なし」と出す", () => {
  const metrics = allLabeledMetrics();
  delete metrics["billing.new_cancel_pending"];
  delete metrics["billing.churned"];
  delete metrics["billing.new_premium.revenucat"];
  const { text } = formatWeeklyReport(makeReport({ metrics }));
  assert(text.includes("比較なし"), text);
  assert(!lines(text).some((l) => /^(新規有料|新規解約予約|有料終了).*: \d/.test(norm(l))), text);
});

Deno.test("課金のフローの指標がある週は「比較なし」を出さない", () => {
  const { text } = formatWeeklyReport(makeReport());
  assert(!text.includes("比較なし"), text);
});

// --- 動線の割合 ---

Deno.test("動線はコホート人数に対する割合を出す", () => {
  const metrics = {
    ...allLabeledMetrics(),
    "funnel.cohort_size": 10,
    "funnel.practice": 3,
    "funnel.competition": 0,
    "funnel.team": 10,
    "funnel.goal": 5,
  };
  const { text } = formatWeeklyReport(makeReport({ metrics }));
  assert(metricLine(text, "7日以内に練習", 3).includes("30%"), text);
  assert(metricLine(text, "7日以内に大会・記録", 0).includes("0%"), text);
  assert(metricLine(text, "7日以内にチーム参加", 10).includes("100%"), text);
  assert(metricLine(text, "7日以内に目標", 5).includes("50%"), text);
});

Deno.test("割り切れない割合も出す (1/3 → 33)", () => {
  const metrics = { ...allLabeledMetrics(), "funnel.cohort_size": 3, "funnel.team": 1 };
  const { text } = formatWeeklyReport(makeReport({ metrics }));
  const line = metricLine(text, "7日以内にチーム参加", 1);
  assert(/33(\.\d+)?%/.test(line), line);
});

Deno.test("コホートが 0 人なら割合を出さない (0 除算しない)", () => {
  const metrics = {
    ...allLabeledMetrics(),
    "funnel.cohort_size": 0,
    "funnel.practice": 0,
    "funnel.competition": 0,
    "funnel.team": 0,
    "funnel.goal": 0,
  };
  const { text } = formatWeeklyReport(makeReport({ metrics }));
  for (const label of ["7日以内に練習", "7日以内に大会・記録", "7日以内にチーム参加", "7日以内に目標"]) {
    const line = metricLine(text, label, 0);
    assert(!line.includes("%"), line);
    assert(!line.includes("NaN") && !line.includes("Infinity"), line);
  }
});

// --- 未分類テーブル ---

Deno.test("未分類テーブルは末尾にテーブル名を並べる", () => {
  const { text } = formatWeeklyReport(makeReport({ uncategorized_tables: ["qa_new_table", "another_table"] }));
  const tail = lines(text).slice(headingIndex(text, "未分類テーブル")).join("\n");
  assert(tail.includes("qa_new_table"), tail);
  assert(tail.includes("another_table"), tail);
});

Deno.test("未分類テーブルが 0 件なら「なし」と出す", () => {
  const { text } = formatWeeklyReport(makeReport({ uncategorized_tables: [] }));
  const tail = lines(text).slice(headingIndex(text, "未分類テーブル")).join("\n");
  assert(tail.includes("なし"), tail);
});
