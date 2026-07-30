// Waiver / release e-signature — Cloudflare-native.
// Same shape as the other /api handlers: honeypot -> Turnstile -> validate -> act.
// "Act" = render a clean, branded signed PDF (document + signature certificate) with
// pdf-lib, hash it for tamper-evidence, store it in R2, log a full audit row in D1,
// and return an unguessable download link. No external server, no SMTP.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cfSend, houseShell } from "./email.js";

// ---------------------------------------------------------------------------
// Document model — SINGLE SOURCE OF TRUTH for both the on-screen text and the
// generated PDF (the page fetches it from /api/waiver/doc, the PDF renders from
// the same object). Editing the wording here changes both, and bumping VERSION
// records exactly which text each signer agreed to (also changes doc_sha256).
// ---------------------------------------------------------------------------
const VERSION = "media-release-2026-06-27-v3";

// ONE universal release for the whole organization. Adapt To Life NFP is the legal
// entity; Adaptive Sports Near Me and everything else sit underneath it, so a single
// signed release covers all current and future projects. Drafted for multi-state use:
// written consent (a defense to right-of-publicity claims everywhere), an irrevocable
// grant supported by consideration, guardian authority for minors, ESIGN/UETA
// electronic-records consent, binding-effect + Illinois governing law with a savings
// clause. Kept as lean as the legal coverage allows. NOT legal advice; have IL counsel
// review before production. Bumping VERSION re-stamps every PDF and changes doc_sha256.
const DOC = {
  org: "Adapt To Life NFP",
  domains: "adapttolife.org  ·  adaptivesportsnearme.com",
  title: "Photo, Video, and Media Release",
  version: VERSION,
  intro:
    "By signing below, you give Adapt To Life NFP permission to take and use photos, video, and recordings of you (or your child) from our programs and activities. Please read it. It explains how the materials may be used, your consent to sign electronically, and how to withdraw permission.",
  sections: [
    { h: "Who this is with", p: [
      "Adapt To Life NFP is an Illinois not-for-profit corporation, tax-exempt under Section 501(c)(3) of the Internal Revenue Code (EIN 41-3213344). This release covers Adapt To Life NFP and all of its programs, projects, and initiatives, including Adaptive Sports Near Me (adaptivesportsnearme.com), now and in the future, along with its successors, assigns, and anyone it authorizes such as staff, volunteers, contractors, partners, and sponsors.",
      "In this release, \"Materials\" means photographs, video, film, and audio recordings of the participant, together with the participant's name, image, likeness, and voice.",
    ]},
    { h: "Permission to record and use", p: [
      "In consideration of the opportunity to take part in Adapt To Life NFP's programs and to support its charitable mission, I irrevocably grant Adapt To Life NFP and those it authorizes the right to photograph, film, and record the participant, and to use, edit, reproduce, publish, distribute, and display the Materials for any lawful purpose connected to its mission. This includes its websites, social media, print, email, fundraising, and promotional and educational materials, in any media now known or later developed, worldwide, and for as long as Adapt To Life NFP finds them useful.",
      "This is my written consent under any applicable right of publicity and privacy laws. Adapt To Life NFP is not required to use the Materials.",
    ]},
    { h: "Ownership and no payment", p: [
      "All Materials are owned by Adapt To Life NFP. I have no right to inspect or approve how they are used, and I will not be paid for this release or for any use of the Materials.",
    ]},
    { h: "Images from adaptive sports programs", p: [
      "I understand the Materials may identify the participant as a person with a disability or as someone who takes part in adaptive sports programs, and I consent to their use on that basis.",
    ]},
    { h: "Release of claims", p: [
      "I release Adapt To Life NFP and its directors, officers, employees, volunteers, and those it authorizes from any claim arising out of the authorized recording, use, or publication of the Materials. This includes any claim for invasion of privacy, right of publicity, defamation, false light, or emotional distress, and any claim based on how the Materials are edited or used.",
    ]},
    { h: "If I am signing for a minor", p: [
      "If the participant is under 18, I confirm that I am the participant's parent or legal guardian, that I have authority to grant these rights on the participant's behalf, and that I am signing for the participant. I understand a minor cannot grant these rights alone. This release binds the participant, me, and our heirs.",
    ]},
    { h: "Electronic signature and records", p: [
      "I agree to do business electronically and to sign this release electronically. My electronic signature has the same legal effect as a handwritten one. Adapt To Life NFP will keep an electronic record of this signed release, and I may request a paper copy by emailing hello@adapttolife.org.",
    ]},
    { h: "Withdrawing permission", p: [
      "Although this grant is irrevocable, I may ask Adapt To Life NFP to stop future use by writing to hello@adapttolife.org. It will make reasonable efforts to stop using the participant's image in new Materials, but Materials already shared or published may continue to circulate.",
    ]},
    { h: "General", p: [
      "This release is binding on me, the participant, and our heirs, and benefits Adapt To Life NFP and its successors and assigns. It is governed by the laws of the State of Illinois, except where the law of the participant's home state must apply, in which case it will be enforced to the fullest extent that law allows. If any part is unenforceable, the rest stays in effect. This is the entire agreement on this subject.",
    ]},
  ],
};
// One universal document; `org` only records which site the signer came from.
const DOCS = { atl: DOC, asnm: DOC };

