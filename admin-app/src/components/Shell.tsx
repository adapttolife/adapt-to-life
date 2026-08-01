import { type ReactNode } from "react";
import { Logo } from "./Logo";

// The console frame: persistent nav on the left, one page title and one primary
// action on the right. Spec 127 principle 1 — a console is a place, not a
// report. You should always be able to answer "where am I" and "what is the
// verb here" without reading anything.

export interface NavItem { id: string; label: string; hint?: string; ready: boolean }

export const NAV: NavItem[] = [
  { id: "activity", label: "Activity", hint: "what happened", ready: true },
  { id: "qr", label: "QR codes", hint: "printed matter", ready: true },
  { id: "money", label: "Money", hint: "gifts and funds", ready: false },
  { id: "applications", label: "Applications", hint: "Hustle & Heart", ready: false },
  { id: "waivers", label: "Waivers", ready: false },
  { id: "content", label: "Content", hint: "campaigns", ready: false },
  { id: "traffic", label: "Traffic", ready: false },
];

export function Shell({
  route, onRoute, you, title, subtitle, actions, children,
}: {
  route: string; onRoute: (id: string) => void; you: string | null;
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <Logo size={22} />
          <span>Mission Control</span>
        </div>
        <div className="nav-items">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={"nav-item" + (route === n.id ? " on" : "") + (n.ready ? "" : " soon")}
              onClick={() => n.ready && onRoute(n.id)}
              disabled={!n.ready}
              /* Sections that do not exist yet are shown, dimmed, rather than
                 hidden. The shape of the whole console is itself information —
                 and it stops "is that built yet?" being a question. */
              title={n.ready ? n.hint : "not built yet"}
            >
              <span>{n.label}</span>
              {!n.ready && <span className="soon-tag">soon</span>}
            </button>
          ))}
        </div>
        <div className="nav-foot">
          <div className="mono who">{you ?? "…"}</div>
          <a href="/" className="nav-link">adapttolife.org ↗</a>
        </div>
      </nav>

      <main className="main">
        <header className="page-head">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="sub">{subtitle}</p>}
          </div>
          <div className="actions">{actions}</div>
        </header>
        {children}
      </main>
    </div>
  );
}
