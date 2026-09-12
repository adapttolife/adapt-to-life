export async function safeNewsletterSubscribe(env, email, campaign, extra = {}) {
  const PUBLICATION = 'pub_d1bfe66c-074f-464a-a94a-d0cce6d21943';
  const BRAND = 'atl';
  const db = env.AGENT_MAIL_DB;
  const fail = {ok:false,status:502,error:'Sign-up is temporarily unavailable. Please try again soon.'};
  const suppressed = {ok:false,status:409,error:'Your existing subscription preferences were preserved. Please manage your subscription in the newsletter.'};
  if (!db || !env.BEEHIIV_API_KEY || env.BEEHIIV_PUBLICATION_ID !== PUBLICATION) return {...fail,status:503};
  email=email.trim().toLowerCase();
  const headers={Authorization:`Bearer ${env.BEEHIIV_API_KEY}`,'Content-Type':'application/json'};
  const root=`https://api.beehiiv.com/v2/publications/${PUBLICATION}/subscriptions`;
  async function lookup(pub) {
    const r=await fetch(`https://api.beehiiv.com/v2/publications/${pub}/subscriptions/by_email/${encodeURIComponent(email)}?expand[]=newsletter_lists`,{headers});
    if(r.status===404)return null;
    if(!r.ok)throw Error('Subscription lookup failed');
    const d=(await r.json()).data;if(!d?.id||typeof d.status!=='string')throw Error('Invalid subscription response');return d;
  }
  try {
    const old=await lookup(PUBLICATION);
    if(old)return ['active','pending','validating'].includes(old.status)?{ok:true,existing:true}:suppressed;
    let legacy=null;
    if(BRAND==='asnm') {
      const candidate=await lookup('pub_d1bfe66c-074f-464a-a94a-d0cce6d21943');
      if(candidate?.utm_source==='asnm-prelaunch')legacy=candidate;
      if(legacy&&legacy.status!=='active')return suppressed;
    }
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(PUBLICATION+'\n'+email))),x=>x.toString(16).padStart(2,'0')).join('');
    const claim=await db.prepare("INSERT OR IGNORE INTO newsletter_delivery_claims (claim_key,publication_id,state) VALUES (?,?,'creating') RETURNING claim_key").bind(digest,PUBLICATION).first();
    if(!claim)return {...fail,status:409,error:'This signup is already being processed. Please try again later.'};
    const custom_fields=[];if(extra.name)custom_fields.push({name:'First Name',value:extra.name});if(extra.beta)custom_fields.push({name:'Beta Tester',value:'true'});
    const res=await fetch(root,{method:'POST',headers,body:JSON.stringify({email,reactivate_existing:false,send_welcome_email:BRAND==='atl',automation_ids:[],newsletter_list_ids:[],skip_newsletter_list_auto_subscribe:true,double_opt_override:'not_set',utm_source:BRAND==='asnm'?'asnm-prelaunch':campaign,utm_medium:'website',utm_campaign:campaign,referring_site:BRAND==='asnm'?'adaptivesportsnearme.com':'adapttolife.org',custom_fields})});
    if(!res.ok){await db.prepare("UPDATE newsletter_delivery_claims SET state='needs-review' WHERE claim_key=?").bind(digest).run();return fail;}
    const sub=(await res.json()).data;if(!sub?.id||!sub.status)throw Error('Invalid creation response');
    await db.prepare('UPDATE newsletter_delivery_claims SET subscription_id=?,state=? WHERE claim_key=?').bind(sub.id,BRAND==='atl'?'beehiiv-welcome-requested':legacy?'legacy-no-welcome':'awaiting-validation',digest).run();
    return {ok:true};
  }catch(e){console.error('newsletter signup failed closed',String(e.message));return fail;}
}
