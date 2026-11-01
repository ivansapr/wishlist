import { json,type RequestHandler } from '@sveltejs/kit';
import { oauthResponse,registerClient,revoke,token } from '#lib/server/oauth';
export const POST:RequestHandler=e=>oauthResponse(()=>{
 if(e.params.action==='register')return registerClient(e);
 if(e.params.action==='token')return token(e);
 if(e.params.action==='revoke')return revoke(e);
 return json({error:'invalid_request',error_description:'Unknown OAuth endpoint.'},{status:404});
});
