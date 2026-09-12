import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function sqliteD1(schema) {
  const sql=new DatabaseSync(':memory:');sql.exec(schema);
  function prepare(text){return {bind(...args){return stmt(text,args)},...stmt(text,[])}};
  function stmt(text,args){return {
    bind(...values){return stmt(text,values)},
    async first(){return sql.prepare(text).get(...args)||null},
    async all(){return {success:true,results:sql.prepare(text).all(...args)}},
    async run(){const result=sql.prepare(text).run(...args);return {success:true,meta:{changes:Number(result.changes)}}},
  }}
  let tail=Promise.resolve();
  return {prepare,sql,batch(stmts){const task=tail.then(async()=>{sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}});tail=task.catch(()=>{});return task}};
}
export function formBindings(){return {
  WAIVERS_DB:sqliteD1(readFileSync(new URL('../../src/schema_forms.sql',import.meta.url),'utf8')),
  INTAKE:sqliteD1(`CREATE TABLE intake(id TEXT PRIMARY KEY,received_at TEXT,site TEXT,kind TEXT,name TEXT,email TEXT,phone TEXT,summary TEXT,payload TEXT,source TEXT,is_canary INTEGER DEFAULT 0,notified_at TEXT,notify_attempts INTEGER DEFAULT 0,notify_error TEXT,sheet_synced_at TEXT,status TEXT DEFAULT 'new');` + readFileSync(new URL('../../src/schema_intake_delivery.sql',import.meta.url),'utf8')),
};}
