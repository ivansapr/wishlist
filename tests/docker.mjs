import { execFileSync } from 'node:child_process';
const env={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=(...args)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const name='wishlist-check-'+Date.now(),volume=name+'-data';
const inside=code=>docker('exec',name,'node','--input-type=module','-e',code);
const requests=`const origin='http://localhost:3000';let cookie='';async function api(path,method='GET',body){const r=await fetch(origin+path,{method,headers:{Origin:origin,...cookie?{Cookie:cookie}:{},...body?{'Content-Type':'application/json'}:{}},body:body?JSON.stringify(body):undefined});const next=r.headers.get('set-cookie');if(next)cookie=next.split(';')[0];if(!r.ok)throw new Error(await r.text());return r.json();}`;
async function ready(){for(let i=0;i<40;i++){try{inside(`const r=await fetch('http://localhost:3000/health');if(!r.ok)process.exit(1);`);return;}catch{await new Promise(r=>setTimeout(r,250));}}throw new Error(docker('logs',name));}
try{
 docker('volume','create',volume);
 docker('run','-d','--name',name,'-e','ORIGIN=http://localhost:3000','-e','RP_ID=localhost','-v',volume+':/data','wishlist:local');
 await ready();
 inside(requests+`if(process.getuid()!==1000)throw new Error('Expected non-root runtime.');await api('/api/auth/register','POST',{email:'docker@example.test',name:'Docker test',password:'a long container password'});const state=await api('/api/state');const image=await (await import('sharp')).default({create:{width:10,height:10,channels:4,background:{r:90,g:70,b:40,alpha:.5}}}).png().toBuffer();const r=await fetch(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png'},body:image});if(!r.ok)throw new Error(await r.text());const asset=await r.json();await api('/api/items','POST',{folder_id:state.folders[0].id,title:'Persistent find',asset_id:asset.id});`);
 docker('restart',name);await ready();
 inside(requests+`await api('/api/auth/login','POST',{email:'docker@example.test',password:'a long container password'});const s=await api('/api/state');if(s.items.length!==1||s.items[0].title!=='Persistent find')throw new Error('Item did not persist.');const image=await fetch(origin+'/assets/'+s.items[0].asset_id,{headers:{Cookie:cookie}});if(!image.ok||image.headers.get('content-type')!=='image/webp')throw new Error('Artwork did not persist.');`);
 docker('exec',name,'node','scripts/backup.mjs','/tmp/wishlist-snapshot');
 docker('exec',name,'node','scripts/restore-check.mjs','/tmp/wishlist-snapshot');
 console.log('Docker checks passed: non-root runtime, authentication, SQLite/artwork persistence after restart, online backup and restore integrity.');
}finally{try{docker('rm','-f',name);}catch{}try{docker('volume','rm',volume);}catch{}}
