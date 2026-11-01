import { createServer } from 'node:http';
// SvelteKit 3 adapter-node derives request origins from headers. Set these
// internally from the configured canonical origin so the same Docker image can
// run on any domain without trusting client-supplied forwarding headers.
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
const origin=new URL(process.env.ORIGIN||`http://localhost:${port}`);
if(!['http:','https:'].includes(origin.protocol)||origin.origin!==(process.env.ORIGIN||origin.origin))throw new Error('ORIGIN must be an http(s) origin without a path or trailing slash.');
process.env.ORIGIN=origin.origin;
process.env.PROTOCOL_HEADER='x-wishlist-protocol';
process.env.HOST_HEADER='x-wishlist-host';
process.env.BODY_SIZE_LIMIT||='6M';
const { handler }=await import('../build/handler.js');
const server=createServer((request,response)=>{
 // These cookie-independent protocol endpoints accept form POSTs from OAuth clients.
 // Normalize their Origin for SvelteKit’s form CSRF gate; browser account/consent
 // routes retain the original Origin and their normal protections.
 if(request.method==='POST'&&/^\/oauth\/(token|register|revoke)$/.test(new URL(request.url,origin).pathname))request.headers.origin=origin.origin;
 request.headers['x-wishlist-protocol']=origin.protocol.slice(0,-1);
 request.headers['x-wishlist-host']=origin.host;
 handler(request,response);
});
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Wishlist listening on port ${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{
 server.close(()=>process.exit(0));
 setTimeout(()=>process.exit(1),10000).unref();
});
