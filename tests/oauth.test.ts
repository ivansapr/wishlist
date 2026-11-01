import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn,type ChildProcess } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auth,type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const origin='http://localhost:4175',resource=origin+'/mcp',callback='https://assistant.example/callback';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
let serverLog='';
let server:ChildProcess,dir:string,db:DatabaseSync,user:Record<string,string>={},folder:string,other:string,publicClient:any;
function cookie(jar:Record<string,string>){return Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');}
async function fetchWithCookies(url:string,jar:Record<string,string>,init:RequestInit={}){const r=await fetch(url,{...init,redirect:'manual',headers:{...init.headers,Cookie:cookie(jar)}});for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar[k]=v;}return r;}
async function web(path:string,method='GET',body?:unknown,expected=200,jar=user){const r=await fetchWithCookies(origin+path,jar,{method,headers:{Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
async function register(extra:Record<string,unknown>={},expected=201){const r=await fetch(origin+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:[callback],client_name:'My assistant',token_endpoint_auth_method:'none',...extra})});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
async function form(path:string,body:Record<string,string>,expected=200,headers:Record<string,string>={}){const r=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)});const text=await r.text();const data=text?JSON.parse(text):null;assert.equal(r.status,expected,text);return data;}
async function consent(url:string,options:{permission?:string;folder?:string;decision?:string;jar?:Record<string,string>}={}){const jar=options.jar||user;const r=await fetchWithCookies(url,jar);assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'same-origin');const html=await r.text();const id=html.match(/name="request_id" value="([^"]+)"/)?.[1];assert(id,html.slice(0,200));const response=await fetchWithCookies(origin+'/oauth/authorize',jar,{method:'POST',headers:{Origin:origin,Accept:'text/html','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request_id:id,permission:options.permission||'write',folder_id:options.folder||'',decision:options.decision||'allow'})});assert.equal(response.status,303,await response.text());return {url:new URL(response.headers.get('location')!),id};}
function authURL(c=publicClient,extra:Record<string,string>={}){const verifier=randomBytes(32).toString('base64url');const url=new URL(origin+'/oauth/authorize');url.search=new URLSearchParams({client_id:c.client_id,redirect_uri:callback,response_type:'code',scope:'wishlist:read wishlist:write',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource,state:'a state +/?',...extra}).toString();return {url,verifier};}
async function flow(options:{permission?:string;folder?:string;client?:any}={}){const c=options.client||publicClient,f=authURL(c);const approved=await consent(f.url.toString(),options);assert.equal(approved.url.searchParams.get('state'),'a state +/?');assert.equal(approved.url.searchParams.get('iss'),origin);return {client:c,verifier:f.verifier,code:approved.url.searchParams.get('code')!};}
function codeBody(f:any){return{client_id:f.client.client_id,grant_type:'authorization_code',code:f.code,code_verifier:f.verifier,redirect_uri:callback,resource,...f.client.client_secret&&f.client.token_endpoint_auth_method==='client_secret_post'?{client_secret:f.client.client_secret}:{}};}
async function mcp(access:string,name='list_folders',args:Record<string,unknown>={},expected=200){const r=await fetch(resource,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const data=await r.json();assert.equal(r.status,expected);return data;}
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'wishlist-oauth-'));
 // Simulate an installed v1 database, preserving an existing account and manual token.
 db=new DatabaseSync(join(dir,'wishlist.sqlite'));db.exec(`PRAGMA user_version=1; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'EUR',password TEXT,created_at TEXT NOT NULL);CREATE TABLE tokens(hash TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,permission TEXT NOT NULL,folder_id TEXT,created_at TEXT NOT NULL);`);
 db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run('legacy','legacy@example.test','Legacy user',new Date().toISOString());db.prepare('INSERT INTO tokens VALUES (?,?,?,?,?,?,?)').run(sha('legacy-connection'),'legacy-token','legacy','Existing token','read',null,new Date().toISOString());db.close();
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4175',ORIGIN:origin,DATA_DIR:dir},stdio:'pipe'});server.stderr?.on('data',v=>serverLog+=v);
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,serverLog);
 db=new DatabaseSync(join(dir,'wishlist.sqlite'));
 await web('/api/auth/register','POST',{name:'OAuth owner',email:'oauth@example.test',password:'a long oauth password'});folder=(await web('/api/state')).folders[0].id;other=(await web('/api/folders','POST',{name:'Other folder'})).id;publicClient=await register();
});
after(async()=>{if(serverLog)console.error(serverLog.slice(-6000));db?.close();server?.kill();await new Promise(r=>setTimeout(r,150));await rm(dir,{recursive:true,force:true});});

