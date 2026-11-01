import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parse,sharedFolder } from '#lib/server/store';
export function GET({params,url}:{params:{token:string};url:URL}){const offset=parse(z.coerce.number().int().min(0).max(100000),url.searchParams.get('offset')||0);return json(sharedFolder(params.token,offset));}
