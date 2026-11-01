import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { userFromSession } from '#lib/server/auth';
export const handle: Handle = async ({event, resolve}) => {
  // OAuth protocol endpoints authenticate clients/tokens, never browser sessions.
  const protocol=/^\/oauth\/(register|token|revoke)$/.test(event.url.pathname);
  const cors=protocol||event.url.pathname==='/mcp'||event.url.pathname.startsWith('/.well-known/')||event.url.pathname==='/api/upload'&&(event.request.method==='OPTIONS'||!!event.request.headers.get('authorization')?.startsWith('Bearer '));
  const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID','Access-Control-Expose-Headers':'WWW-Authenticate, MCP-Session-Id','Cache-Control':'no-store'};
  if(cors&&event.request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if (!['GET','HEAD','OPTIONS'].includes(event.request.method)) {
    const origin=event.request.headers.get('origin');
    const expected=process.env.ORIGIN || event.url.origin;
    if(!cors && origin && origin!==expected) error(403,'Request origin is not allowed.');
    if(!cors && !origin && event.cookies.get('session') && !event.request.headers.get('authorization')) error(403,'An Origin header is required.');
  }
  event.locals.user=userFromSession(event);
  const response=await resolve(event);
  if(cors)for(const [key,value] of Object.entries(corsHeaders))response.headers.set(key,value);
  response.headers.set('X-Content-Type-Options','nosniff');
  // Native form submissions need a same-origin Origin header; no-referrer can
  // make browsers send Origin: null. External OAuth callbacks still receive no referrer.
  response.headers.set('Referrer-Policy',event.url.pathname==='/oauth/authorize'?'same-origin':'no-referrer');
  response.headers.set('X-Frame-Options','DENY');
  if(event.locals.user||event.url.pathname==='/'||event.url.pathname.startsWith('/api')||event.url.pathname.startsWith('/assets')||event.url.pathname.startsWith('/share')||event.url.pathname==='/mcp'||event.url.pathname.startsWith('/oauth/')) response.headers.set('Cache-Control','no-store');
  return response;
};
