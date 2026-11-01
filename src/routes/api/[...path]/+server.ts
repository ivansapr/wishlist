import { error,json,type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actor,sessionUser,hash,now,secret } from '#lib/server/auth';
import { all,one,run,transaction } from '#lib/server/db';
import { createFolder,createItem,deleteItem,folders,items,parse,recordPrice,renameFolder,restoreItem,updateItem,folderAccess,currency,idempotent } from '#lib/server/store';
import { uploadAsset } from '#lib/server/assets';
const revision=z.number().int().positive();
const handler:RequestHandler=async e=>{
 const path=e.params.path||'';const [resource,id,sub]=path.split('/');const method=e.request.method;
 if(method==='POST'&&resource==='upload')return json(await uploadAsset(actor(e,true),e.request));
 const a=actor(e,method!=='GET');
 if(method==='GET'){
  if(resource==='state'){const offset=parse(z.coerce.number().int().min(0).max(100000),e.url.searchParams.get('offset')||0);const folder=e.url.searchParams.get('folder')||undefined;const query=parse(z.string().max(160),e.url.searchParams.get('q')||'');const list=items(a,folder,offset,100,false,query);return json({folders:folders(a),items:list,offset,hasMore:list.length===100});}
  if(resource==='trash')return json(items(a,undefined,0,100,true));
  if(resource==='profile'){const u=sessionUser(e);return json({user:u,keys:all('SELECT id,name,created_at FROM passkeys WHERE user_id=?',u.id),tokens:all('SELECT id,name,permission,folder_id,created_at FROM tokens WHERE user_id=?',u.id),sessions:all<{hash:string;expires:number}>('SELECT hash,expires FROM sessions WHERE user_id=? AND expires>?',u.id,Date.now()).map(s=>({id:s.hash,expires:s.expires,current:s.hash===hash(e.cookies.get('session')||'')}))});}
  error(404,'Not found.');
 }
 const body:any=method==='DELETE'?{}:parse(z.record(z.string(),z.unknown()),await e.request.json().catch(()=>error(400,'Invalid JSON.')));
 if(resource==='folders'){
  if(method==='POST'&&!id)return json(createFolder(a,body.name));
  if(method==='PATCH'&&id)return json(renameFolder(a,id,body.name));
  if(sub==='share'&&id){sessionUser(e);folderAccess(a,id);if(method==='DELETE'){run('DELETE FROM shares WHERE folder_id=?',id);return json({ok:true});}if(method==='POST'){const token=secret();run('INSERT INTO shares VALUES (?,?,?) ON CONFLICT(folder_id) DO UPDATE SET hash=excluded.hash,created_at=excluded.created_at',hash(token),id,now());return json({url:`${process.env.ORIGIN||e.url.origin}/share/${token}`});}}
 }
 if(resource==='items'){
  if(method==='POST'&&!id)return json(idempotent(a,e.request.headers.get('idempotency-key')||undefined,{op:'create',body},()=>transaction(()=>{const {price_data,...fields}=body;const item=createItem(a,fields);if(price_data)recordPrice(a,{...price_data,item_id:item.id});return item;})));
  if(method==='POST'&&id&&sub==='restore')return json(restoreItem(a,id));
  if(method==='PATCH'&&id){const {revision:r,price_data,...changes}=body;return json(transaction(()=>{const item=updateItem(a,id,parse(revision,r),changes);if(price_data)recordPrice(a,{...price_data,item_id:item.id});return item;}));}
  if(method==='DELETE'&&id)return json(deleteItem(a,id,parse(z.coerce.number().int().positive(),e.url.searchParams.get('revision'))));
 }
 if(resource==='prices'&&method==='POST')return json(idempotent(a,e.request.headers.get('idempotency-key')||undefined,{op:'price',body},()=>recordPrice(a,body)));
 if(resource==='profile'&&method==='PATCH'){const user=sessionUser(e);const v=parse(z.object({name:z.string().trim().min(1).max(100),currency}).strict(),body);run('UPDATE users SET name=?,currency=? WHERE id=?',v.name,v.currency,user.id);return json({ok:true});}
 if(resource==='tokens'){
  const user=sessionUser(e);
  if(method==='DELETE'&&id){run('DELETE FROM tokens WHERE id=? AND user_id=?',id,user.id);return json({ok:true});}
  if(method==='POST'){const v=parse(z.object({name:z.string().trim().min(1).max(100),permission:z.enum(['read','write']),folder_id:z.string().nullable()}),body);if(v.folder_id)folderAccess(a,v.folder_id);const token=secret();run('INSERT INTO tokens VALUES (?,?,?,?,?,?,?)',hash(token),randomUUID(),user.id,v.name,v.permission,v.folder_id,now());return json({token});}
 }
 if(resource==='passkeys'&&method==='DELETE'&&id){const user=sessionUser(e);transaction(()=>{const count=one<{n:number}>('SELECT count(*) n FROM passkeys WHERE user_id=?',user.id)!.n;const password=one<{password:string|null}>('SELECT password FROM users WHERE id=?',user.id)!.password;if(count<=1&&!password)error(400,'Add another passkey or password first.');run('DELETE FROM passkeys WHERE id=? AND user_id=?',id,user.id);});return json({ok:true});}
 if(resource==='sessions'&&method==='DELETE'&&id){const user=sessionUser(e);run('DELETE FROM sessions WHERE hash=? AND user_id=?',id,user.id);return json({ok:true});}
 error(404,'Not found.');
};
export const GET=handler;export const POST=handler;export const PATCH=handler;export const DELETE=handler;
