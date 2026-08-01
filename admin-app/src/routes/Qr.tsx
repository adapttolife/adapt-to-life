import { useEffect, useState } from "react";
import { api, AuthLapsed, type Code, type HistoryEvent } from "../lib/api";
import { Panel, Empty, Loading } from "../components/Bits";
import { money, count, ago } from "../lib/format";

// The QR section, ported. P1's job is to prove the migration on a section that
// already works — so this deliberately does not gain features. Anything new
// here would muddy whether the shell is sound or just different.
//
// Mutations (mint, repoint, retire) still live on the old /admin/qr page for
// now. Read-only first: if the shell is wrong, the cheapest time to find out is
// before write paths are duplicated into it.

export function Qr({ onFail }: { onFail: () => void }) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([api.codes(), api.history()])
      .then(([c, h]) => { if (live) { setCodes(c.codes); setEvents(h.events); } })
      .catch((e) => { if (e instanceof AuthLapsed) onFail(); else if (live) setErr(String(e.message)); });
    return () => { live = false; };
  }, [onFail]);

  if (err) return <Empty>Could not load codes: {err}</Empty>;
  if (!codes) return <Loading what="codes" />;

  return (
    <>
      <Panel>
        <table className="dt wide">
          <thead>
            <tr><th>Code</th><th>Points at</th><th className="num">Scans</th><th className="num">Raised</th><th>Last scan</th></tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.slug} className={c.active ? "" : "retired"}>
                <td>
                  <div className="mono strong">/q/{c.slug}</div>
                  <div className="dim">{c.label}{c.active ? "" : " — retired"}</div>
                </td>
                <td className="mono break">{c.dest}
                  {c.rule === "campaign-follow" && <span className="tag">follows the live drive</span>}
                </td>
                <td className="num">{count(c.scans.scans)}</td>
                <td className={"num" + (c.money.dollars ? " money" : " zero")}>{money(c.money.dollars)}</td>
                <td className="dim">{ago(c.scans.last_scan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="foot">
          Minting, repointing and retiring stay on <a href="/admin/qr">the original page</a> until
          the shell is proven. Read-only here on purpose.
        </p>
      </Panel>

      <Panel title="What changed">
        {events.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <table className="dt">
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="dim nowrap">{new Date(e.at).toLocaleString("en-US",
                    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td>
                    <span className="mono strong">/q/{e.slug}</span>{" "}
                    {e.action === "repoint"
                      ? <>repointed from <code>{e.old_dest}</code> to <code>{e.new_dest}</code></>
                      : <>{e.action}{e.new_dest ? <> → <code>{e.new_dest}</code></> : null}</>}
                  </td>
                  <td className="dim mono nowrap">{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
