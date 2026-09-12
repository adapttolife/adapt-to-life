// Independent internal correspondence for contact/sponsor forms only.
// No historical backfill; no customer resend; no grant/volunteer audience expansion.
import {cfSend,HOUSE_FROM,HOUSE_INBOX,esc,houseShell} from './email.js';
const now=()=>new Date().toISOString();
export function queueOriginal(db,id,payload) {
  return db.prepare(`INSERT OR IGNORE INTO form_record_deliveries(submission_id)
    SELECT id FROM form_submissions WHERE id=? AND kind='contact' AND payload=?`).bind(id,payload);
}
export async function reconcileOriginal(env,id) {
  const d=await env.WAIVERS_DB.prepare("SELECT completed_at FROM form_record_deliveries WHERE submission_id=? AND state='done'").bind(id).first();
  if(!d)return;
  const stamped=await env.INTAKE.prepare('UPDATE intake SET notified_at=COALESCE(notified_at,?),notify_error=NULL WHERE id=? RETURNING id').bind(d.completed_at,id).first();
  if(stamped)await env.WAIVERS_DB.prepare("UPDATE form_record_deliveries SET mirrored_at=? WHERE submission_id=? AND state='done'").bind(now(),id).run();
}
export async function processOriginal(env,id) {
  const db=env.WAIVERS_DB;
  const claim=await db.prepare("UPDATE form_record_deliveries SET state='running',attempts=attempts+1,started_at=?,error=NULL WHERE submission_id=? AND state='pending' RETURNING submission_id").bind(now(),id).first();
  if(!claim){await reconcileOriginal(env,id);return;}
  let externalStarted=false;
  try {
    const row=await db.prepare('SELECT * FROM form_submissions WHERE id=?').bind(id).first();
    if(!row||row.kind!=='contact')throw Error('Original-record scope mismatch');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid case reference');
    const sub=JSON.parse(row.payload);
    if(!env.SEND_EMAIL)throw Error('Original-record mail binding missing');
    // Whitelist accepted contact fields, never forward challenge tokens or raw extras.
    const fields={Reference:id,Received:row.received_at,Name:sub.name,Email:sub.email,Phone:sub.phone,Type:sub.type,Source:sub.source,Tier:sub.tier,Amount:sub.amount};
    const sponsor=sub.type==='Giving or sponsoring';
    const subject=`ATL ${sponsor?'sponsorship':'contact'} request — ${id}`;
    const text=`Original website request. This is an automated intake record, not a human reply.\n${sponsor?'Sponsorship interest is not a payment or commitment.\n':''}\n`+Object.entries(fields).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>`${k}: ${v}`).join('\n')+`\n\nOriginal message:\n${sub.message||''}\n\nReply to the visitor to continue the conversation. Customer acknowledgment and CRM delivery have independent status; this record does not certify them.`;
    // Even an invalid/rejected visitor address cannot reject the house envelope.
    // Only a syntactically safe address becomes Reply-To; it remains body context otherwise.
    const replyTo=typeof sub.email==='string'&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(sub.email)?sub.email:HOUSE_INBOX;
    externalStarted=true;
    const result=await cfSend(env,{from:HOUSE_FROM,to:HOUSE_INBOX,replyTo,subject,text,
      html:houseShell(`<div style="white-space:pre-wrap">${esc(text)}</div>`),
      headers:{'Auto-Submitted':'auto-generated','X-ATL-Form':'contact','X-ATL-Record':'original-request','X-ATL-Intake-ID':id}});
    if(typeof result.messageId!=='string'||!result.messageId.trim())throw Error('Original-record acceptance uncertain: missing provider ID');
    await db.prepare("UPDATE form_record_deliveries SET state='done',completed_at=?,receipt=?,error=NULL WHERE submission_id=? AND state='running'")
      .bind(now(),JSON.stringify({messageId:result.messageId,provider:'cloudflare',status:'accepted',to:HOUSE_INBOX}),id).run();
  }catch(e){
    await db.prepare("UPDATE form_record_deliveries SET state=?,error=? WHERE submission_id=? AND state='running'")
      .bind(externalStarted?'review':'pending',String(e.message).slice(0,400),id).run();
    return;
  }
  // Cross-DB projection can retry after success without ever re-sending mail.
  await reconcileOriginal(env,id);
}
export async function recoverOriginals(env) {
  const db=env.WAIVERS_DB,cut=new Date(Date.now()-15*60e3).toISOString();
  await db.prepare("UPDATE form_record_deliveries SET state='review',error='Interrupted original send: verify provider before retry' WHERE state='running' AND started_at<?").bind(cut).run();
  const rows=await db.prepare("SELECT submission_id FROM form_record_deliveries WHERE state='pending' OR (state='done' AND mirrored_at IS NULL) ORDER BY submission_id LIMIT 25").all();
  await Promise.allSettled((rows.results||[]).map(r=>processOriginal(env,r.submission_id)));
}
