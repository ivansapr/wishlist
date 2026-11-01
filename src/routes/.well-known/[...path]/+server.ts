import { error,json,type RequestHandler } from '@sveltejs/kit';
import { authorizationMetadata,resourceMetadata } from '#lib/server/oauth';
export const GET:RequestHandler=event=>{
 if(event.params.path==='oauth-authorization-server')return json(authorizationMetadata(event));
 if(['oauth-protected-resource','oauth-protected-resource/mcp'].includes(event.params.path||''))return json(resourceMetadata(event));
 error(404,'Metadata not found.');
};
