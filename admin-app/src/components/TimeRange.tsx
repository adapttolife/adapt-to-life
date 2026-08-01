// ONE range control for the whole console (Spec 127 principle 4), not a picker
// per panel. Both reference consoles do this, and the reason is that a reader
// comparing two panels has to be able to trust they cover the same window.

export const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

export function TimeRange({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r.days}
          className={"seg" + (days === r.days ? " on" : "")}
          onClick={() => onChange(r.days)}
          aria-pressed={days === r.days}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
