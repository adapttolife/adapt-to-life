import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Shell, NAV } from "./components/Shell";
import { TimeRange } from "./components/TimeRange";
// Split by ROUTE. The initial download is then the shell and React, and each
// section arrives when someone asks for it. Without this the entry sat at 94%
// of its budget with five phases still to build — every future section would
// have been a fight with a number instead of a design decision.
const Activity = lazy(() => import("./routes/Activity").then((m) => ({ default: m.Activity })));
const Qr = lazy(() => import("./routes/Qr").then((m) => ({ default: m.Qr })));
import { api } from "./lib/api";
import { Empty } from "./components/Bits";

// Routing is a path read and a pushState — no router dependency. Two routes do
// not need one, and the moment they do it is a contained change.
const routeFromPath = () => {
  const m = location.pathname.match(/^\/admin\/app\/?(\w+)?/);
  const id = m?.[1] ?? "activity";
  return NAV.some((n) => n.id === id && n.ready) ? id : "activity";
};

export default function App() {
  const [route, setRoute] = useState(routeFromPath);
  const [days, setDays] = useState(90);
  const [you, setYou] = useState<string | null>(null);
  const [lapsed, setLapsed] = useState(false);

  useEffect(() => {
    api.codes().then((d) => setYou(d.you)).catch(() => setYou(null));
    const onPop = () => setRoute(routeFromPath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((id: string) => {
    history.pushState(null, "", id === "activity" ? "/admin/app/" : `/admin/app/${id}`);
    setRoute(id);
  }, []);

  const onFail = useCallback(() => setLapsed(true), []);

  // An expired Access session must never render as "no data" — that reads as
  // a broken console rather than a lapsed login, and the fix is one click.
  if (lapsed) {
    return (
      <div className="lapsed">
        <h1>Session expired</h1>
        <p>Cloudflare Access needs you to sign in again.</p>
        <a className="btn" href={location.href}>Sign in</a>
      </div>
    );
  }

  const meta: Record<string, { title: string; sub?: string }> = {
    activity: { title: "Activity", sub: "What happened, and what it produced." },
    qr: { title: "QR codes", sub: "Printed matter. The destination is data; the code never changes." },
  };
  const m = meta[route] ?? { title: route };

  return (
    <Shell
      route={route} onRoute={go} you={you}
      title={m.title} subtitle={m.sub}
      actions={route === "activity" ? <TimeRange days={days} onChange={setDays} /> : null}
    >
      <Suspense fallback={<Empty>Loading…</Empty>}>
        {route === "activity" && <Activity days={days} onFail={onFail} />}
        {route === "qr" && <Qr onFail={onFail} />}
        {!["activity", "qr"].includes(route) && <Empty>Not built yet.</Empty>}
      </Suspense>
    </Shell>
  );
}
