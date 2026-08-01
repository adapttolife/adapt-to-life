import { count } from "../lib/format";

// Part-to-whole, few classes: one stacked bar with EVERY segment directly
// labelled. The labels are not decoration — the validated categorical set has
// one member under 3:1 on this surface, so the relief rule applies and colour
// is never the only thing carrying identity.
//
// Categorical hues are assigned in fixed order and never cycled. A fourth class
// folds into "other" in neutral grey rather than inventing a hue, because a
// generated fourth colour is indistinguishable from an existing one under CVD.
export function Split({ rows }: { rows: { k: string; n: number }[] }) {
  const total = rows.reduce((t, r) => t + r.n, 0);
  if (!total) return <div className="empty">No scans yet.</div>;

  const hues = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)"];
  const top = rows.slice(0, 3).map((r, i) => ({ ...r, c: hues[i] }));
  const rest = rows.slice(3);
  if (rest.length) top.push({ k: "other", n: rest.reduce((t, r) => t + r.n, 0), c: "var(--cat-other)" });

  let x = 0;
  return (
    <>
      <svg viewBox="0 0 560 24" width="100%" height={24} className="chart" role="img">
        {top.map((r) => {
          const w = 560 * (r.n / total);
          const el = (
            <rect key={r.k} x={x} y={0} width={Math.max(0, w - 2)} height={20} rx={4} fill={r.c}>
              <title>{`${r.k} — ${count(r.n)} of ${count(total)}`}</title>
            </rect>
          );
          x += w;   /* 2px surface gap between fills, not a stroke */
          return el;
        })}
      </svg>
      <div className="legend">
        {top.map((r) => (
          <span key={r.k}><i style={{ background: r.c }} />{r.k} <b>{Math.round((r.n / total) * 100)}%</b></span>
        ))}
      </div>
    </>
  );
}
