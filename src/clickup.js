// Hustle & Heart grant applications land in ClickUp, not Airtable.
//
// ClickUp is where Alec actually reviews ATL work, so it is where an application
// has to arrive. The one application that came in through the old Airtable path
// sat at Status "New" from 2026-06-26 unread — not because Airtable failed, but
// because nobody looks there. A record nobody opens is not a record.
//
// The /apply page is unchanged. Only the destination moved.

const API = "https://api.clickup.com/api/v2";

// Field IDs for the "Hustle & Heart — Applications" list. These are a schema
// contract with the list, not a deploy toggle, so they live in code next to the
// mapping that uses them rather than in wrangler vars. Re-derive with:
//   GET /api/v2/list/$CLICKUP_APPLICATIONS_LIST_ID/field
// If someone deletes and recreates a field in the UI its ID changes; that case
// is handled below by falling back to a task with no custom fields rather than
// dropping the submission.
const FIELD = {
  email: "af25d1b1-5ef1-48f7-ad51-870385e3f6ce",
  phone: "d78bed64-879b-44fc-9ec7-4c98da38ecfa",
  sport: "41742801-fb26-46d7-af09-100610486045",
  location: "11f7f6a9-a906-41f2-b974-c5317158bccb",
  amount: "60405dbb-d6cf-4360-894c-18e2452031a3",
  applied: "0a372d6b-9f79-4592-89d4-b1763ac6922e",
  stage: "3d3b96cf-da90-47ed-9133-bd8b3a7109e2",
};

// "Stage" is a dropdown rather than a native status because custom statuses are
// not writable through the ClickUp API — PUT /space/{id} accepts a statuses
// array, returns 200, and ignores it.
const STAGE_NEW = "11dcc191-244b-4263-b664-402efea16c29";

// The applicant types this freehand ("$3,000 for a racing chair", "not sure",
// "3-5k"). Only fill the currency field when the number is unambiguous: a $
// amount, or a field that is nothing but a number. Anything looser guesses, and
// a wrong figure in "Amount requested" reads as verified when it is not — a
// blank one makes a human open the application, which is the correct outcome.
// The raw string is always preserved in the description regardless.
export function parseAmount(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const explicit = s.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/);
  const bare = s.match(/^(\d[\d,]*(?:\.\d+)?)\s*(?:usd|dollars?)?$/i);
  const hit = explicit || bare;
  if (!hit) return null;
  const n = Number(hit[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Everything the applicant wrote, in the order the form asks for it. This is the
// lossless copy: the custom fields above are for filtering and the staleness
// rung, but no submitted text may exist only in a field that could fail to set.
function describe({ email, phone, sport, location, need, cost, about }) {
  const rows = [
    ["Email", email],
    ["Phone", phone],
    ["Sport or activity", sport],
    ["Based in", location],
    ["Rough cost, as written", cost],
  ].filter(([, v]) => v);

  let md = rows.map(([k, v]) => `**${k}:** ${v}`).join("\n");
  if (need) md += `\n\n**What would funding help with?**\n\n${need}`;
  if (about) md += `\n\n**About them**\n\n${about}`;
  md += `\n\n---\n\nSubmitted through the apply form on adapttolife.org.`;
  return md;
}

function customFields(sub, now) {
  const amount = parseAmount(sub.cost);
  const fields = [
    { id: FIELD.stage, value: STAGE_NEW },
    { id: FIELD.applied, value: now },
    { id: FIELD.email, value: sub.email },
  ];
  if (sub.phone) fields.push({ id: FIELD.phone, value: sub.phone });
  if (sub.sport) fields.push({ id: FIELD.sport, value: sub.sport });
  if (sub.location) fields.push({ id: FIELD.location, value: sub.location });
  if (amount !== null) fields.push({ id: FIELD.amount, value: amount });
  return fields;
}

async function post(env, listId, body) {
  return fetch(`${API}/list/${listId}/task`, {
    method: "POST",
    headers: {
      // ClickUp personal tokens go in Authorization raw — a "Bearer " prefix 401s.
      Authorization: env.CLICKUP_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Returns { ok: true, id, url } or { ok: false, error }. Never throws.
export async function createApplication(env, sub, now = Date.now()) {
  const listId = env.CLICKUP_APPLICATIONS_LIST_ID;
  if (!listId || !env.CLICKUP_TOKEN) {
    return { ok: false, error: "ClickUp is not configured (list id or token missing)." };
  }

  const name = sub.sport ? `${sub.name} — ${sub.sport}` : sub.name;
  const markdown_description = describe(sub);

  let res;
  try {
    res = await post(env, listId, {
      name,
      markdown_description,
      custom_fields: customFields(sub, now),
    });
  } catch (err) {
    console.error("ClickUp apply request failed:", err);
    return { ok: false, error: String(err) };
  }

  // A bad custom-field id (someone recreated a field in the UI) rejects the whole
  // create. The description already holds the entire submission, so retry without
  // the fields: a task that needs its Stage set by hand beats a lost application.
  if (!res.ok) {
    const detail = await safeText(res);
    console.error("ClickUp apply error", res.status, detail);
    try {
      res = await post(env, listId, { name, markdown_description });
    } catch (err) {
      console.error("ClickUp apply bare retry failed:", err);
      return { ok: false, error: detail };
    }
    if (!res.ok) return { ok: false, error: await safeText(res) };
    console.error("ClickUp apply saved WITHOUT custom fields — check the field ids");
  }

  let task = null;
  try {
    task = await res.json();
  } catch {
    // Saved; we just could not read the body. Not a submission failure.
  }
  return { ok: true, id: task?.id, url: task?.url };
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}