test('v1 migration, resource discovery, challenges and safe client registration',async()=>{
 assert.equal(db.prepare('PRAGMA user_version').get()!.user_version,2);
 assert.equal((await fetch(origin+'/api/state',{headers:{Authorization:'Bearer legacy-connection'}})).status,200);
 const r=await fetch(resource);assert.equal(r.status,401);assert(r.headers.get('www-authenticate')?.includes('/.well-known/oauth-protected-resource/mcp'));
 const metadata=await (await fetch(origin+'/.well-known/oauth-protected-resource/mcp')).json();assert.equal(metadata.resource,resource);assert.deepEqual(metadata.authorization_servers,[origin]);
 const as=await (await fetch(origin+'/.well-known/oauth-authorization-server')).json();assert.deepEqual(as.code_challenge_methods_supported,['S256']);assert(as.registration_endpoint);
 assert.equal((await fetch(origin+'/oauth/token',{method:'OPTIONS',headers:{Origin:'https://assistant.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}})).headers.get('access-control-allow-origin'),'*');
 await register({redirect_uris:['http://evil.example/callback']},400);await register({redirect_uris:['https://assistant.example/callback#fragment']},400);await register({grant_types:['implicit']},400);
 const hostile=authURL(publicClient,{redirect_uri:'https://evil.example/callback'});const rejected=await fetch(hostile.url,{redirect:'manual'});assert.equal(rejected.status,400);assert.equal(rejected.headers.get('location'),null);
 const noPKCE=authURL();noPKCE.url.searchParams.delete('code_challenge');assert.equal((await fetch(noPKCE.url,{redirect:'manual'})).status,400);
 const badAudience=authURL(publicClient,{resource:'https://another.example/mcp'});assert.equal((await fetch(badAudience.url,{redirect:'manual'})).status,400);
});

test('consent is browser-bound; denial and sign-in continuation preserve state',async()=>{
 const f=authURL();const anonymous:Record<string,string>={};const r=await fetchWithCookies(f.url.toString(),anonymous);assert.equal(r.status,303);const login=new URL(r.headers.get('location')!,origin);const id=login.searchParams.get('oauth_request');assert(id);
 assert.equal((await fetch(origin+'/oauth/authorize?request='+id,{redirect:'manual'})).status,400);
 await web('/api/auth/login','POST',{email:'oauth@example.test',password:'a long oauth password'},200,anonymous);
 const denied=await consent(origin+'/oauth/authorize?request='+id,{jar:anonymous,decision:'deny'});assert.equal(denied.url.searchParams.get('error'),'access_denied');assert.equal(denied.url.searchParams.get('state'),'a state +/?');assert(!denied.url.searchParams.has('code'));
 assert.equal((await fetchWithCookies(origin+'/oauth/authorize?request='+id,anonymous)).status,400);
 const csrf=await fetch(origin+'/oauth/authorize',{method:'POST',headers:{Origin:'https://evil.example',Cookie:cookie(user),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({request_id:id,decision:'allow'})});assert.equal(csrf.status,403);
});

test('PKCE, exact redirect URI, resource binding, scope and folder restrictions',async()=>{
 const f=await flow({permission:'read',folder});
 assert.equal((await form('/oauth/token',{...codeBody(f),code_verifier:'x'.repeat(43)},400)).error,'invalid_grant');
 assert.equal((await form('/oauth/token',{...codeBody(f),redirect_uri:callback+'?wrong=1'},400)).error,'invalid_grant');
 assert.equal((await form('/oauth/token',{...codeBody(f),resource:'https://another.example/mcp'},400)).error,'invalid_target');
 const issued=await form('/oauth/token',codeBody(f));assert.equal(issued.scope,'wishlist:read');assert(issued.refresh_token);assert(issued.expires_in<=3600);
 const result=await mcp(issued.access_token);const found=JSON.parse(result.result.content[0].text);assert.equal(found.length,1);assert.equal(found[0].id,folder);
 const denied=await mcp(issued.access_token,'create_item',{folder_id:folder,title:'Denied'});assert(denied.result.isError);
 const writable=await flow({folder});const tokens=await form('/oauth/token',codeBody(writable));assert(!(await mcp(tokens.access_token,'create_item',{folder_id:folder,title:'OAuth find'})).result.isError);assert((await mcp(tokens.access_token,'create_item',{folder_id:other,title:'Outside folder'})).result.isError);
 // An already consumed code cannot be exchanged again; its grant is revoked.
 assert.equal((await form('/oauth/token',codeBody(writable),400)).error,'invalid_grant');await mcp(tokens.access_token,'list_folders',{},401);
 // Downgrade on refresh cannot subsequently be escalated.
 const full=await form('/oauth/token',codeBody(await flow()));const down=await form('/oauth/token',{client_id:publicClient.client_id,grant_type:'refresh_token',refresh_token:full.refresh_token,scope:'wishlist:read',resource});assert.equal(down.scope,'wishlist:read');assert.equal((await form('/oauth/token',{client_id:publicClient.client_id,grant_type:'refresh_token',refresh_token:down.refresh_token,scope:'wishlist:read wishlist:write'},400)).error,'invalid_scope');
});

test('access expiration, refresh rotation/reuse detection and connection revocation',async()=>{
 const issued=await form('/oauth/token',codeBody(await flow()));db.prepare('UPDATE oauth_access_tokens SET expires=0 WHERE hash=?').run(sha(issued.access_token));await mcp(issued.access_token,'list_folders',{},401);
 const rotated=await form('/oauth/token',{client_id:publicClient.client_id,grant_type:'refresh_token',refresh_token:issued.refresh_token,resource});assert.notEqual(rotated.refresh_token,issued.refresh_token);assert(!(await mcp(rotated.access_token)).result.isError);
 assert.equal((await form('/oauth/token',{client_id:publicClient.client_id,grant_type:'refresh_token',refresh_token:issued.refresh_token},400)).error,'invalid_grant');await mcp(rotated.access_token,'list_folders',{},401);assert.equal((await form('/oauth/token',{client_id:publicClient.client_id,grant_type:'refresh_token',refresh_token:rotated.refresh_token},400)).error,'invalid_grant');
 const revoked=await form('/oauth/token',codeBody(await flow()));await form('/oauth/revoke',{client_id:publicClient.client_id,token:revoked.refresh_token});await mcp(revoked.access_token,'list_folders',{},401);
 const ui=await form('/oauth/token',codeBody(await flow()));const g=db.prepare('SELECT grant_id FROM oauth_access_tokens WHERE hash=?').get(sha(ui.access_token))!;const profile=await web('/api/profile');assert(profile.oauth.some((v:any)=>v.id===g.grant_id));await web('/api/oauth-grants/'+g.grant_id,'DELETE');await mcp(ui.access_token,'list_folders',{},401);
 const expired=await flow();db.prepare('UPDATE oauth_codes SET expires=0 WHERE hash=?').run(sha(expired.code));assert.equal((await form('/oauth/token',codeBody(expired),400)).error,'invalid_grant');
});

test('confidential clients authenticate using their registered method',async()=>{
 const defaults=await register({token_endpoint_auth_method:undefined});assert.equal(defaults.token_endpoint_auth_method,'client_secret_basic');assert(defaults.client_secret);
 const post=await register({token_endpoint_auth_method:'client_secret_post'});assert(post.client_secret);const f=await flow({client:post});assert.equal((await form('/oauth/token',{...codeBody(f),client_secret:'wrong'},401)).error,'invalid_client');assert((await form('/oauth/token',codeBody(f))).access_token);
 const basic=await register({token_endpoint_auth_method:'client_secret_basic'});const b=await flow({client:basic});assert.equal((await form('/oauth/token',codeBody(b),401)).error,'invalid_client');const body=codeBody(b);delete (body as any).client_id;const issued=await form('/oauth/token',body,200,{Authorization:'Basic '+Buffer.from(basic.client_id+':'+basic.client_secret).toString('base64')});assert(issued.access_token);
 // Another client cannot revoke these tokens.
 await form('/oauth/revoke',{client_id:publicClient.client_id,token:issued.access_token});assert(!(await mcp(issued.access_token)).result.isError);
});

test('official MCP SDK discovers, registers, exchanges, refreshes and calls tools',async()=>{
 let registration:any,saved:any,verifier='',authorization:URL|undefined;
 const provider:OAuthClientProvider={redirectUrl:callback,clientMetadata:{redirect_uris:[callback],client_name:'Official SDK',token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'wishlist:read wishlist:write'},state:()=> 'sdk-state',clientInformation:()=>registration,saveClientInformation:v=>{registration=v;},tokens:()=>saved,saveTokens:v=>{saved=v;},saveCodeVerifier:v=>{verifier=v;},codeVerifier:()=>verifier,redirectToAuthorization:v=>{authorization=v;}};
 assert.equal(await auth(provider,{serverUrl:resource}),'REDIRECT');assert(authorization);const approved=await consent(authorization.toString(),{folder});assert.equal(approved.url.searchParams.get('state'),'sdk-state');assert.equal(await auth(provider,{serverUrl:resource,authorizationCode:approved.url.searchParams.get('code')!}),'AUTHORIZED');assert(saved.access_token);
 const client=new Client({name:'oauth-integration',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(resource),{authProvider:provider}));const tools=await client.listTools();assert(tools.tools.some(t=>t.name==='create_item'));const result=await client.callTool({name:'list_folders',arguments:{}});assert.equal(JSON.parse((result.content as any)[0].text)[0].id,folder);const oldRefresh=saved.refresh_token;db.prepare('UPDATE oauth_access_tokens SET expires=0 WHERE hash=?').run(sha(saved.access_token));const retried=await client.callTool({name:'list_folders',arguments:{}});assert(!retried.isError);assert.notEqual(saved.refresh_token,oldRefresh);}finally{await client.close();}
 const previous=saved.refresh_token;assert.equal(await auth(provider,{serverUrl:resource}),'AUTHORIZED');assert.notEqual(saved.refresh_token,previous);
});
