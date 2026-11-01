import { error,type RequestHandler } from '@sveltejs/kit';
import { hash } from '#lib/server/auth';
import { one } from '#lib/server/db';
import { assetBytes } from '#lib/server/assets';
export const GET:RequestHandler=async e=>{
 const id=e.params.id!;if(!/^[\da-f-]{36}$/.test(id))error(404,'Image not found.');
 const token=e.url.searchParams.get('share');
 const allowed=token?one(`SELECT i.id FROM items i JOIN shares s ON s.folder_id=i.folder_id WHERE s.hash=? AND i.asset_id=? AND i.deleted_at IS NULL`,hash(token),id):e.locals.user&&one('SELECT id FROM assets WHERE id=? AND user_id=?',id,e.locals.user.id);
 if(!allowed)error(404,'Image not found.');return new Response(new Uint8Array(await assetBytes(id)),{headers:{'Content-Type':'image/webp','Cache-Control':'no-store'}});
};
