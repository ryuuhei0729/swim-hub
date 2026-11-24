import { formatTime } from "@swim-hub/shared/utils/time";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Pill, Table, TabNav } from "@/components/ui";
import { formatAgo, formatDay, formatDayTime, formatPool, formatStyle } from "@/lib/format";
import {
  getOverview,
  getUserHeader,
  listGoals,
  listPractices,
  listRecords,
  type UserHeader,
} from "@/lib/queries";

const TABS = [
  { key: "overview", label: "概要" },
  { key: "practices", label: "練習" },
  { key: "records", label: "大会・記録" },
  { key: "teams", label: "チーム" },
  { key: "goals", label: "目標" },
  { key: "billing", label: "課金" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function RecordsTable({ records }: { records: Awaited<ReturnType<typeof listRecords>> }) {
  if (records.length === 0) return <Empty>まだ記録がありません</Empty>;
  return (
    <Table head={["大会日", "大会", "種目", "プール", "タイム", "リレー", "登録日時"]}>
      {records.map((record) => (
        <tr key={record.id}>
          <td>{formatDay(record.competitions?.date)}</td>
          <td>{record.competitions?.title ?? "-"}</td>
          <td>{formatStyle(record.styles)}</td>
          <td>{formatPool(record.pool_type)}</td>
          <td className="text-right tabular-nums">{formatTime(record.time)}</td>
          <td>{record.is_relaying ? "引き継ぎ" : "-"}</td>
          <td className="text-gray-500">{formatDayTime(record.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

async function OverviewTab({ header }: { header: UserHeader }) {
  const { activity, records } = await getOverview(header.user.id, header);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-gray-200 p-3">
        <h2 className="mb-2 text-sm font-semibold">直近の行動</h2>
        {activity.length === 0 ? (
          <Empty>まだ行動がありません</Empty>
        ) : (
          <ul className="text-sm">
            {activity.map((item, index) => (
              <li
                key={`${item.at}-${index}`}
                className="flex gap-3 border-b border-dashed border-gray-200 py-1.5 last:border-0"
              >
                <time className="w-32 shrink-0 text-xs text-gray-500">
                  {formatDayTime(item.at)}
                </time>
                <span className="min-w-0 break-words">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-w-0 rounded-lg border border-gray-200 p-3">
        <h2 className="mb-2 text-sm font-semibold">最近登録した記録</h2>
        <RecordsTable records={records} />
      </section>
    </div>
  );
}

async function PracticesTab({ userId }: { userId: string }) {
  const practices = await listPractices(userId);
  if (practices.length === 0) return <Empty>まだ練習がありません</Empty>;
  return (
    <Table head={["日付", "タイトル", "場所", "メニュー数", "総距離", "種別", "登録日時"]}>
      {practices.map((practice) => (
        <tr key={practice.id}>
          <td>{formatDay(practice.date)}</td>
          <td>{practice.title ?? "-"}</td>
          <td>{practice.place ?? "-"}</td>
          <td className="text-right tabular-nums">{practice.logCount}</td>
          <td className="text-right tabular-nums">
            {practice.totalDistance > 0 ? `${practice.totalDistance.toLocaleString()}m` : "-"}
          </td>
          <td>{practice.team_id ? (practice.ownedByUser ? "チーム (作成者)" : "チーム") : "個人"}</td>
          <td className="text-gray-500">{formatDayTime(practice.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

async function GoalsTab({ userId }: { userId: string }) {
  const goals = await listGoals(userId);
  if (goals.length === 0) return <Empty>まだ目標がありません</Empty>;
  return (
    <Table head={["大会", "大会日", "種目", "目標タイム", "状態", "マイルストーン", "設定日時"]}>
      {goals.map((goal) => (
        <tr key={goal.id}>
          <td>{goal.competitions?.title ?? "-"}</td>
          <td>{formatDay(goal.competitions?.date)}</td>
          <td>{formatStyle(goal.styles)}</td>
          <td className="text-right tabular-nums">{formatTime(goal.target_time)}</td>
          <td>{goal.status}</td>
          <td className="text-right tabular-nums">
            {goal.milestones.filter((milestone) => milestone.status === "achieved").length} /{" "}
            {goal.milestones.length}
          </td>
          <td className="text-gray-500">{formatDayTime(goal.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

function TeamsTab({ header }: { header: UserHeader }) {
  if (header.memberships.length === 0) return <Empty>チームに所属していません</Empty>;
  return (
    <Table head={["チーム", "役割", "承認", "在籍", "参加日", "退会日"]}>
      {header.memberships.map((membership) => (
        <tr key={membership.id}>
          <td>
            {membership.teams ? (
              <Link href={`/teams/${membership.teams.id}`} className="text-blue-700 hover:underline">
                {membership.teams.name}
              </Link>
            ) : (
              "-"
            )}
          </td>
          <td>{membership.role === "admin" ? "管理者" : "メンバー"}</td>
          <td>{membership.status}</td>
          <td>{membership.is_active ? "在籍中" : "退会"}</td>
          <td>{formatDay(membership.joined_at)}</td>
          <td>{formatDay(membership.left_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

function BillingTab({ header }: { header: UserHeader }) {
  const subscription = header.subscription;
  if (!subscription) return <Empty>課金情報の行がありません</Empty>;
  const rows: [string, string][] = [
    ["プラン", subscription.plan],
    ["状態", subscription.status ?? "-"],
    ["決済元", subscription.provider ?? "-"],
    ["決済環境", subscription.provider_environment ?? "-"],
    ["現在の期間の開始", formatDayTime(subscription.current_period_start)],
    ["Premium 期限", formatDayTime(subscription.premium_expires_at)],
    ["期間終了で解約", subscription.cancel_at_period_end ? "はい" : "いいえ"],
    ["トライアル開始", formatDayTime(subscription.trial_start)],
    ["トライアル終了", formatDayTime(subscription.trial_end)],
    ["作成日時", formatDayTime(subscription.created_at)],
    ["更新日時", formatDayTime(subscription.updated_at)],
  ];
  return (
    <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-gray-500">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const header = await getUserHeader(id);
  if (!header) notFound();

  const activeTab: TabKey = TABS.find((item) => item.key === tab)?.key ?? "overview";
  const { user, counts } = header;
  const activeTeams = header.memberships.filter(
    (membership) => membership.is_active && membership.status === "approved",
  );
  const tabCounts: Partial<Record<TabKey, number>> = {
    practices: counts.practices,
    records: counts.records,
    teams: header.memberships.length,
    goals: counts.goals,
  };
  const kpis = [
    { label: "練習", value: counts.practices },
    { label: "記録", value: counts.records },
    { label: "所属チーム", value: activeTeams.length },
    { label: "登録した日数 / 30日", value: counts.activeDays },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{user.name || "(名前なし)"}</h1>
        <Pill tone={header.premium ? "green" : "gray"}>{header.premium ? "Premium" : "Free"}</Pill>
        <span className="font-mono text-xs text-gray-500">{header.email ?? "メール不明"}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        登録 {formatDay(user.created_at)} ・ 最終ログイン {formatAgo(header.lastSignInAt)} ・
        ログイン方法 {header.providers.join(", ") || "-"} ・ オンボーディング{" "}
        {user.onboarding_completed ? "完了" : "未完了"}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        {activeTeams.length === 0
          ? "所属チームなし"
          : activeTeams
              .map(
                (membership) =>
                  `${membership.teams?.name ?? "不明"} (${membership.role === "admin" ? "管理者" : "メンバー"})`,
              )
              .join("、")}
        <span className="ml-2 font-mono">{user.id}</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">{kpi.label}</div>
            <div className="text-xl font-bold tabular-nums">{kpi.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <TabNav
        basePath={`/users/${id}`}
        activeKey={activeTab}
        tabs={TABS.map((item) => ({ ...item, count: tabCounts[item.key] }))}
      />

      {activeTab === "overview" && <OverviewTab header={header} />}
      {activeTab === "practices" && <PracticesTab userId={id} />}
      {activeTab === "records" && <RecordsTable records={await listRecords(id)} />}
      {activeTab === "teams" && <TeamsTab header={header} />}
      {activeTab === "goals" && <GoalsTab userId={id} />}
      {activeTab === "billing" && <BillingTab header={header} />}
      {(activeTab === "practices" || activeTab === "records" || activeTab === "goals") && (
        <p className="mt-2 text-xs text-gray-500">新しい順に最大 200 件まで表示しています</p>
      )}
    </div>
  );
}
