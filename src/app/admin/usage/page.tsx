import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AdminHeader } from "@/components/admin-header";
import { db } from "@/db";
import { getPrices } from "@/lib/ai/cost";
import { isDeveloper } from "@/lib/developer";
import { formatUsd, percentOfCap } from "@/lib/format";
import { requireCeo } from "@/lib/session";
import { getMonthSpendUsd, getMonthlyCapUsd, getTimezone } from "@/lib/settings";

// Billed chat replies plus other AI calls (briefing, ...), this month only.
function monthlyCalls(tz: string) {
  return {
    since: sql`(date_trunc('month', now() at time zone ${tz}) at time zone ${tz})`,
    calls: sql`(
      select user_id, coalesce(feature, 'chat') as feature, tokens_in, tokens_out, cost_usd, created_at
        from messages where cost_usd is not null
      union all
      select user_id, feature, tokens_in, tokens_out, cost_usd, created_at from ai_usage
    ) c`,
  };
}

const BAR = "bg-gradient-to-r from-violet-500 to-indigo-500";

function ShareRows({ rows }: { rows: { key: string; label: string; pct: number }[] }) {
  if (rows.length === 0) return <p className="card p-5 text-sm text-muted">No AI use yet this month.</p>;
  return (
    <ul className="card flex flex-col gap-3 p-4">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span className="capitalize">{r.label}</span>
            <span className="tabular-nums text-muted">{r.pct}%</span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className={`block h-full rounded-full ${BAR}`} style={{ width: `${r.pct}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What the CEO sees: each account's share of the month's use. No dollars, no token counts, no cap. */
async function SharesView({ tz }: { tz: string }) {
  const { since, calls } = monthlyCalls(tz);
  const [byUserRes, byFeatureRes] = await Promise.all([
    db.execute<{ name: string; tokens: string }>(sql`
      select coalesce(u.name, 'System') as name, coalesce(sum(c.tokens_in), 0) + coalesce(sum(c.tokens_out), 0) as tokens
        from ${calls} left join users u on u.id = c.user_id
       where c.created_at >= ${since}
       group by u.id, u.name`),
    db.execute<{ feature: string; tokens: string }>(sql`
      select c.feature, coalesce(sum(c.tokens_in), 0) + coalesce(sum(c.tokens_out), 0) as tokens
        from ${calls} where c.created_at >= ${since} group by c.feature`),
  ]);
  const shares = <T extends { tokens: string }>(rows: T[]) => {
    const total = rows.reduce((n, r) => n + Number(r.tokens), 0);
    return rows.map((r) => ({ ...r, pct: total > 0 ? Math.round((Number(r.tokens) / total) * 100) : 0 }));
  };
  const byUser = shares(byUserRes.rows).sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, "en"));
  const byFeature = shares(byFeatureRes.rows).sort((a, b) => b.pct - a.pct);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section aria-labelledby="by-user" className="flex flex-col gap-3">
        <h2 id="by-user" className="text-base font-semibold">Share of use by person, this month</h2>
        <ShareRows rows={byUser.map((r) => ({ key: r.name, label: r.name, pct: r.pct }))} />
      </section>
      <section aria-labelledby="by-feature" className="flex flex-col gap-3">
        <h2 id="by-feature" className="text-base font-semibold">Share of use by feature</h2>
        <ShareRows rows={byFeature.map((r) => ({ key: r.feature, label: r.feature, pct: r.pct }))} />
      </section>
    </div>
  );
}

/** What the developer sees: real cost, the cap, and per-person cost. */
async function CostView({ tz }: { tz: string }) {
  const [cap, spent] = await Promise.all([getMonthlyCapUsd(), getMonthSpendUsd(tz)]);
  const prices = getPrices();
  const pct = percentOfCap(spent, cap);
  const { since, calls } = monthlyCalls(tz);
  const [byUserRes, byFeatureRes, byDayRes] = await Promise.all([
    db.execute<{ name: string; calls: string; tokens: string; cost: string }>(sql`
      select coalesce(u.name, 'System') as name, count(*) as calls,
             coalesce(sum(c.tokens_in), 0) + coalesce(sum(c.tokens_out), 0) as tokens, coalesce(sum(c.cost_usd), 0) as cost
        from ${calls} left join users u on u.id = c.user_id
       where c.created_at >= ${since}
       group by u.id, u.name order by cost desc`),
    db.execute<{ feature: string; cost: string }>(sql`
      select c.feature, coalesce(sum(c.cost_usd), 0) as cost
        from ${calls} where c.created_at >= ${since} group by c.feature order by cost desc`),
    db.execute<{ day: string; cost: string }>(sql`
      select to_char(c.created_at at time zone ${tz}, 'YYYY-MM-DD') as day, coalesce(sum(c.cost_usd), 0) as cost
        from ${calls} where c.created_at >= ${since}
       group by 1 order by 1 desc limit 14`),
  ]);
  const byUser = byUserRes.rows.map((r) => ({ name: r.name, calls: Number(r.calls), tokens: Number(r.tokens), cost: Number(r.cost) }));
  const byFeature = byFeatureRes.rows.map((r) => ({ feature: r.feature, cost: Number(r.cost) }));
  const byDay = byDayRes.rows.map((r) => ({ day: r.day, cost: Number(r.cost) }));
  const maxDay = Math.max(...byDay.map((d) => d.cost), 0);

  return (
    <>
      <section aria-labelledby="cap" className="card flex flex-col gap-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="cap" className="text-base font-semibold">This month (developer view)</h2>
          <p className="text-sm text-muted">Cap {formatUsd(cap)}</p>
        </div>
        <p className="text-3xl font-semibold tabular-nums">{formatUsd(spent)}</p>
        <div
          role="progressbar"
          aria-label="Share of the monthly cap used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div className={`h-full rounded-full ${pct >= 90 ? "bg-danger" : BAR}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted">
          {pct}% used. Chat stops for everyone when the cap is reached; change it under Settings. The CEO does not see
          this page&apos;s dollar figures.
        </p>
        {prices.isFallback && (
          <p className="rounded-xl bg-notice-bg px-3 py-2 text-sm text-notice-fg">
            Token prices are not set (<code>OPENAI_PRICE_IN_PER_M</code> and <code>OPENAI_PRICE_OUT_PER_M</code> in the
            environment), so costs use a high safety estimate of ${prices.inPerM} in / ${prices.outPerM} out per million tokens.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="by-user" className="flex flex-col gap-3">
          <h2 id="by-user" className="text-base font-semibold">By person</h2>
          {byUser.length === 0 ? (
            <p className="card p-5 text-sm text-muted">No AI use yet this month.</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 text-right font-medium">Replies</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tokens</th>
                    <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {byUser.map((r) => (
                    <tr key={r.name}>
                      <td className="px-4 py-2.5 font-sans">{r.name}</td>
                      <td className="px-4 py-2.5 text-right">{r.calls}</td>
                      <td className="px-4 py-2.5 text-right">{r.tokens.toLocaleString("en")}</td>
                      <td className="px-4 py-2.5 text-right">{formatUsd(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="by-feature" className="flex flex-col gap-3">
            <h2 id="by-feature" className="text-base font-semibold">By feature</h2>
            {byFeature.length === 0 ? (
              <p className="card p-5 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="card divide-y divide-line">
                {byFeature.map((f) => (
                  <li key={f.feature} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="capitalize">{f.feature}</span>
                    <span className="tabular-nums">{formatUsd(f.cost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="by-day" className="flex flex-col gap-3">
            <h2 id="by-day" className="text-base font-semibold">Recent days</h2>
            {byDay.length === 0 ? (
              <p className="card p-5 text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="card flex flex-col gap-2.5 p-4">
                {byDay.map((d) => (
                  <li key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted tabular-nums">{d.day}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${BAR}`}
                        style={{ width: `${maxDay > 0 ? Math.max(3, Math.round((d.cost / maxDay) * 100)) : 0}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums">{formatUsd(d.cost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

async function Usage() {
  const user = await requireCeo();
  const tz = await getTimezone();
  const dev = isDeveloper({ role: user.role, username: user.username });
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <AdminHeader current="usage" title="AI usage" />
      {dev ? <CostView tz={tz} /> : <SharesView tz={tz} />}
    </main>
  );
}

export default function AdminUsagePage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Usage />
    </Suspense>
  );
}
