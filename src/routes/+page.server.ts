import { folders,items } from '#lib/server/store';
export function load({locals}:{locals:App.Locals}) {const a=locals.user?{userId:locals.user.id,write:true,folderId:null}:null;const list=a?items(a):[];return {user:locals.user||null,folders:a?folders(a):[],items:list,hasMore:list.length===100};}
