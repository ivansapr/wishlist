import { sharedFolder } from '#lib/server/store';
export function load({params}:{params:{token:string}}) {return {...sharedFolder(params.token),token:params.token};}
