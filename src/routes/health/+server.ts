import { json } from '@sveltejs/kit';
import { one } from '#lib/server/db';
export function GET(){one('SELECT 1');return json({ok:true});}
