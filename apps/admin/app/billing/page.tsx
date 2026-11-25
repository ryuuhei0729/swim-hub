import Link from "next/link";
import type { ReactNode } from "react";
import {
  LoadError,
  rcRenewalLabel,
  rcStatusLabel,
  stripePlanLabel,
  stripeStatusLabel,
} from "@/components/billing";
import { Empty, Table } from "@/components/ui";
import {
  getRcMonthlyRecurring,
  getRcOverview,
  getRcRevenue,
  getStripeRevenue,
  isStripePaying,
  listRcSubscriptions,
  listStripeSubscriptions,
  stripeMonthlyAmount,
} from "@/lib/billing";
import { formatDay, formatUsd, formatYen } from "@/lib/format";
import { listBillingRows } from "@/lib/queries";

export const dynamic = "force-dynamic";

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default async function BillingPage() {
  const [{ rows, userNames }, stripe, rcOverview, stripeRevenue, rcRevenue, rcMonthly] =
    await Promise.all([
      listBillingRows(),
      listStripeSubscriptions(),
      getRcOverview(),
      getStripeRevenue(),
      getRcRevenue(),
      getRcMonthlyRecurring(),
    ]);

  const rcRows = rows.filter((row) => row.provider === "revenucat");
  const rcResults = await Promise.all(
    rcRows.map(async (row) => ({ row, result: await listRcSubscriptions(row.id) })),
  );

  const rowByUser = new Map(rows.map((row) => [row.id, row]));
  const premiumRows = rows.filter((row) => row.premium);
  const noProviderPremium = premiumRows.filter((row) => !row.provider);

  const stripeSubscriptions = stripe.ok ? stripe.data : [];
  const stripePaying = stripeSubscriptions.filter(isStripePaying);
  const rcActive = rcResults.flatMap(({ row, result }) =>
    result.ok ? result.data.filter((s) => s.givesAccess).map((s) => ({ row, subscription: s })) : [],
  );

  // 年額は 12 で割って月額に直す。円以外の契約は足し合わせられないので数えない
  const stripeMonthly = stripePaying
    .filter((subscription) => subscription.currency === "jpy")
    .reduce((sum, subscription) => sum + stripeMonthlyAmount(subscription), 0);
  const monthlyTotal = stripeMonthly + (rcMonthly.ok ? rcMonthly.data : 0);
  const monthlyPartial = !stripe.ok || !rcMonthly.ok;

  const stripeGross = stripeRevenue.ok ? stripeRevenue.data.gross : 0;
  const rcGross = rcRevenue.ok ? rcRevenue.data.gross : 0;
  const stripeNet = stripeRevenue.ok ? stripeRevenue.data.net : 0;
  const rcNet = rcRevenue.ok ? rcRevenue.data.net : 0;
  const revenuePartial = !stripeRevenue.ok || !rcRevenue.ok;

  const months = [
    ...new Set([
      ...(stripeRevenue.ok ? stripeRevenue.data.grossByMonth.keys() : []),
      ...(rcRevenue.ok ? rcRevenue.data.grossByMonth.keys() : []),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const monthly = months.map((month) => {
    const stripeAmount = stripeRevenue.ok ? (stripeRevenue.data.grossByMonth.get(month) ?? 0) : 0;
    const rcAmount = rcRevenue.ok ? (rcRevenue.data.grossByMonth.get(month) ?? 0) : 0;
    return { month, stripeAmount, rcAmount, total: stripeAmount + rcAmount };
  });
  const maxMonthly = Math.max(1, ...monthly.map((row) => row.total));

  // DB と決済サービスの食い違い (webhook の取りこぼしなど)
  const mismatches: { userId: string | null; text: string }[] = [];
  if (stripe.ok) {
    const payingUsers = new Set(stripePaying.map((subscription) => subscription.userId));
    const payingCustomers = new Set(stripePaying.map((subscription) => subscription.customerId));
    for (const subscription of stripePaying) {
      const row = subscription.userId ? rowByUser.get(subscription.userId) : undefined;
      if (!row?.premium) {
        mismatches.push({
          userId: subscription.userId,
          text: "Stripe では有効な契約があるが、DB では Premium になっていない",
        });
      }
    }
    for (const row of premiumRows) {
      if (row.provider !== "stripe") continue;
      const paying =
        payingUsers.has(row.id) ||
        (row.stripe_customer_id !== null && payingCustomers.has(row.stripe_customer_id));
      if (!paying) {
        mismatches.push({
          userId: row.id,
          text: "DB では Stripe の Premium だが、Stripe に有効な契約が無い",
        });
      }
    }
  }
  for (const { row, result } of rcResults) {
    if (!result.ok) continue;
    const givesAccess = result.data.some((subscription) => subscription.givesAccess);
    if (row.premium && !givesAccess) {
      mismatches.push({
        userId: row.id,
        text: "DB では RevenueCat の Premium だが、RevenueCat に有効な契約が無い",
      });
    }
    if (!row.premium && givesAccess) {
      mismatches.push({
        userId: row.id,
        text: "RevenueCat では有効な契約があるが、DB では Premium になっていない",
      });
    }
  }

  const userLink = (userId: string | null) =>
    userId ? (
      <Link href={`/users/${userId}?tab=billing`} className="text-blue-700 hover:underline">
        {userNames.get(userId) || "(名前なし)"}
      </Link>
    ) : (
      "不明 (ユーザー ID なし)"
    );

  const kpis = [
    { label: "Premium (DB)", value: `${premiumRows.length} 人` },
    { label: "うち決済元なし", value: `${noProviderPremium.length} 人` },
    { label: "Stripe の有効な契約", value: stripe.ok ? `${stripePaying.length} 件` : "取得失敗" },
    { label: "RevenueCat の有効な契約", value: `${rcActive.length} 件` },
    { label: "DB との食い違い", value: `${mismatches.length} 件` },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold">課金サマリー</h1>
      <p className="mt-1 text-xs text-gray-500">
        DB・Stripe・RevenueCat をその場で読んでいます。アプリ内課金は RevenueCat が円に換算した値で、swim-hub・scanner・timer の合計です
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">これまでの売上の合計</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatYen(stripeGross + rcGross)}
            {revenuePartial && <span className="ml-2 text-sm text-red-700">一部取得できず</span>}
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-gray-600">Web (Stripe)</dt>
            <dd className="text-right tabular-nums">
              {stripeRevenue.ok ? formatYen(stripeGross) : "取得失敗"}
            </dd>
            <dt className="text-gray-600">アプリ内課金 (RevenueCat)</dt>
            <dd className="text-right tabular-nums">
              {rcRevenue.ok ? formatYen(rcGross) : "取得失敗"}
            </dd>
            <dt className="border-t border-gray-200 pt-1 text-gray-600">
              うち手取り (決済・ストア手数料を引いた後)
            </dt>
            <dd className="border-t border-gray-200 pt-1 text-right font-semibold tabular-nums">
              {formatYen(stripeNet + rcNet)}
            </dd>
          </dl>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">いま毎月入ってくる額 (手数料を引く前)</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatYen(monthlyTotal)}
            <span className="ml-1 text-base font-normal text-gray-500">/ 月</span>
            {monthlyPartial && <span className="ml-2 text-sm text-red-700">一部取得できず</span>}
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-gray-600">Web (Stripe)・{stripePaying.length} 件</dt>
            <dd className="text-right tabular-nums">
              {stripe.ok ? formatYen(stripeMonthly) : "取得失敗"}
            </dd>
            <dt className="text-gray-600">アプリ内課金 (RevenueCat)</dt>
            <dd className="text-right tabular-nums">
              {rcMonthly.ok ? formatYen(rcMonthly.data) : "取得失敗"}
            </dd>
            <dt className="border-t border-gray-200 pt-1 text-gray-600">年間に直すと</dt>
            <dd className="border-t border-gray-200 pt-1 text-right font-semibold tabular-nums">
              {formatYen(monthlyTotal * 12)}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-gray-500">
            年額の契約は 12 で割って月額に直しています。実際の入金は更新月にまとめて入ります
          </p>
        </div>
      </div>
      {stripeRevenue.ok && stripeRevenue.data.otherCurrencies.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          円以外の Stripe の取引 ({stripeRevenue.data.otherCurrencies.join(", ")}) は合計に入れていません
        </p>
      )}
      {[stripeRevenue, rcRevenue, rcMonthly].map(
        (result, index) =>
          !result.ok && (
            <div key={index} className="mt-2">
              <LoadError message={result.error} />
            </div>
          ),
      )}

      <Section title="月ごとの売上" note="手数料を引く前。新しい月が上">
        {monthly.length === 0 ? (
          <Empty>まだ売上がありません</Empty>
        ) : (
          <Table head={["月", "Web (Stripe)", "アプリ内課金", "合計", ""]}>
            {monthly.map((row) => (
              <tr key={row.month}>
                <td>{row.month}</td>
                <td className="text-right tabular-nums">{formatYen(row.stripeAmount)}</td>
                <td className="text-right tabular-nums">{formatYen(row.rcAmount)}</td>
                <td className="text-right font-semibold tabular-nums">{formatYen(row.total)}</td>
                <td className="w-1/2">
                  <div
                    className="h-2 rounded bg-blue-500"
                    style={{ width: `${Math.max(0, (row.total / maxMonthly) * 100)}%` }}
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <h2 className="mt-6 text-sm font-semibold">契約の状況</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="text-xs text-gray-500">{kpi.label}</div>
            <div className="text-lg font-bold tabular-nums">{kpi.value}</div>
          </div>
        ))}
      </div>

      <Section title="DB と決済サービスの食い違い">
        {mismatches.length === 0 ? (
          <Empty>食い違いはありません</Empty>
        ) : (
          <ul className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            {mismatches.map((mismatch, index) => (
              <li key={`${mismatch.userId}-${index}`} className="py-0.5">
                {userLink(mismatch.userId)}: {mismatch.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Stripe の契約" note="解約済みも含む全件。新しい順">
        {!stripe.ok ? (
          <LoadError message={stripe.error} />
        ) : stripeSubscriptions.length === 0 ? (
          <Empty>Stripe に契約がありません</Empty>
        ) : (
          <Table head={["ユーザー", "状態", "プラン", "開始", "次回更新 / 期間の終わり", "解約予約", "終了日"]}>
            {stripeSubscriptions.map((subscription) => (
              <tr key={subscription.id}>
                <td>{userLink(subscription.userId)}</td>
                <td>{stripeStatusLabel(subscription.status)}</td>
                <td>{stripePlanLabel(subscription)}</td>
                <td>{formatDay(subscription.createdAt)}</td>
                <td>{formatDay(subscription.currentPeriodEnd)}</td>
                <td>{subscription.cancelAtPeriodEnd ? "あり" : "-"}</td>
                <td>{formatDay(subscription.endedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="RevenueCat の契約"
        note="DB で決済元が RevenueCat になったことのあるユーザーの分。scanner / timer で買った契約も Premium になるので含めています"
      >
        {rcResults.length === 0 ? (
          <Empty>RevenueCat 経由のユーザーがいません</Empty>
        ) : (
          <Table
            head={["ユーザー", "状態", "アプリ", "商品", "ストア", "環境", "自動更新", "期間の終わり", "累計売上 (USD)"]}
          >
            {rcResults.flatMap(({ row, result }) => {
              if (!result.ok) {
                return [
                  <tr key={row.id}>
                    <td>{userLink(row.id)}</td>
                    <td colSpan={8} className="text-red-700">
                      取得できませんでした ({result.error})
                    </td>
                  </tr>,
                ];
              }
              if (result.data.length === 0) {
                return [
                  <tr key={row.id}>
                    <td>{userLink(row.id)}</td>
                    <td colSpan={8} className="text-gray-500">
                      RevenueCat に契約がありません
                    </td>
                  </tr>,
                ];
              }
              return result.data.map((subscription) => (
                <tr key={subscription.id}>
                  <td>{userLink(row.id)}</td>
                  <td>{rcStatusLabel(subscription.status)}</td>
                  <td>{subscription.appName}</td>
                  <td className="font-mono text-xs">{subscription.productName}</td>
                  <td>{subscription.store}</td>
                  <td>{subscription.environment}</td>
                  <td>{rcRenewalLabel(subscription)}</td>
                  <td>{formatDay(subscription.currentPeriodEndsAt)}</td>
                  <td className="text-right tabular-nums">{formatUsd(subscription.grossUsd)}</td>
                </tr>
              ));
            })}
          </Table>
        )}
      </Section>

      <Section
        title="RevenueCat の概況"
        note="RevenueCat のプロジェクト全体の値 (swim-hub・scanner・timer の合計、米ドル)"
      >
        {!rcOverview.ok ? (
          <LoadError message={rcOverview.error} />
        ) : rcOverview.data.length === 0 ? (
          <Empty>概況がありません</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
            {rcOverview.data.map((metric) => (
              <div key={metric.id} className="rounded-lg border border-gray-200 px-3 py-2">
                <div className="text-xs text-gray-500">{metric.name}</div>
                <div className="text-lg font-bold tabular-nums">
                  {metric.unit === "$" ? formatUsd(metric.value) : metric.value.toLocaleString()}
                </div>
                <div className="text-[11px] text-gray-500">{metric.description}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="決済元なしの Premium"
        note="DB では Premium だが、Stripe にも RevenueCat にも紐づいていない行"
      >
        {noProviderPremium.length === 0 ? (
          <Empty>該当するユーザーがいません</Empty>
        ) : (
          <Table head={["ユーザー", "状態", "Premium 期限", "作成日", "更新日"]}>
            {noProviderPremium.map((row) => (
              <tr key={row.id}>
                <td>{userLink(row.id)}</td>
                <td>{row.status ?? "-"}</td>
                <td>{row.premium_expires_at ? formatDay(row.premium_expires_at) : "無期限"}</td>
                <td>{formatDay(row.created_at)}</td>
                <td>{formatDay(row.updated_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