function canonicalText(doc) {
  let s = `${doc.org}\n${doc.title}\nversion:${doc.version}\n\n${doc.intro}\n`;
  for (const sec of doc.sections) {
    s += `\n## ${sec.h}\n`;
    for (const p of (sec.p || [])) s += p + "\n";
    for (const li of (sec.ul || [])) s += "- " + li + "\n";
  }
  return s;
}

// GET /api/waiver/doc?org=atl — the document text, so the page renders the exact
// wording that gets signed (one source of truth).
export function handleWaiverDoc(request, env) {
  const org = new URL(request.url).searchParams.get("org") === "asnm" ? "asnm" : "atl";
  const doc = DOCS[org];
  return json({ ok: true, org, doc: { org: doc.org, domains: doc.domains, title: doc.title, version: doc.version, intro: doc.intro, sections: doc.sections } });
}

export async function handleWaiver(request, env) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  if (str(data.company)) return json({ ok: true }); // honeypot

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  const org = str(data.org) === "asnm" ? "asnm" : "atl";
  const doc = DOCS[org];
  const isMinor = str(data.signer_kind) === "guardian";
  const name = str(data.name);              // adult participant, or guardian's name
  const email = str(data.em);
  const minorName = str(data.minor_name);
  const relationship = str(data.relationship);
  const program = str(data.program, 200);
  const signatureDataUrl = str(data.signature, 2_000_000);
  const signatureType = str(data.signature_type) === "typed" ? "typed" : "drawn";
  const agreed = data.agree === true || str(data.agree) === "on" || str(data.agree) === "true";

  if (!name) return json({ ok: false, error: isMinor ? "Please enter the parent or guardian's full name." : "Please type your full name." }, 422);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "A valid email is required." }, 422);
  if (isMinor && !minorName) return json({ ok: false, error: "Please enter the minor participant's name." }, 422);
  if (isMinor && !relationship) return json({ ok: false, error: "Please enter your relationship to the minor." }, 422);
  if (!agreed) return json({ ok: false, error: "Please check the box to agree to the release." }, 422);
  if (!signatureDataUrl.startsWith("data:image/png;base64,")) return json({ ok: false, error: "Please add your signature." }, 422);

  const id = crypto.randomUUID();
  const signedAt = new Date().toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 300);
  const cf = request.cf || {};
  const geo = { country: cf.country || "", region: cf.region || "", city: cf.city || "" };
  const docSha = await sha256Hex(new TextEncoder().encode(canonicalText(doc)));

  let pdfBytes;
  try {
    pdfBytes = await buildPdf({ doc, isMinor, name, email, minorName, relationship, program, signedAt, id, ip, ua, geo, signatureDataUrl, signatureType, docSha });
  } catch (err) {
    console.error("waiver pdf build failed:", err);
    return json({ ok: false, error: "Could not generate your document. Please try again." }, 500);
  }

  const pdfSha = await sha256Hex(pdfBytes);
  const r2Key = `waivers/${org}/${signedAt.slice(0, 10)}/${id}.pdf`;
  try {
    await env.WAIVERS_BUCKET.put(r2Key, pdfBytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { org, email, version: doc.version, sha256: pdfSha } });
  } catch (err) {
    console.error("waiver R2 put failed:", err);
    return json({ ok: false, error: "Could not save your document. Please try again." }, 502);
  }

  try {
    await env.WAIVERS_DB.prepare(
      `INSERT INTO waivers
       (id, org, waiver_version, signer_name, signer_email, signed_at, signature_type, signer_kind, minor_name, relationship, program, consent, ip, user_agent, country, region, city, doc_sha256, pdf_sha256, r2_key)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, org, doc.version, name, email, signedAt, signatureType, isMinor ? "guardian" : "adult", minorName, relationship, program, 1, ip, ua, geo.country, geo.region, geo.city, docSha, pdfSha, r2Key).run();
  } catch (err) {
    console.error("waiver D1 insert failed:", err);
  }

  // The compliance record is D1 (index, above) + R2 (the signed PDF) + the Google
  // Shared Drive archive (filed by the cron below). There is deliberately no
  // fourth mirror: a signed release is a record to retrieve, not a task to work,
  // so it does not belong in ClickUp either.

  // Email a copy of the signed PDF to the signer (and the org), from hello@adapttolife.org.
  // Best-effort; never blocks the signer. Sent via the SEND_EMAIL binding.
  try {
    await sendReceiptEmail(env, { to: email, pdfBytes, name, doc, isMinor, minorName });
  } catch (err) {
    console.error("waiver email failed:", err);
  }

  return json({ ok: true, id, download: `/api/waiver/${id}`, verify: `/api/waiver/${id}/verify` });
}

export async function handleWaiverDownload(request, env, id) {
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let row;
  try { row = await env.WAIVERS_DB.prepare("SELECT r2_key FROM waivers WHERE id = ?").bind(id).first(); }
  catch (err) { console.error("waiver lookup failed:", err); return new Response("Error", { status: 500 }); }
  if (!row) return new Response("Not found", { status: 404 });
  const obj = await env.WAIVERS_BUCKET.get(row.r2_key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="release-${id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
}

export async function handleWaiverVerify(request, env, id) {
  if (!isUuid(id)) return json({ ok: false, error: "Not found" }, 404);
  let row;
  try {
    row = await env.WAIVERS_DB.prepare("SELECT signer_name, signer_email, signed_at, waiver_version, pdf_sha256, doc_sha256, r2_key, country, region, city FROM waivers WHERE id = ?").bind(id).first();
  } catch { return json({ ok: false, error: "Lookup failed" }, 500); }
  if (!row) return json({ ok: false, error: "No such document" }, 404);
  const obj = await env.WAIVERS_BUCKET.get(row.r2_key);
  if (!obj) return json({ ok: false, error: "Document file missing" }, 404);
  const current = await sha256Hex(new Uint8Array(await obj.arrayBuffer()));
  return json({
    ok: true, document_id: id, intact: current === row.pdf_sha256,
    signer: { name: row.signer_name, email: row.signer_email }, signed_at: row.signed_at,
    waiver_version: row.waiver_version, location: [row.city, row.region, row.country].filter(Boolean).join(", "),
    recorded_sha256: row.pdf_sha256, current_sha256: current, document_text_sha256: row.doc_sha256,
  });
}

// ---------------------------------------------------------------------------
// PDF — a clean, branded signed record (not a fillable paper form).
// Page 1+: header band, the release text, the signature block.
// Final page: a Signature Certificate (audit trail).
// ---------------------------------------------------------------------------
async function buildPdf(d) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.06);
  const orange = rgb(0.909, 0.341, 0.164);
  const grey = rgb(0.42, 0.42, 0.45);
  const M = 56, W = 612 - M * 2;

  const cur = { page: pdf.addPage([612, 792]), y: 0 };
  const top = () => { cur.y = 792 - M; };
  const np = () => { cur.page = pdf.addPage([612, 792]); top(); };
  top();
  const need = (h) => { if (cur.y - h < M + 36) np(); };
  const para = (s, { size = 10, f = font, color = ink, gap = 7, x = M, lead = 4 } = {}) => {
    for (const l of wrap(s, f, size, W - (x - M))) { need(size + lead); cur.page.drawText(l, { x, y: cur.y, size, font: f, color }); cur.y -= size + lead; }
    cur.y -= gap;
  };

  // Header
  cur.page.drawText(d.doc.org.toUpperCase(), { x: M, y: cur.y, size: 15, font: bold, color: orange }); cur.y -= 15;
  cur.page.drawText(d.doc.domains, { x: M, y: cur.y, size: 8.5, font, color: grey }); cur.y -= 22;
  cur.page.drawText(d.doc.title, { x: M, y: cur.y, size: 19, font: bold, color: ink }); cur.y -= 12;
  cur.page.drawLine({ start: { x: M, y: cur.y }, end: { x: 612 - M, y: cur.y }, thickness: 1.5, color: orange }); cur.y -= 18;

  para(d.doc.intro, { size: 10, color: rgb(0.25, 0.25, 0.28), gap: 12 });

  for (const sec of d.doc.sections) {
    need(26);
    para(sec.h, { size: 12, f: bold, gap: 5 });
    for (const p of (sec.p || [])) para(p, { size: 10, gap: 6 });
    for (const li of (sec.ul || [])) {
      need(14);
      cur.page.drawText("•", { x: M + 4, y: cur.y, size: 10, font, color: orange });
      const before = cur.y;
      para(li, { size: 10, x: M + 18, gap: 2 });
      if (cur.y === before) cur.y -= 14;
    }
    cur.y -= 4;
  }

  // Signature block (kept together)
  need(170);
  cur.y -= 6;
  cur.page.drawLine({ start: { x: M, y: cur.y }, end: { x: 612 - M, y: cur.y }, thickness: 1.5, color: orange }); cur.y -= 18;
  para("Signature", { size: 12, f: bold, gap: 8 });
  try {
    const png = await pdf.embedPng(dataUrlToBytes(d.signatureDataUrl));
    const sw = 230, raw = (png.height / png.width) * sw, sh = Math.min(raw, 70);
    cur.page.drawImage(png, { x: M, y: cur.y - sh, width: sw * (sh / raw), height: sh });
    cur.y -= sh + 6;
  } catch {}
  cur.page.drawLine({ start: { x: M, y: cur.y }, end: { x: M + 260, y: cur.y }, thickness: 0.5, color: grey }); cur.y -= 14;

  if (d.isMinor) {
    para(`Participant (minor): ${d.minorName}`, { size: 10.5, gap: 2 });
    para(`Signed by parent / legal guardian: ${d.name} (${d.relationship})`, { size: 10.5, gap: 2 });
  } else {
    para(`Participant: ${d.name}`, { size: 10.5, gap: 2 });
    para(`Signed by: ${d.name}`, { size: 10.5, gap: 2 });
  }
  para(`Email: ${d.email}`, { size: 10.5, gap: 2 });
  if (d.program) para(`Program or event: ${d.program}`, { size: 10.5, gap: 2 });
  para(`Date: ${new Date(d.signedAt).toUTCString()}`, { size: 10.5, gap: 0 });

  // Certificate page
  np();
  para("Signature Certificate", { size: 15, f: bold, color: orange, gap: 8 });
  para(`${d.doc.org} — ${d.doc.title}`, { size: 10.5, f: bold, gap: 12 });
  const row = (label, value) => {
    need(16);
    const y0 = cur.y;
    cur.page.drawText(label, { x: M, y: y0, size: 9, font: bold, color: grey });
    for (const l of wrap(value, font, 10, W - 150)) { cur.page.drawText(l, { x: M + 150, y: cur.y, size: 10, font, color: ink }); cur.y -= 14; }
    cur.y -= 4;
  };
  row("Document ID", d.id);
  row("Release version", d.doc.version);
  row("Signer", `${d.name} <${d.email}>`);
  if (d.isMinor) { row("On behalf of (minor)", d.minorName); row("Relationship", d.relationship); }
  if (d.program) row("Program or event", d.program);
  row("Signature method", d.signatureType === "typed" ? "Typed" : "Hand-drawn");
  row("Signed at (UTC)", d.signedAt);
  row("Consent", "Affirmatively agreed; consented to electronic records and signature");
  row("Bot check", "Cloudflare Turnstile passed");
  row("IP address", d.ip || "n/a");
  row("Location", [d.geo.city, d.geo.region, d.geo.country].filter(Boolean).join(", ") || "n/a");
  row("Device", d.ua || "n/a");
  row("Document fingerprint", `SHA-256 ${d.docSha}`);
  cur.y -= 8;
  para("This certificate records the electronic signing of the document above. The release text presented at signing is identified by the fingerprint shown. The stored PDF can be verified as unaltered against its recorded hash.", { size: 8.5, color: grey, gap: 4 });

  // Footer + page numbers on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: 612 - M, y: 44 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.87) });
    p.drawText("Adapt To Life NFP  ·  501(c)(3) nonprofit  ·  EIN 41-3213344", { x: M, y: 32, size: 8, font, color: grey });
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: 612 - M - font.widthOfTextAtSize(pn, 8), y: 32, size: 8, font, color: grey });
  });

  return await pdf.save();
}

// Email the signed PDF to the signer (and a copy to the org), from hello@adapttolife.org.
// Uses Cloudflare Email Sending (src/email.js cfSend). The apex is onboarded to Email
// Service via SPF/DKIM TXT records only — no MX change — so Google Workspace mail on the
// root domain is unaffected. Best-effort: a send failure never blocks signing.
async function sendReceiptEmail(env, { to, pdfBytes, name, doc, isMinor, minorName }) {
  if (!env.SEND_EMAIL) { console.error("SEND_EMAIL binding not configured; skipping receipt email"); return; }
  const who = isMinor ? `${minorName} (signed by ${name})` : name;
  const subject = `Your signed ${doc.org} release`;
  const text =
    `Hi ${name},\n\n` +
    `Thank you. Your ${doc.title} with ${doc.org} is attached as a signed PDF for your records.\n\n` +
    `Participant: ${who}\n\n` +
    `If you ever want to withdraw permission for future use, just reply to this email or write to hello@adapttolife.org.\n\n` +
    `Adapt To Life\n501(c)(3) nonprofit, EIN 41-3213344`;
  // Same house shell as the contact and grant-application receipts. These three
  // are the only automated mail we send from hello@, and they used to arrive in
  // two different typefaces with two different sign-offs.
  const html = houseShell(
    `<p>Hi ${esc(name)},</p>` +
    `<p>Thank you. Your <strong>${esc(doc.title)}</strong> with ${esc(doc.org)} is attached as a signed PDF for your records.</p>` +
    `<p style="color:#3f3d38"><strong>Participant:</strong> ${esc(who)}</p>` +
    `<p>If you ever want to withdraw permission for future use, just reply to this email or write to <a href="mailto:hello@adapttolife.org" style="color:#c2410c">hello@adapttolife.org</a>.</p>`
  );
  try {
    await cfSend(env, {
      from: "Adapt To Life <hello@adapttolife.org>",
      to,
      bcc: "hello@adapttolife.org",
      replyTo: "hello@adapttolife.org",
      subject, text, html,
      attachments: [
        { filename: "adapt-to-life-release.pdf", content: bytesToB64(pdfBytes), type: "application/pdf", disposition: "attachment" },
      ],
    });
  } catch (err) {
    console.error("receipt email failed:", err);
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function bytesToB64(bytes) {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

// ---------------------------------------------------------------------------
// Google Drive archive (compliance backlog). Runs on a cron: any signed release
// not yet in Drive gets uploaded to the Shared Drive, and its Drive File ID +
// link are written back to D1. Off the signing hot path, so
// a Drive hiccup never blocks a signer. Files land in a Shared Drive (owned by the
// drive, not the service account), which is why uploads succeed.
// ---------------------------------------------------------------------------
export async function runDriveBacklog(env) {
  if (!env.GOOGLE_SA_JSON || !env.WAIVERS_DRIVE_ID) { console.error("Drive backlog not configured"); return; }
  let rows;
  try {
    rows = (await env.WAIVERS_DB.prepare(
      "SELECT id, org, r2_key FROM waivers WHERE drive_file_id IS NULL OR drive_file_id = '' ORDER BY created_at ASC LIMIT 10"
    ).all()).results || [];
  } catch (err) { console.error("Drive backlog D1 query failed:", err); return; }
  if (!rows.length) return;

  let token;
  try { token = await getGoogleAccessToken(env); }
  catch (err) { console.error("Drive backlog token mint failed:", err); return; }

  for (const row of rows) {
    try {
      const obj = await env.WAIVERS_BUCKET.get(row.r2_key);
      if (!obj) { console.error("Drive backlog: R2 object missing", row.r2_key); continue; }
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const file = await driveUpload(token, env.WAIVERS_DRIVE_ID, `release-${row.id}.pdf`, bytes);
      const link = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
      await env.WAIVERS_DB.prepare("UPDATE waivers SET drive_file_id = ?, drive_link = ? WHERE id = ?").bind(file.id, link, row.id).run();
    } catch (err) {
      console.error("Drive backlog: failed for", row.id, err);
    }
  }
}

async function getGoogleAccessToken(env) {
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive", aud: sa.token_uri, iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const jwt = `${head}.${claim}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch(sa.token_uri, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("no access_token: " + JSON.stringify(data));
  return data.access_token;
}

async function driveUpload(token, driveId, filename, bytes) {
  const boundary = "atlbnd" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: filename, parents: [driveId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Uint8Array([...new TextEncoder().encode(head), ...bytes, ...new TextEncoder().encode(tail)]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error("drive upload " + res.status + " " + await res.text().catch(() => ""));
  return await res.json();
}


function b64url(bytes) {
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(b64); const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der.buffer;
}

// --- helpers ---
function wrap(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/); const lines = []; let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(",")[1] || ""); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes;
}
async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || undefined }),
    });
    return !!(await res.json()).success;
  } catch (err) { console.error("turnstile verify failed:", err); return false; }
}
function str(v, max = 5000) { return (typeof v === "string" ? v : "").trim().slice(0, max); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
