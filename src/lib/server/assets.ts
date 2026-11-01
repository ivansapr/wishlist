import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { dataDir, run } from './db';
import { now, rateLimit, type Actor } from './auth';
export async function uploadAsset(a:Actor,request:Request){
 if(!a.write)error(403,'This connection is read-only.');rateLimit(`upload:${a.userId}`,30,60000);
 const type=request.headers.get('content-type')?.split(';')[0];if(!['image/png','image/webp'].includes(type||''))error(415,'Upload PNG or WebP artwork.');
 const reader=request.body?.getReader();if(!reader)error(400,'No image received.');let length=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>5*1024*1024){await reader.cancel();error(413,'Images must be smaller than 5 MB.');}chunks.push(value);}
 let bytes:Buffer, width:number,height:number;
 try{const image=sharp(Buffer.concat(chunks),{limitInputPixels:16777216,animated:false});const meta=await image.metadata();if(!['png','webp'].includes(meta.format||'')||!meta.width||!meta.height||meta.width>4096||meta.height>4096)throw new Error();const output=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer({resolveWithObject:true});bytes=output.data;width=output.info.width;height=output.info.height;}catch{error(400,'This image could not be read. Use a PNG or WebP up to 4096 × 4096 pixels.');}
 const id=randomUUID();await mkdir(join(dataDir,'assets'),{recursive:true});await writeFile(join(dataDir,'assets',id+'.webp'),bytes,{mode:0o600});run('INSERT INTO assets VALUES (?,?,?,?,?,?)',id,a.userId,'image/webp',width,height,now());return {id,width,height};
}
export async function assetBytes(id:string){try{return await readFile(join(dataDir,'assets',id+'.webp'));}catch{error(404,'Image not found.');}}
