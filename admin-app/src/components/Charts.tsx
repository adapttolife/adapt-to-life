import { useState } from "react";
import { count } from "../lib/format";

// Charts for P1, hand-rolled in SVG.
//
// I installed Observable Plot and d3-geo while scaffolding and then took them
// back out: nothing in P1 needs them. These two forms are a horizontal bar and
// a sparkline, both of which are less code direct than configured, and neither
// is where a grammar-of-graphics library earns its keep. Plot comes back in P2
// for the map, where a projection is real work. Shipping a dependency against a
// future need is how a bundle budget dies quietly.
//
// The rules these follow are not preference. Nominal categories get ONE hue —
// a darker-where-bigger ramp double-encodes bar length as colour, which is a
// documented anti-pattern. Grid is hairline and never dashed. Values are direct
// labels rather than an axis to squint at. Text wears ink tokens, never the
// series colour.

export function Bars({ rows, fmt }: { rows: { k: string; v: number }[]; fmt?: (n: number) => string }) {
  const [table, setTable] = useState(false);
  const max = Math.max(...rows.map((r) => r.v), 1);
  const rowH = 30, padL = 104, padR = 74, W = 560;
  const H = rows.length * rowH + 8;
  const f = fmt ?? count;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="chart" role="img">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={padL + (W - padL - padR) * t} y1={0}
                x2={padL + (W - padL - padR) * t} y2={H - 8}
                stroke="var(--grid)" strokeWidth={1} />
        ))}
        {rows.map((r, i) => {
          const y = i * rowH + 4;
          const bw = Math.max(2, (W - padL - padR) * (r.v / max));
          return (
            <g key={r.k} className="bar-g">
              <text x={padL - 10} y={y + 14} textAnchor="end" className="lbl">{r.k}</text>
              {/* 4px rounded data-end, anchored to the baseline. */}
              <rect x={padL} y={y} width={bw} height={18} rx={4} fill="var(--accent)" />
              <text x={padL + bw + 8} y={y + 14} className="val">{f(r.v)}</text>
              <title>{`${r.k} — ${f(r.v)}`}</title>
            </g>
          );
        })}
        <line x1={padL} y1={0} x2={padL} y2={H - 8} stroke="var(--line-strong)" strokeWidth={1} />
      </svg>
      <button className="linkbtn" onClick={() => setTable((t) => !t)}>
        {table ? "hide table" : "table view"}
      </button>
      {table && (
        <table className="dt">
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}><td>{r.k}</td><td className="num">{f(r.v)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// A trend's meaning lives in its SHAPE, which is why this survives shrinking
// where a labelled chart does not — the lesson the QR dashboard paid for on
// mobile. Ticks are minimal on purpose; the caption carries the numbers.
export function Sparkline({ rows }: { rows: { day: string; n: number }[] }) {
  const W = 1000, H = 150, padL = 34, padR = 10, padT = 10, padB = 20;
  const max = Math.max(...rows.map((r) => r.n), 1);
  const x = (i: number) => padL + (W - padL - padR) * (rows.length === 1 ? 0 : i / (rows.length - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const d = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r.n).toFixed(1)}`).join(" ");
  const area = `${d} L${x(rows.length - 1).toFixed(1)} ${H - padB} L${padL} ${H - padB} Z`;
  const peak = rows.reduce((m, r, i) => (r.n > rows[m].n ? i : m), 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="chart" role="img">
      {[0, 0.5, 1].map((t) => {
        const yy = padT + (H - padT - padB) * t;
        return (
          <g key={t}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--grid)" strokeWidth={1} />
            <text x={padL - 8} y={yy + 3} textAnchor="end" className="tick">{Math.round(max * (1 - t))}</text>
          </g>
        );
      })}
      <path d={area} fill="var(--accent)" opacity={0.13} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(peak)} cy={y(rows[peak].n)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
      <text x={padL} y={H - 5} className="tick">{rows[0].day.slice(5)}</text>
      <text x={W - padR} y={H - 5} textAnchor="end" className="tick">{rows[rows.length - 1].day.slice(5)}</text>
    </svg>
  );
}
