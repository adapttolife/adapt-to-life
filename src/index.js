// Adapt To Life — Worker entry.
// Serves the static site (env.ASSETS) and handles form submissions at /api/contact,
// writing leads to Airtable. The Airtable token stays server-side (Worker secret).

const LEAD_TYPES = [
  "An athlete interested in funding",
  "A program or organization",
  "A potential donor or sponsor",
  "Media or press",
  "A volunteer",
  "Something else",
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleContact(request, env);
    }

    if (url.pathname === "/api/apply") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleApply(request, env);
    }

    // Everything else: the static site.
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await request.json();
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form);
    }
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, store nothing.
  if (str(data.company)) return json({ ok: true });

  const firstName = str(data.fn);
  const lastName = str(data.ln);
  const email = str(data.em);
  const type = str(data.rsn);
  const message = str(data.msg);
  const name = `${firstName} ${lastName}`.trim();
  // Optional client-supplied attribution (e.g. an ambassador page). Capped; falls back to the default.
  const source = str(data.source).slice(0, 80);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name && !message) {
    return json({ ok: false, error: "Please add your name or a message." }, 422);
  }

  const fields = {
    Name: name || "(no name given)",
    Email: email,
    Message: message,
    Status: "New",
    Source: source || "Website — contact form",
  };
  if (LEAD_TYPES.includes(type)) fields.Type = type;

  let res;
  try {
    res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );
  } catch (err) {
    console.error("Airtable request failed:", err);
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  if (!res.ok) {
    console.error("Airtable error", res.status, await safeText(res));
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  return json({ ok: true });
}

async function handleApply(request, env) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, store nothing.
  if (str(data.company)) return json({ ok: true });

  const name = `${str(data.fn)} ${str(data.ln)}`.trim();
  const email = str(data.em);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name) {
    return json({ ok: false, error: "Please add your name." }, 422);
  }

  const fields = {
    Name: name,
    Email: email,
    Phone: str(data.phone),
    Sport: str(data.sport),
    Location: str(data.location),
    Need: str(data.need),
    "Estimated Cost": str(data.cost),
    About: str(data.about),
    Status: "New",
    Source: "Website — apply form",
  };

  let res;
  try {
    res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_APPLICATIONS_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );
  } catch (err) {
    console.error("Airtable apply request failed:", err);
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  if (!res.ok) {
    console.error("Airtable apply error", res.status, await safeText(res));
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  return json({ ok: true });
}

function str(v) {
  return (typeof v === "string" ? v : "").trim().slice(0, 5000);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return "(no body)"; }
}
