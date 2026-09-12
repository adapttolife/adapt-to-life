// Durable acceptance, independent delivery steps, one scheduled recovery owner.
// No marketing enrollment. Raw application detail never enters shared intake.
import { createContact, createApplication, createVolunteer } from './clickup.js';
import { sendContactReceipt, sendApplyReceipt, sendVolunteerReceipt } from './receipts.js';

const creators = {contact:createContact,apply:createApplication,volunteer:createVolunteer};
const receipts = {contact:sendContactReceipt,apply:sendApplyReceipt,volunteer:sendVolunteerReceipt};
const now = () => new Date().toISOString();
const pending = (db,id,channel) => db.prepare("INSERT OR IGNORE INTO form_deliveries (submission_id,channel) VALUES (?,?)").bind(id,channel);

export async function acceptForm(env, kind, sub, suppliedId, ctx) {
  if (!Object.hasOwn(creators,kind)) throw Error('Unsupported form');
  const db=env.WAIVERS_DB;
  const id=typeof suppliedId==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId) ? suppliedId : crypto.randomUUID();
  const payload=JSON.stringify(sub);
  try {
    if (!db || !env.INTAKE) throw Error('Required durable binding missing');
    // One D1 transaction. A success response is impossible before both source
    // and outbox exist. INSERT OR IGNORE never overwrites an accepted original.
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO form_submissions (id,kind,payload,received_at) VALUES (?,?,?,?)').bind(id,kind,payload,now()),
      ...['clickup','intake','receipt'].map(channel=>pending(db,id,channel)),
    ]);
    const stored=await db.prepare('SELECT kind,payload FROM form_submissions WHERE id=?').bind(id).first();
    if (!stored || stored.kind!==kind || stored.payload!==payload) {
      return {ok:false,status:409,error:'This submission changed during a retry. Please reopen the form and try again.'};
    }
    // waitUntil is an acceleration only. The persisted outbox is the guarantee.
    if (ctx?.waitUntil) ctx.waitUntil(processForm(env,id).catch(e=>console.error('form dispatch failed',id,e.message)));
    return {ok:true,status:200,id};
  } catch(e) {
    console.error('form acceptance failed',kind,e.message);
    return {ok:false,status:503,error:'Your message has not been saved. Please try again or email hello@adapttolife.org.'};
  }
}

export function intakeProjection(row,sub) {
  const sponsor=row.kind==='contact' && sub.type==='Giving or sponsoring';
  const kind=sponsor?'sponsor':row.kind;
  const details=row.kind==='apply'
    ? {note:'Application received. Sensitive details remain in the restricted application record and ClickUp.'}
    : row.kind==='volunteer'
      ? {roles:sub.roles,source:sub.source}
      : {type:sub.type,source:sub.source,tier:sub.tier||'',amount:sub.amount||''};
  return {kind,summary:`New ${kind}: ${sub.name}`,details};
}

async function mirror(env,row,sub) {
  const {kind,summary,details}=intakeProjection(row,sub);
  const task = await env.WAIVERS_DB.prepare("SELECT receipt FROM form_deliveries WHERE submission_id=? AND channel='clickup' AND state='done'").bind(row.id).first();
  if (task?.receipt) { const value=JSON.parse(task.receipt); details.clickup_url=value.url||`https://app.clickup.com/t/${value.id}`; details.clickup_id=value.id; }
  // Stable ID makes retries safe across the two databases. The existing shared
  // intake worker owns internal notification; the existing host sync owns Sheets.
  await env.INTAKE.batch([
    env.INTAKE.prepare(`INSERT OR IGNORE INTO intake
    (id,received_at,site,kind,name,email,phone,summary,payload,source,is_canary)
    VALUES (?,?,?,?,?,?,?,?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,
      sheet_synced_at=CASE WHEN intake.payload<>excluded.payload THEN NULL ELSE intake.sheet_synced_at END`).bind(row.id,row.received_at,'adapttolife.org',kind,sub.name,sub.email,sub.phone||null,summary,JSON.stringify(details),sub.source||`adapttolife.org/${row.kind}`),
    env.INTAKE.prepare("INSERT OR IGNORE INTO intake_delivery_claims(intake_id,state) VALUES (?,'pending')").bind(row.id)
  ]);
  const saved=await env.INTAKE.prepare('SELECT id FROM intake WHERE id=?').bind(row.id).first();
  if (!saved) throw Error('Intake mirror readback missing');
  return row.id;
}

