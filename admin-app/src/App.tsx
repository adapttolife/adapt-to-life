import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Shell, NAV } from "./components/Shell";
import { TimeRange } from "./components/TimeRange";
import { api } from "./lib/api";
import { Empty } from "./components/Bits";

const Activity = lazy(() =>
  import("./routes/Activity").then((m) => ({ default: m.Activity })),
);
const Qr = lazy(() => import("./routes/Qr").then((m) => ({ default: m.Qr })));
const Directory = lazy(() =>
  import("./routes/Directory").then((m) => ({ default: m.Directory })),
);

const routeFromPath = () => {
  const match = location.pathname.match(/^\/admin(?:\/app)?\/?(\w+)?/);
  const id = match?.[1] ?? "activity";
  return NAV.some((item) => item.id === id && item.ready) ? id : "activity";
};

function Login() {
  const [status, setStatus] = useState("");
  return (
    <div className="lapsed">
      <h1>Admin dashboard</h1>
      <p>Enter an approved admin email and we’ll send a one-time sign-in link.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const email = new FormData(event.currentTarget).get("email");
          const response = await fetch("/admin/auth/request-link", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, origin: window.location.origin }),
          });
          const body = await response.json().catch(() => ({}));
          setStatus(
            body.ok
              ? "Check your email for a sign-in link."
              : body.error || "We could not send a sign-in link.",
          );
        }}
      >
        <label htmlFor="admin-email">Email address</label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <button className="btn" type="submit">
          Email me a sign-in link
        </button>
        <p role="status">{status}</p>
      </form>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(routeFromPath);
  const [days, setDays] = useState(90);
  const [you, setYou] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [lapsed, setLapsed] = useState(false);

  useEffect(() => {
    api
      .session()
      .then((data) => setYou(data.email))
      .catch(() => setLapsed(true))
      .finally(() => setChecking(false));
    const onPop = () => setRoute(routeFromPath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((id: string) => {
    history.pushState(null, "", id === "activity" ? "/admin" : `/admin/${id}`);
    setRoute(id);
  }, []);
  const onFail = useCallback(() => setLapsed(true), []);

  if (checking) return <div className="lapsed">Checking your session…</div>;
  if (lapsed) return <Login />;

  const meta: Record<string, { title: string; sub?: string }> = {
    activity: { title: "Activity", sub: "What happened, and what it produced." },
    qr: {
      title: "QR codes",
      sub: "Printed matter. The destination is data; the code never changes.",
    },
    directory: { title: "Adaptive Sports Near Me", sub: "Directory administration." },
  };
  const current = meta[route] ?? { title: route };
  return (
    <Shell
      route={route}
      onRoute={go}
      you={you}
      title={current.title}
      subtitle={current.sub}
      actions={
        route === "activity" ? <TimeRange days={days} onChange={setDays} /> : null
      }
    >
      <Suspense fallback={<Empty>Loading…</Empty>}>
        {route === "activity" && <Activity days={days} onFail={onFail} />}
        {route === "qr" && <Qr onFail={onFail} />}
        {route === "directory" && <Directory onFail={onFail} />}
        {!["activity", "qr", "directory"].includes(route) && (
          <Empty>Not built yet.</Empty>
        )}
      </Suspense>
    </Shell>
  );
}
