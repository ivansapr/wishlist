import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { userFromSession } from '#lib/server/auth';
export const handle: Handle = async ({event, resolve}) => {
  if (!['GET','HEAD','OPTIONS'].includes(event.request.method)) {
    const origin=event.request.headers.get('origin');
    const expected=process.env.ORIGIN || event.url.origin;
    if(origin && origin!==expected) error(403,'Request origin is not allowed.');
    if(!origin && event.cookies.get('session') && !event.request.headers.get('authorization')) error(403,'An Origin header is required.');
  }
  event.locals.user=userFromSession(event);
  const response=await resolve(event);
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('X-Frame-Options','DENY');
  if(event.locals.user||event.url.pathname==='/'||event.url.pathname.startsWith('/api')||event.url.pathname.startsWith('/assets')||event.url.pathname.startsWith('/share')||event.url.pathname==='/mcp') response.headers.set('Cache-Control','no-store');
  return response;
};
