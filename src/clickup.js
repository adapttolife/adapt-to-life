// Everything a member of the public sends us lands in ClickUp. Nothing lands in
// Airtable.
//
// ClickUp is where ATL actually reviews work, so it is where a submission has to
// arrive. The grant application that came in through the old Airtable path sat at
// Status "New" from 2026-06-26 unread — not because the write failed, but because
// nobody opens that table. A record nobody opens is not a record.
//
// Both public forms are unchanged. Only the destination moved.
//
//   POST /api/apply   -> "Hustle & Heart — Applications"  (the applicant tracker)
//   POST /api/contact -> "Contacts"                       (everyone else)
//
// The third list, "Hustle & Heart — Awards", is the grant tracker. Nothing writes
// to it from here on purpose: an award is a human decision about money, opened by
// hand when an application reaches Approved. See docs/clickup-trackers.md.

const API = "https://api.clickup.com/api/v2";

// Field IDs are a schema contract with the lists, not a deploy toggle, so they
// live in code next to the mapping that uses them rather than in wrangler vars.
// Re-derive with: GET /api/v2/list/{list_id}/field
// If someone deletes and recreates a field in the UI its ID changes; that case is
// handled below by falling back to a task with no custom fields rather than
// dropping the submission.
//
// Email, Phone and "Last contacted" are space-level in ClickUp — the same field
// id appears on both lists, which is why one "Last contacted" means the same
// thing wherever you are standing.
const FIELD = {
  email: "af25d1b1-5ef1-48f7-ad51-870385e3f6ce",
  phone: "d78bed64-879b-44fc-9ec7-4c98da38ecfa",
  sport: "41742801-fb26-46d7-af09-100610486045",
  location: "11f7f6a9-a906-41f2-b974-c5317158bccb",
  amount: "60405dbb-d6cf-4360-894c-18e2452031a3",
  applied: "0a372d6b-9f79-4592-89d4-b1763ac6922e",
  stage: "3d3b96cf-da90-47ed-9133-bd8b3a7109e2",
};

const CONTACT_FIELD = {
  email: FIELD.email,
  phone: FIELD.phone,
  reason: "0a821fd5-28fa-45d7-b1ab-5c2b48dabb67",
  stage: "35554e2e-364b-4816-8d5c-77cdc29fa9d4",
  source: "abdfa01b-4a23-4a0f-8fdd-d392661c7ac9",
  received: "dd49ccb4-b7db-4a66-b38d-41ef49615d62",
};

// "Stage" is a dropdown rather than a native status because custom statuses are
// not writable through the ClickUp API — PUT /space/{id} accepts a statuses
// array, returns 200, and ignores it.
const STAGE_NEW = "11dcc191-244b-4263-b664-402efea16c29";
const CONTACT_STAGE_NEW = "d6d3763e-0952-4d73-aaa7-ae3f7a89f154";

// The contact form's "reaching out as" dropdown. A value that is not one of these
// is dropped rather than guessed — the message body still says what they want.
const REASON = {
  "Funding for an athlete": "72364ca3-bf9b-46bd-b1e2-6b91b69925dd",
  "Giving or sponsoring": "6fbb7a34-624d-422c-9408-2beb1cd2ee16",
  "A program for the directory": "c86b1dd2-ea41-4931-bb97-70048262d6d0",
  Volunteering: "30fb04f3-ed90-4f49-8f2f-54c9408c0c4f",
  "Something else": "56ebc4d0-b37c-433a-9a91-caf57cfb2cb7",
};

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

// Everything the sender wrote on the contact form. Same rule as above: the
// message body is the record, the fields are for routing and the staleness rung.
function describeContact({ email, phone, type, message, source }) {
  const rows = [
    ["Email", email],
    ["Phone", phone],
    ["Reaching out as", type],
  ].filter(([, v]) => v);

  let md = rows.map(([k, v]) => `**${k}:** ${v}`).join("\n");
  if (message) md += `\n\n**Their message**\n\n${message}`;
  md += `\n\n---\n\n${source || "Submitted through the contact form on adapttolife.org."}`;
  return md;
}

function contactFields(sub, now) {
  const fields = [
    { id: CONTACT_FIELD.stage, value: CONTACT_STAGE_NEW },
    { id: CONTACT_FIELD.received, value: now },
    { id: CONTACT_FIELD.email, value: sub.email },
  ];
  if (sub.phone) fields.push({ id: CONTACT_FIELD.phone, value: sub.phone });
  if (sub.source) fields.push({ id: CONTACT_FIELD.source, value: sub.source });
  if (REASON[sub.type]) fields.push({ id: CONTACT_FIELD.reason, value: REASON[sub.type] });
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

// One create, with the one property that matters: a submission is never lost to a
// custom field. If the create is rejected — almost always a field id that changed
// when someone recreated a field in the UI — retry with no fields at all. The
// description holds the whole submission either way, so a task that needs its
// Stage set by hand beats a member of the public who wrote to a nonprofit and
// vanished. Returns { ok: true, id, url } or { ok: false, error }. Never throws.
async function createTask(env, listId, label, name, markdown_description, custom_fields) {
  if (!listId || !env.CLICKUP_TOKEN) {
    return { ok: false, error: `ClickUp is not configured for ${label} (list id or token missing).` };
  }

  let res;
  try {
    res = await post(env, listId, { name, markdown_description, custom_fields });
  } catch (err) {
    console.error(`ClickUp ${label} request failed:`, err);
    return { ok: false, error: String(err) };
  }

  if (!res.ok) {
    const detail = await safeText(res);
    console.error(`ClickUp ${label} error`, res.status, detail);
    try {
      res = await post(env, listId, { name, markdown_description });
    } catch (err) {
      console.error(`ClickUp ${label} bare retry failed:`, err);
      return { ok: false, error: detail };
    }
    if (!res.ok) return { ok: false, error: await safeText(res) };
    console.error(`ClickUp ${label} saved WITHOUT custom fields — check the field ids`);
  }

  let task = null;
  try {
    task = await res.json();
  } catch {
    // Saved; we just could not read the body. Not a submission failure.
  }
  return { ok: true, id: task?.id, url: task?.url };
}

export async function createApplication(env, sub, now = Date.now()) {
  return createTask(
    env,
    env.CLICKUP_APPLICATIONS_LIST_ID,
    "apply",
    sub.sport ? `${sub.name} — ${sub.sport}` : sub.name,
    describe(sub),
    customFields(sub, now)
  );
}

export async function createContact(env, sub, now = Date.now()) {
  return createTask(
    env,
    env.CLICKUP_CONTACTS_LIST_ID,
    "contact",
    sub.type ? `${sub.name} — ${sub.type}` : sub.name,
    describeContact(sub),
    contactFields(sub, now)
  );
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}
