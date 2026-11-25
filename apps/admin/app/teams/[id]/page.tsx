import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Table, TabNav } from "@/components/ui";
import { formatDay, formatDayTime, formatPool } from "@/lib/format";
import {
  getTeamHeader,
  listTeamCompetitions,
  listTeamPractices,
  type TeamHeader,
} from "@/lib/queries";

const TABS = [
  { key: "members", label: "メンバー" },
  { key: "practices", label: "練習" },
  { key: "competitions", label: "大会" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  approved: "承認済み",
  pending: "承認待ち",
  rejected: "却下",
};

const ENTRY_STATUS_LABEL: Record<string, string> = {
  before: "受付前",
  open: "受付中",
  closed: "締切",
};

function UserLink({ user }: { user: { id: string; name: string } | null }) {
  if (!user) return <>-</>;
  return (
    <Link href={`/users/${user.id}`} className="text-blue-700 hover:underline">
      {user.name || "(名前なし)"}
    </Link>
  );
}

function formatAttendance(attendance: { present: number; answered: number }): string {
  return attendance.answered === 0 ? "-" : `${attendance.present} / ${attendance.answered}`;
}

function MembersTab({ header }: { header: TeamHeader }) {
  if (header.memberships.length === 0) return <Empty>メンバーがいません</Empty>;
  return (
    <Table head={["名前", "役割", "承認", "在籍", "参加日", "退会日"]}>
      {header.memberships.map((membership) => (
        <tr key={membership.id}>
          <td>
            <UserLink user={membership.users} />
          </td>
          <td>{membership.role === "admin" ? "管理者" : "メンバー"}</td>
          <td>{MEMBERSHIP_STATUS_LABEL[membership.status] ?? membership.status}</td>
          <td>{membership.is_active ? "在籍中" : "退会"}</td>
          <td>{formatDay(membership.joined_at)}</td>
          <td>{formatDay(membership.left_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

async function PracticesTab({ teamId }: { teamId: string }) {
  const practices = await listTeamPractices(teamId);
  if (practices.length === 0) return <Empty>まだチーム練習がありません</Empty>;
  return (
    <Table
      head={["日付", "タイトル", "場所", "作成者", "メニュー数", "記録した人数", "出席 / 回答", "登録日時"]}
    >
      {practices.map((practice) => (
        <tr key={practice.id}>
          <td>{formatDay(practice.date)}</td>
          <td>{practice.title ?? "-"}</td>
          <td>{practice.place ?? "-"}</td>
          <td>
            <UserLink user={practice.creator} />
          </td>
          <td className="text-right tabular-nums">{practice.logCount}</td>
          <td className="text-right tabular-nums">{practice.swimmerCount}</td>
          <td className="text-right tabular-nums">{formatAttendance(practice.attendance)}</td>
          <td className="text-gray-500">{formatDayTime(practice.created_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

async function CompetitionsTab({ teamId }: { teamId: string }) {
  const competitions = await listTeamCompetitions(teamId);
  if (competitions.length === 0) return <Empty>まだチームの大会がありません</Empty>;
  return (
    <Table
      head={[
        "日付",
        "大会",
        "場所",
        "プール",
        "エントリー受付",
        "エントリー数",
        "記録数",
        "記録した人数",
        "出席 / 回答",
        "作成者",
      ]}
    >
      {competitions.map((competition) => (
        <tr key={competition.id}>
          <td>
            {formatDay(competition.date)}
            {competition.end_date && competition.end_date !== competition.date
              ? ` 〜 ${formatDay(competition.end_date)}`
              : ""}
          </td>
          <td>{competition.title ?? "-"}</td>
          <td>{competition.place ?? "-"}</td>
          <td>{formatPool(competition.pool_type)}</td>
          <td>{ENTRY_STATUS_LABEL[competition.entry_status] ?? competition.entry_status}</td>
          <td className="text-right tabular-nums">{competition.entryCount}</td>
          <td className="text-right tabular-nums">{competition.recordCount}</td>
          <td className="text-right tabular-nums">{competition.recordSwimmerCount}</td>
          <td className="text-right tabular-nums">{formatAttendance(competition.attendance)}</td>
          <td>
            <UserLink user={competition.creator} />
          </td>
        </tr>
      ))}
    </Table>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  if (!UUID_PATTERN.test(id)) notFound();

  const header = await getTeamHeader(id);
  if (!header) notFound();

  const activeTab: TabKey = TABS.find((item) => item.key === tab)?.key ?? "members";
  const { team, counts } = header;
  const activeMembers = header.memberships.filter(
    (membership) => membership.is_active && membership.status === "approved",
  );
  const tabCounts: Record<TabKey, number> = {
    members: header.memberships.length,
    practices: counts.practices,
    competitions: counts.competitions,
  };
  const kpis = [
    { label: "在籍メンバー", value: activeMembers.length },
    { label: "うち管理者", value: activeMembers.filter((m) => m.role === "admin").length },
    { label: "チーム練習", value: counts.practices },
    { label: "チームの大会", value: counts.competitions },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">{team.name || "(名前なし)"}</h1>
      <p className="mt-1 text-xs text-gray-500">
        作成 {formatDay(team.created_at)} ・ 作成者 <UserLink user={team.creator} />
        <span className="ml-2 font-mono">{team.id}</span>
      </p>
      {team.description && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{team.description}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">{kpi.label}</div>
            <div className="text-xl font-bold tabular-nums">{kpi.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <TabNav
        basePath={`/teams/${id}`}
        activeKey={activeTab}
        tabs={TABS.map((item) => ({ ...item, count: tabCounts[item.key] }))}
      />

      {activeTab === "members" && <MembersTab header={header} />}
      {activeTab === "practices" && <PracticesTab teamId={id} />}
      {activeTab === "competitions" && <CompetitionsTab teamId={id} />}
      {activeTab !== "members" && (
        <p className="mt-2 text-xs text-gray-500">新しい順に最大 200 件まで表示しています</p>
      )}
    </div>
  );
}
