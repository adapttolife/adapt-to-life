import { useMemo, useState } from "react";
import { geoAlbersUsa } from "d3-geo";
import { BASEMAP_W, BASEMAP_H, BASEMAP_OUTLINE, BASEMAP_INTERIOR } from "../lib/basemap";
import { count } from "../lib/format";

// A real basemap, which Spec 116 deliberately did NOT ship and Spec 127
// reverses on purpose. That call was right for a hand-rolled SVG on one page —
// a world outline to give one dot context was not worth the weight. It stops
// being right once a projection is already here: the outline is precomputed at
// build time into a path string, and the same projection places the points, so
// a dot cannot drift out of its own state.
//
// What does NOT change is the honesty. These are city centroids from IP
// geolocation. The halo is the point: it says "somewhere in this city" before
// the mark says "this many", and there are still no coordinates to read off it.

export interface Place {
  city: string; region: string; country: string; lat: string; lon: string; n: number;
}

export function PlacesMap({ places }: { places: Place[] }) {
  const [table, setTable] = useState(false);
  const projection = useMemo(() => geoAlbersUsa().fitSize([BASEMAP_W, BASEMAP_H], { type: "Sphere" } as never), []);

  const pts = useMemo(() => {
    const max = Math.max(...places.map((p) => p.n), 1);
    return places
      .map((p) => {
        const xy = projection([+p.lon, +p.lat]);
        // geoAlbersUsa returns null outside the US — a real answer, not an
        // error. Those places are dropped from the MAP and kept in the table,
        // so a scan from abroad never silently disappears from the numbers.
        return xy ? { ...p, x: xy[0], y: xy[1], r: 5 + 13 * Math.sqrt(p.n / max), t: p.n / max } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.n - a.n);
  }, [places, projection]);

  const offMap = places.length - pts.length;
  const ramp = ["var(--mag-1)", "var(--mag-2)", "var(--mag-3)", "var(--mag-4)", "var(--mag-5)"];

  // Greedy label placement. Cities cluster hard — Antioch, Chicago and
  // Milwaukee sit within a degree — and the first version of this on the old
  // page stacked three labels on one spot. A label that cannot be placed clear
  // is dropped; the tooltip and the table still carry it.
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const labels = pts.slice(0, 12).map((p) => {
    const txt = `${p.city} (${count(p.n)})`;
    const w = txt.length * 5.6, h = 12;
    const slots = [
      [p.x + p.r + 6, p.y + 4], [p.x - p.r - 6 - w, p.y + 4],
      [p.x - w / 2, p.y - p.r - 6], [p.x - w / 2, p.y + p.r + 13],
    ];
    for (const [sx, sy] of slots) {
      const box = { x: sx, y: sy - h, w, h };
      if (placed.some((q) => box.x < q.x + q.w && box.x + w > q.x && box.y < q.y + q.h && box.y + h > q.y)) continue;
      placed.push(box);
      return { key: p.city, x: sx, y: sy, txt };
    }
    return null;
  }).filter(Boolean) as { key: string; x: number; y: number; txt: string }[];

  if (!places.length) return <div className="empty">No located scans yet.</div>;

  return (
    <>
      <svg viewBox={`0 0 ${BASEMAP_W} ${BASEMAP_H}`} width="100%" className="chart map" role="img">
        <path d={BASEMAP_INTERIOR} fill="none" stroke="var(--grid)" strokeWidth={0.7} />
        <path d={BASEMAP_OUTLINE} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
        {pts.map((p) => (
          <g key={p.city}>
            <circle cx={p.x} cy={p.y} r={p.r + 11} fill={ramp[Math.min(4, Math.floor(p.t * 4))]} opacity={0.16} />
            <circle cx={p.x} cy={p.y} r={p.r} fill={ramp[Math.min(4, Math.floor(p.t * 4))]}
                    stroke="var(--surface)" strokeWidth={1.5} />
            <title>{`${p.city}, ${p.region} — ${count(p.n)} scans`}</title>
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} className="maplbl">{l.txt}</text>
        ))}
      </svg>

      <p className="cap">
        Each halo is a whole city, located from the network — never GPS. There are no
        coordinates to read off this and nothing street-level in it.
        {offMap > 0 && ` ${offMap} place${offMap === 1 ? "" : "s"} outside the US, in the table below.`}
      </p>

      <button className="linkbtn" onClick={() => setTable((t) => !t)}>
        {table ? "hide table" : "table view"}
      </button>
      {table && (
        <table className="dt">
          <tbody>
            {places.map((p) => (
              <tr key={p.city + p.region}>
                <td>{p.city}<span className="dim">, {p.region || p.country}</span></td>
                <td className="num">{count(p.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