async function finish(db,id,channel,state,receipt,error) {
  await db.prepare('UPDATE form_deliveries SET state=?,completed_at=?,receipt=?,error=? WHERE submission_id=? AND channel=? AND state=\'running\'')
    .bind(state,state==='done'?now():null,receipt||null,error||null,id,channel).run();
}

export async function processForm(env,id) {
  const db=env.WAIVERS_DB;
  const row=await db.prepare('SELECT * FROM form_submissions WHERE id=?').bind(id).first();
  if (!row) throw Error('Missing durable form');
  const sub=JSON.parse(row.payload);
  // A slow CRM must not hold the correspondence receipt behind its API call.
  for (const channel of ['receipt','clickup','intake']) {
    // A conditional UPDATE is the cross-isolate lock. Running external sends
    // are NEVER blindly reclaimed: a crash may follow provider acceptance.
    const claim=await db.prepare("UPDATE form_deliveries SET state='running',attempts=attempts+1,started_at=?,error=NULL WHERE submission_id=? AND channel=? AND state='pending' RETURNING submission_id")
      .bind(now(),id,channel).first();
    if (!claim) continue;
    let externalStarted=false;
    try {
      let receipt;
      if (channel==='intake') receipt=await mirror(env,row,sub);
      else if (channel==='clickup') {
        const list=env[{contact:'CLICKUP_CONTACTS_LIST_ID',apply:'CLICKUP_APPLICATIONS_LIST_ID',volunteer:'CLICKUP_VOLUNTEERS_LIST_ID'}[row.kind]];
        if (!list || !env.CLICKUP_TOKEN) throw Error('ClickUp configuration missing');
        externalStarted=true;
        const result=await creators[row.kind](env,{...sub,submission_id:id});
        if (!result.ok || !result.id) {
          if (result.retryable) externalStarted=false;
          throw Error(result.error||'ClickUp acceptance could not be verified');
        }
        receipt=JSON.stringify({id:result.id,url:result.url});
      } else {
        if (!env.SEND_EMAIL) throw Error('Receipt mail binding missing');
        externalStarted=true;
        const sent=await receipts[row.kind]({...env,INTAKE_SEPARATE_NOTIFICATION:true,
          INTAKE_SUBMISSION_ID:id,INTAKE_CAPTURE_RECEIPT:true},sub);
        if (!sent?.messageId) throw Error('Email acceptance uncertain; review delivery ledger before retry');
        // Provider correlation is not an RFC Message-ID or recipient delivery.
        // Keep the actual provider response, never a pre-minted success marker.
        receipt=JSON.stringify(sent);
      }
      await finish(db,id,channel,'done',receipt,null);
      if (channel==='clickup') await db.prepare("UPDATE form_deliveries SET state='pending' WHERE submission_id=? AND channel='intake' AND state='done'").bind(id).run();
    } catch(e) {
      // Local/confirmed failures retry automatically. Ambiguous non-idempotent
      // writes remain reviewable rather than duplicating tasks or mail.
      await finish(db,id,channel,externalStarted?'review':'pending',null,String(e.message).slice(0,400));
    }
  }
}

export async function sweepForms(env) {
  const db=env.WAIVERS_DB;
  if (!db) throw Error('WAIVERS_DB missing');
  const cut=new Date(Date.now()-15*60e3).toISOString();
  await db.prepare("UPDATE form_deliveries SET state=CASE WHEN channel='intake' THEN 'pending' ELSE 'review' END,error='Interrupted delivery; inspect destination before retry' WHERE state='running' AND started_at<?").bind(cut).run();
  const rows=await db.prepare("SELECT DISTINCT submission_id FROM form_deliveries WHERE state='pending' ORDER BY submission_id LIMIT 25").all();
  for(const row of rows.results||[]) await processForm(env,row.submission_id);
  return {processed:(rows.results||[]).length};
}
