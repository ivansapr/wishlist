import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { error, json, redirect, type RequestEvent } from '@sveltejs/kit';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { all, one, run, transaction } from './db';
import { hash, now, rateLimit, secret, sessionUser } from './auth';
import { folderAccess, folders } from './store';

export const SCOPES = ['wishlist:read', 'wishlist:write'];
const ACCESS_SECONDS = 3600;
const GRANT_MS = 30 * 86400000;
export const base = (event: RequestEvent) => process.env.ORIGIN || event.url.origin;
export const resource = (event: RequestEvent) => base(event) + '/mcp';
export const resourceMetadata = (event: RequestEvent) => ({
 resource: resource(event), authorization_servers: [base(event)],
 scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'Wishlist'
});
export const authorizationMetadata = (event: RequestEvent) => ({
 issuer: base(event), authorization_endpoint: base(event) + '/oauth/authorize',
 token_endpoint: base(event) + '/oauth/token', registration_endpoint: base(event) + '/oauth/register',
 revocation_endpoint: base(event) + '/oauth/revoke', scopes_supported: SCOPES,
 response_types_supported: ['code'], response_modes_supported: ['query'],
 grant_types_supported: ['authorization_code', 'refresh_token'],
 code_challenge_methods_supported: ['S256'],
 token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
 revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
 client_id_metadata_document_supported: false, authorization_response_iss_parameter_supported: true
});
export function challengeHeader(event: RequestEvent, invalid = false) {
 return `Bearer resource_metadata="${base(event)}/.well-known/oauth-protected-resource/mcp", scope="wishlist:read wishlist:write"${invalid ? ', error="invalid_token"' : ''}`;
}
export class OAuthError extends Error {
 constructor(public code: string, message: string, public status = 400) { super(message); }
}
function invalid(code: string, message: string, status = 400): never { throw new OAuthError(code, message, status); }
export function oauthResponse(fn: () => Promise<Response> | Response) {
 return Promise.resolve().then(fn).catch(e => {
  if (!(e instanceof OAuthError)) throw e;
  return json({error:e.code,error_description:e.message},{status:e.status,headers:e.code==='invalid_client'?{'WWW-Authenticate':'Basic realm="Wishlist OAuth"'}:undefined});
 });
}
function scopes(value: string | null, fallback = 'wishlist:read') {
 const list = [...new Set((value === null ? fallback : value).split(' ').filter(Boolean))];
 if (!list.length || list.some(s => !SCOPES.includes(s))) invalid('invalid_scope', 'Use wishlist:read and optionally wishlist:write.');
 if (list.includes('wishlist:write') && !list.includes('wishlist:read')) list.unshift('wishlist:read');
 return SCOPES.filter(s => list.includes(s)).join(' ');
}
function target(event: RequestEvent, value: string | null) {
 if (value !== null && value !== resource(event)) invalid('invalid_target', 'The resource must be this server’s MCP endpoint.');
 return resource(event);
}
function equal(left: string, right: string) {
 const a = Buffer.from(left), b = Buffer.from(right);
 return a.length === b.length && timingSafeEqual(a, b);
}
function safeRedirect(value: string) {
 try {
  const u = new URL(value);
  return !u.hash && !u.username && !u.password && (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname));
 } catch { return false; }
}
export async function registerClient(event: RequestEvent) {
 rateLimit('oauth-register:' + event.getClientAddress(), 20, 3600000);
 if (event.request.headers.get('content-type')?.split(';')[0] !== 'application/json') invalid('invalid_request', 'Registration requires application/json.');
 const body = await event.request.text();
 if(body.length>16384)invalid('invalid_client_metadata','Client metadata is too large.');
 let input:unknown;try{input=JSON.parse(body);}catch{invalid('invalid_client_metadata','Invalid JSON.');}
 const result = OAuthClientMetadataSchema.safeParse(input);
 if (!result.success) invalid('invalid_client_metadata', 'Supply valid client metadata and redirect URIs.');
 const v = result.data;
 if (!v.redirect_uris.length || v.redirect_uris.length > 10 || v.redirect_uris.some(uri => uri.length > 2048 || !safeRedirect(uri))) invalid('invalid_redirect_uri', 'Use exact HTTPS redirect URIs, or HTTP loopback URIs, without fragments or credentials.');
 const method = v.token_endpoint_auth_method ?? 'client_secret_basic';
 if (!['none','client_secret_post','client_secret_basic'].includes(method)) invalid('invalid_client_metadata','Unsupported client authentication method.');
 const grants = v.grant_types || ['authorization_code','refresh_token'];
 if (!grants.includes('authorization_code') || grants.some(g => !['authorization_code','refresh_token'].includes(g)) || v.response_types?.some(t => t !== 'code')) invalid('invalid_client_metadata','Only authorization code and refresh token grants are supported.');
 if ((v.client_name?.length || 0) > 100) invalid('invalid_client_metadata','Client name must be at most 100 characters.');
 const metadata = {redirect_uris:[...new Set(v.redirect_uris)],token_endpoint_auth_method:method,grant_types:grants,response_types:['code'],client_name:v.client_name?.trim() || 'AI assistant',scope:scopes(v.scope ?? null,SCOPES.join(' '))};
 const id = randomUUID(), clientSecret = method === 'none' ? null : secret();
 run('INSERT INTO oauth_clients VALUES (?,?,?,?)',id,JSON.stringify(metadata),clientSecret ? hash(clientSecret) : null,now());
 return json({...metadata,client_id:id,client_id_issued_at:Math.floor(Date.now()/1000),...(clientSecret ? {client_secret:clientSecret,client_secret_expires_at:0} : {})},{status:201});
}
type Client = {id:string;metadata:string;secret_hash:string|null};
type Grant = {id:string;client_id:string;user_id:string;folder_id:string|null;scopes:string;resource:string;expires:number;revoked:number};
type Pending = {id:string;client_id:string;redirect_uri:string;challenge:string;state:string|null;scopes:string;resource:string;browser_hash:string;user_id:string|null;expires:number};
function client(id: string | null) {
 const row = id ? one<Client>('SELECT * FROM oauth_clients WHERE id=?',id) : undefined;
 if (!row) invalid('invalid_client','Unknown OAuth client.',401);
 return row;
}
function unique(params: URLSearchParams) {
 for (const key of new Set(params.keys())) if (params.getAll(key).length > 1) invalid('invalid_request','Duplicate OAuth parameters are not allowed.');
 return params;
}
export function startAuthorization(event: RequestEvent) {
 const q = unique(event.url.searchParams);
 if (q.has('request')) return q.get('request')!;
 rateLimit('oauth-authorize:' + event.getClientAddress(), 60, 600000);
 const c = client(q.get('client_id')), meta = JSON.parse(c.metadata);
 const uri = q.get('redirect_uri');
 if (!uri || !meta.redirect_uris.includes(uri)) invalid('invalid_request','Redirect URI does not match this client’s registration.');
 if (q.get('response_type') !== 'code') invalid('unsupported_response_type','Use response_type=code.');
 if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') || '')) invalid('invalid_request','A valid S256 PKCE challenge is required.');
 const approvedScopes = scopes(q.get('scope'),SCOPES.join(' '));
 if (approvedScopes.split(' ').some(s => !meta.scope.split(' ').includes(s))) invalid('invalid_scope','Scope was not registered for this client.');
 const audience = target(event,q.get('resource'));
 const state = q.get('state');
 if ((state?.length || 0) > 2048) invalid('invalid_request','State is too long.');
 const browser = event.cookies.get('oauth_flow') || secret();
 event.cookies.set('oauth_flow',browser,{path:'/',httpOnly:true,sameSite:'lax',secure:event.url.protocol==='https:',maxAge:600});
 const id = secret();
 run('DELETE FROM oauth_requests WHERE expires<?',Date.now());
 run('INSERT INTO oauth_requests VALUES (?,?,?,?,?,?,?,?,?,?)',id,c.id,uri,q.get('code_challenge')!,state,approvedScopes,audience,hash(browser),null,Date.now()+600000);
 return id;
}
function pending(event: RequestEvent,id: string) {
 const p = one<Pending>('SELECT * FROM oauth_requests WHERE id=?',id);
 if (!p || p.expires < Date.now() || !equal(p.browser_hash,hash(event.cookies.get('oauth_flow') || ''))) error(400,'This authorization request expired or belongs to another browser. Start again from your assistant.');
 return p;
}
export function authorizationPage(event: RequestEvent) {
 let id: string;
 try { id = startAuthorization(event); } catch (e) { if (e instanceof OAuthError) error(e.status,e.message); throw e; }
 const p = pending(event,id);
 if (!event.locals.user) redirect(303,'/?oauth_request=' + encodeURIComponent(id));
 if (p.user_id && p.user_id !== event.locals.user.id) error(403,'This request belongs to another signed-in account. Start again from your assistant.');
 run('UPDATE oauth_requests SET user_id=? WHERE id=?',event.locals.user.id,id);
 const c = client(p.client_id);
 return {requestId:id,clientName:JSON.parse(c.metadata).client_name,redirectOrigin:new URL(p.redirect_uri).origin,requestedWrite:p.scopes.includes('wishlist:write'),folders:folders({userId:event.locals.user.id,write:true,folderId:null}),userName:event.locals.user.name};
}
export async function authorize(event: RequestEvent) {
 const user = sessionUser(event);
 const form = await event.request.formData();
 const id = String(form.get('request_id') || '');
 const p = pending(event,id);
 if (p.user_id !== user.id) error(403,'This authorization request belongs to another account.');
 const callback = new URL(p.redirect_uri);
 callback.searchParams.set('iss',base(event));
 if (p.state !== null) callback.searchParams.set('state',p.state);
 if (form.get('decision') === 'deny') {
  run('DELETE FROM oauth_requests WHERE id=?',id);
  callback.searchParams.set('error','access_denied');redirect(303,callback.toString(),{external:[callback.origin]});
 }
 if (form.get('decision') !== 'allow') error(400,'Choose whether to allow this connection.');
 const permission = String(form.get('permission') || 'read');
 if (!['read','write'].includes(permission) || permission === 'write' && !p.scopes.includes('wishlist:write')) error(400,'This client did not request that permission.');
 const folder = String(form.get('folder_id') || '') || null;
 if (folder) folderAccess({userId:user.id,write:true,folderId:null},folder);
 const approved = permission === 'write' ? 'wishlist:read wishlist:write' : 'wishlist:read';
 const code = secret(), grantId = randomUUID();
 transaction(() => {
  if (!run('DELETE FROM oauth_requests WHERE id=?',id).changes) error(400,'This authorization request has already been used.');
  run('INSERT INTO oauth_grants VALUES (?,?,?,?,?,?,?,?,0)',grantId,p.client_id,user.id,folder,approved,p.resource,now(),Date.now()+GRANT_MS);
  run('INSERT INTO oauth_codes VALUES (?,?,?,?,?,0)',hash(code),grantId,p.redirect_uri,p.challenge,Date.now()+180000);
 });
 callback.searchParams.set('code',code);redirect(303,callback.toString(),{external:[callback.origin]});
}
async function parameters(event: RequestEvent) {
 if (event.request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') invalid('invalid_request','Use application/x-www-form-urlencoded.');
 const body = await event.request.text();
 if (body.length > 16384) invalid('invalid_request','OAuth request is too large.');
 return unique(new URLSearchParams(body));
}
function authenticate(event: RequestEvent,p: URLSearchParams) {
 let id = p.get('client_id'), supplied = p.get('client_secret'), method = supplied === null ? 'none' : 'client_secret_post';
 const header = event.request.headers.get('authorization');
 if (header) {
  if (!header.startsWith('Basic ') || supplied !== null) invalid('invalid_client','Use one supported client authentication method.',401);
  try {
   const decoded = Buffer.from(header.slice(6),'base64').toString('utf8'), colon = decoded.indexOf(':');
   if (colon < 0) throw new Error();
   const basicId = decodeURIComponent(decoded.slice(0,colon).replace(/\+/g,' '));
   if (id !== null && id !== basicId) throw new Error();
   id = basicId; supplied = decodeURIComponent(decoded.slice(colon+1).replace(/\+/g,' '));method='client_secret_basic';
  } catch { invalid('invalid_client','Invalid client authentication.',401); }
 }
 const c = client(id), meta = JSON.parse(c.metadata);
 if (method !== meta.token_endpoint_auth_method || c.secret_hash && (supplied === null || !equal(c.secret_hash,hash(supplied)))) invalid('invalid_client','Invalid client authentication.',401);
 return c;
}
function activeGrant(id:string,clientId:string) {
 const g = one<Grant>('SELECT * FROM oauth_grants WHERE id=? AND client_id=?',id,clientId);
 if (!g || g.revoked || g.expires <= Date.now()) invalid('invalid_grant','This authorization expired or was revoked.');
 return g;
}
function issue(g:Grant,approved:string,refresh:boolean) {
 const access = secret(), refreshToken = refresh ? secret() : null;
 const expires = Math.min(Date.now()+ACCESS_SECONDS*1000,g.expires);
 run('INSERT INTO oauth_access_tokens VALUES (?,?,?,?)',hash(access),g.id,approved,expires);
 if (refreshToken) run('INSERT INTO oauth_refresh_tokens VALUES (?,?,?,?,0)',hash(refreshToken),g.id,approved,g.expires);
 return {access_token:access,token_type:'Bearer',expires_in:Math.max(0,Math.floor((expires-Date.now())/1000)),scope:approved,...refreshToken?{refresh_token:refreshToken}:{}};
}
export async function token(event:RequestEvent) {
 rateLimit('oauth-token:'+event.getClientAddress(),120,60000);
 const p = await parameters(event), c = authenticate(event,p), meta = JSON.parse(c.metadata);
 target(event,p.get('resource'));
 const type = p.get('grant_type');
 if (type === 'authorization_code') {
  const code = one<{hash:string;grant_id:string;redirect_uri:string;challenge:string;expires:number;used:number}>('SELECT * FROM oauth_codes WHERE hash=?',hash(p.get('code') || ''));
  if (!code) invalid('invalid_grant','Invalid authorization code.');
  const g = activeGrant(code.grant_id,c.id);
  if(g.resource!==resource(event))invalid('invalid_target','Authorization belongs to another resource.');
  const verifier = p.get('code_verifier') || '';
  if (code.expires <= Date.now() || code.redirect_uri !== p.get('redirect_uri') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !equal(code.challenge,createHash('sha256').update(verifier).digest('base64url'))) invalid('invalid_grant','Authorization code, redirect URI or PKCE verifier is invalid.');
  if (code.used) { run('UPDATE oauth_grants SET revoked=1 WHERE id=?',g.id);invalid('invalid_grant','Authorization code was already used.'); }
  return json(transaction(() => {run('UPDATE oauth_codes SET used=1 WHERE hash=?',code.hash);return issue(g,g.scopes,meta.grant_types.includes('refresh_token'));}));
 }
 if (type === 'refresh_token') {
  if (!meta.grant_types.includes('refresh_token')) invalid('unauthorized_client','This client did not register for refresh tokens.');
  const row = one<{hash:string;grant_id:string;scopes:string;expires:number;used:number}>('SELECT * FROM oauth_refresh_tokens WHERE hash=?',hash(p.get('refresh_token') || ''));
  if (!row) invalid('invalid_grant','Invalid refresh token.');
  const g = activeGrant(row.grant_id,c.id);
  if(g.resource!==resource(event))invalid('invalid_target','Authorization belongs to another resource.');
  if (row.expires <= Date.now()) invalid('invalid_grant','Refresh token expired.');
  if (row.used) {run('UPDATE oauth_grants SET revoked=1 WHERE id=?',g.id);invalid('invalid_grant','Refresh token was reused; this connection has been revoked.');}
  const approved = scopes(p.get('scope'),row.scopes);
  if (approved.split(' ').some(s => !row.scopes.split(' ').includes(s))) invalid('invalid_scope','A refresh cannot increase access.');
  return json(transaction(() => {run('UPDATE oauth_refresh_tokens SET used=1 WHERE hash=?',row.hash);return issue(g,approved,true);}));
 }
 invalid('unsupported_grant_type','Use authorization_code or refresh_token.');
}
export async function revoke(event:RequestEvent) {
 rateLimit('oauth-revoke:'+event.getClientAddress(),120,60000);
 const p = await parameters(event), c = authenticate(event,p);
 const value = p.get('token');
 if (!value) invalid('invalid_request','A token is required.');
 const row = one<{grant_id:string}>(`SELECT t.grant_id FROM oauth_access_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.hash=? AND g.client_id=? UNION SELECT t.grant_id FROM oauth_refresh_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.hash=? AND g.client_id=?`,hash(value),c.id,hash(value),c.id);
 if (row) run('UPDATE oauth_grants SET revoked=1 WHERE id=?',row.grant_id);
 return new Response(null,{status:200});
}
export function connections(userId:string) {
 return all('SELECT g.id,c.metadata,g.scopes,g.folder_id,g.created_at,g.expires FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.user_id=? AND g.revoked=0 AND g.expires>? ORDER BY g.created_at DESC',userId,Date.now()).map(({metadata,...g})=>({...g,name:JSON.parse(String(metadata)).client_name}));
}
