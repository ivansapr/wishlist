import { json, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { challengeHeader } from '#lib/server/oauth';
import { actor, rateLimit } from '#lib/server/auth';
import { uploadBase64Asset,maxAssetBase64Length } from '#lib/server/assets';
import { folders,createFolder,renameFolder,items,getItem,createItem,updateItem,deleteItem,restoreItem,prices,recordPrice,itemFields,itemChanges,priceFields,idempotent } from '#lib/server/store';
export const POST:RequestHandler=async e=>{
 const a=authenticate(e);if(a instanceof Response)return a;rateLimit(`mcp:${a.userId}`,120,60000);
 const server=new McpServer({name:'wishlist',version:'0.1.0'},{instructions:'Wishlist stores user collections. You perform shopping research and image preparation yourself. Never invent prices: record dated sources. Preserve original product photos whenever requested; do not redraw products unnecessarily. Upload PNG/WebP bytes using upload_asset with standard base64, then attach its returned asset ID. Use prepare_asset_upload only if your client can send authenticated binary HTTP requests. No server-side research or generation is available.'});
 const register=(name:string,description:string,schema:z.ZodRawShape,fn:(v:any)=>unknown,write=false)=>server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:!write,destructiveHint:name==='delete_item',openWorldHint:false}},async v=>{try{const result=await fn(v);return{content:[{type:'text' as const,text:JSON.stringify(result)}]};}catch(err){return{isError:true,content:[{type:'text' as const,text:JSON.stringify({error:isHttpError(err)?err.body.message:'The operation could not be completed.',status:isHttpError(err)?err.status:500})}]};}});
 const id=z.string().min(1),key=z.string().min(1).max(200).optional(),revision=z.number().int().positive();
 register('list_folders','List folders available to this connection.',{},()=>folders(a));
 register('create_folder','Create a folder.',{name:z.string().min(1).max(100)},v=>createFolder(a,v.name),true);
 register('update_folder','Rename a folder.',{id,name:z.string().min(1).max(100)},v=>renameFolder(a,v.id,v.name),true);
 register('list_items','List items, up to 100 per page.',{folder_id:id.optional(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(50)},v=>items(a,v.folder_id,v.offset,v.limit));
 register('get_item','Read an item with its revision and recorded prices.',{id},v=>getItem(a,v.id));
 register('create_item','Save an item. Supply an idempotency key for safe retries.',{...itemFields.shape,idempotency_key:key},v=>{const {idempotency_key,...input}=v;return idempotent(a,idempotency_key,{op:'create_item',input},()=>createItem(a,input));},true);
 register('update_item','Update fields using the current revision; stale writes fail.',{id,revision,changes:itemChanges},v=>updateItem(a,v.id,v.revision,v.changes),true);
 register('move_item','Move an item into another authorized folder.',{id,revision,folder_id:id},v=>updateItem(a,v.id,v.revision,{folder_id:v.folder_id}),true);
 register('delete_item','Move an item to recoverable trash.',{id,revision},v=>deleteItem(a,v.id,v.revision),true);
 register('restore_item','Restore a trashed item.',{id},v=>restoreItem(a,v.id),true);
 register('list_price_observations','Read dated price observations.',{item_id:id},v=>prices(a,v.item_id));
 register('record_price_observation','Record a sourced price in integer currency minor units. Research is performed by you, not this server.',{...priceFields.shape,idempotency_key:key},v=>{const {idempotency_key,...input}=v;return idempotent(a,idempotency_key,{op:'record_price',input},()=>recordPrice(a,input));},true);
 register('upload_asset','Upload original or prepared PNG/WebP image bytes directly through MCP. Supply standard base64 without a data URL prefix, maximum 5 MiB decoded. Returns an asset id for attach_item_asset; no separate HTTP request or bearer token access is needed.',{content_type:z.enum(['image/png','image/webp']),image_base64:z.string().min(4).max(maxAssetBase64Length)},v=>uploadBase64Asset(a,v.content_type,v.image_base64),true);
 register('prepare_asset_upload','Get binary HTTP upload instructions. Prefer upload_asset when the client cannot access its bearer token.',{},()=>({mcp_tool:'upload_asset',url:`${process.env.ORIGIN||e.url.origin}/api/upload`,method:'POST',content_types:['image/png','image/webp'],max_bytes:5*1024*1024,authorization:'Use the same Authorization bearer token as this connection.',response:'JSON containing id; attach that asset ID to an item.'}));
 register('attach_item_asset','Attach previously uploaded artwork to an item using its revision.',{id,revision,asset_id:id},v=>updateItem(a,v.id,v.revision,{asset_id:v.asset_id}),true);
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:8*1024*1024});
 await server.connect(transport);
 try {const response=await transport.handleRequest(e.request);const bytes=await response.arrayBuffer();return new Response(bytes,{status:response.status,headers:response.headers});}finally{await server.close();}
};
function authenticate(e:Parameters<RequestHandler>[0]){if(!e.request.headers.get('authorization')?.startsWith('Bearer '))return json({error:'OAuth authorization or a connection token is required.'},{status:401,headers:{'WWW-Authenticate':challengeHeader(e)}});try{return actor(e);}catch(err){if(isHttpError(err)&&err.status===401)return json({error:'invalid_token'},{status:401,headers:{'WWW-Authenticate':challengeHeader(e,true)}});throw err;}}
export const GET:RequestHandler=e=>{const a=authenticate(e);return a instanceof Response?a:json({error:'This stateless MCP server accepts POST requests.'},{status:405,headers:{Allow:'POST'}});};

