import { type ReactNode } from "react";

export function Panel({ title, caption, right, children }: {
  title?: string; caption?: string; right?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="panel">
      {(title || right) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {caption && <p className="cap">{caption}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ value, label, sub, tone }: {
  value: ReactNode; label: string; sub?: string; tone?: "money";
}) {
  return (
    <div className="stat">
      <div className={"stat-v" + (tone === "money" ? " money" : "")}>{value}</div>
      <div className="stat-k">{label}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

// An empty state that teaches (Spec 127 principle 6). A bare zero tells you
// nothing about whether the pipe is broken or the world is quiet.
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Loading({ what }: { what: string }) {
  return <div className="empty">Loading {what}…</div>;
}
