import { DatabaseSync,backup } from 'node:sqlite';
import { mkdir,cp,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const source=resolve(process.env.DATA_DIR||'data');
if(!process.argv[2])throw new Error('Usage: node scripts/backup.mjs /path/to/new-backup-directory');
const destination=resolve(process.argv[2]);
if(destination===source||destination.startsWith(source+'/'))throw new Error('Backups must be outside the live data directory.');
await mkdir(destination,{recursive:false,mode:0o700});
const db=new DatabaseSync(join(source,'wishlist.sqlite'),{readOnly:true});
await backup(db,join(destination,'wishlist.sqlite'));
db.close();
// Assets are immutable and never physically deleted. Copying after the DB snapshot
// includes every referenced image even while new images are arriving.
try{await cp(join(source,'assets'),join(destination,'assets'),{recursive:true,errorOnExist:true,force:false});}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(join(destination,'backup.json'),JSON.stringify({version:1,created_at:new Date().toISOString()},null,2),{mode:0o600});
console.log('Backup complete. Keep this directory private; it includes account credentials and artwork.');
