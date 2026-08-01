import { useEffect, useState } from "react";
import { api, AuthLapsed, type Analytics } from "../lib/api";
import { Panel, Stat, Empty, Loading } from "../components/Bits";
import { count, money, plural } from "../lib/format";
import { Bars, Sparkline } from "../components/Charts";

// The home page opens on what happened and what it produced (D2), which is what
// both reference consoles do. Money is the largest tile because it is the
// number the org is actually judged on.

export function Activity({ days, onFail }: { days: number; onFail: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setA(null); setErr(null);
    api.analytics(days)
      .then((d) => live && setA(d))
      .catch((e) => { if (e instanceof AuthLapsed) onFail(); else if (live) setErr(String(e.message)); });
    return () => { live = false; };
  }, [days, onFail]);

  if (err) return <Empty>Could not load activity: {err}</Empty>;
  if (!a) return <Loading what="activity" />;

  const dollars = a.gifts.reduce((s, g) => s + (g.dollars || 0), 0);
  const real = a.totals.scans - (a.totals.likely_bots || 0);
  const best = a.daily.length ? a.daily.reduce((m, r) => (r.n > m.n ? r : m), a.daily[0]) : null;

  return (
    <>
      <div className="stats">
        <Stat value={money(dollars)} label="raised via QR" tone="money"
              sub={a.gifts.length ? `across ${plural(a.gifts.length, "code")}` : "no gifts attributed yet"} />
        <Stat value={count(real)} label="scans"
              sub={a.totals.likely_bots ? `${count(a.totals.likely_bots)} bot scans excluded` : `last ${a.days} days`} />
        <Stat value={count(a.totals.cities)} label="places" sub="distinct cities" />
        <Stat value={count(a.byCode.length)} label="codes scanned" sub="of those minted" />
      </div>

      <Panel title="Scans per day"
             caption={best ? `Busiest was ${best.day} with ${count(best.n)}.` : `Last ${a.days} days.`}>
        {a.daily.length < 2
          ? <Empty>Not enough days yet to draw a trend.</Empty>
          : <Sparkline rows={a.daily} />}
      </Panel>

      <div className="grid-2">
        <Panel title="Scans by code" caption="Which physical surface people actually scan.">
          {a.byCode.length
            ? <Bars rows={a.byCode.map((r) => ({ k: `/q/${r.slug}`, v: r.n }))} />
            : <Empty>No scans yet. Print something and stick it somewhere.</Empty>}
        </Panel>
        <Panel title="Money by code" caption="The number a scan count cannot give you.">
          {a.gifts.length
            ? <Bars rows={a.gifts.map((g) => ({ k: `/q/${g.slug}`, v: g.dollars }))} fmt={money} />
            : <Empty>
                No gifts attributed yet. The chain is built and verified as far as the
                Givebutter form — it needs one real gift through a scanned code to close.
              </Empty>}
        </Panel>
      </div>
    </>
  );
}
