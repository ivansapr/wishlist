import { error, json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { one, all, run, transaction } from '#lib/server/db';
import { hash, now, passwordHash, passwordValid, rateLimit, secret, sessionUser, setSession } from '#lib/server/auth';
import { parse, createFolder } from '#lib/server/store';
const email=z.string().trim().toLowerCase().email().max(254);
const name=z.string().trim().min(1).max(100);
const password=z.string().min(12,'Use at least 12 characters.').max(256);
const registration=z.object({email,name,password});
type Key={id:string;user_id:string;public_key:string;counter:number;transports:string;name:string;created_at:string};
export const POST:RequestHandler=async event=>{
 const {action}=event.params; const body:any=parse(z.record(z.string(),z.unknown()),await event.request.json().catch(()=>error(400,'Invalid JSON.')));
 rateLimit(`auth:${event.getClientAddress()}`,40);
 const origin=process.env.ORIGIN||event.url.origin;
 const rpID=process.env.RP_ID||new URL(origin).hostname;
 if(action==='register'){
   const v=parse(registration,body);rateLimit(`register:${event.getClientAddress()}`,5,3600000);
   if(one('SELECT id FROM users WHERE email=?',v.email))error(409,'Unable to create this account. Try signing in.');
   const id=randomUUID();const encoded=passwordHash(v.password);
   transaction(()=>{run('INSERT INTO users (id,email,name,password,created_at) VALUES (?,?,?,?,?)',id,v.email,v.name,encoded,now());createFolder({userId:id,write:true,folderId:null},'My wishlist');});
   setSession(event,id);return json({ok:true});
 }
 if(action==='login'){
   const v=parse(z.object({email,password:z.string().max(256)}),body);
   rateLimit(`login:${v.email}`,10);
   const user=one<{id:string;password:string|null}>('SELECT id,password FROM users WHERE email=?',v.email);
   const fallback='00000000000000000000000000000000:'+ '00'.repeat(64);
   const valid=passwordValid(v.password,user?.password||fallback);
   if(!user||!user.password||!valid)error(401,'Email or password is incorrect.');
   setSession(event,user.id);return json({ok:true});
 }
 if(action==='logout') {const token=event.cookies.get('session');if(token)run('DELETE FROM sessions WHERE hash=?',hash(token));event.cookies.delete('session',{path:'/'});return json({ok:true});}
 if(action==='password') {const user=sessionUser(event);const v=parse(z.object({current:z.string().max(256),password}),body);const row=one<{password:string|null}>('SELECT password FROM users WHERE id=?',user.id)!;if(row.password&&!passwordValid(v.current,row.password))error(403,'Current password is incorrect.');run('UPDATE users SET password=? WHERE id=?',passwordHash(v.password),user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);setSession(event,user.id);return json({ok:true});}
 if(action==='passkey-options'){
   const mode=parse(z.enum(['register','login','enroll']),body.mode);
   let payload:{mode:string;userId?:string;email?:string;name?:string}={mode};
   if(mode!=='login'){
     if(mode==='enroll'){const user=sessionUser(event);payload={mode,userId:user.id,email:user.email,name:user.name};}
     else {const v=parse(z.object({email,name}),body);if(one('SELECT id FROM users WHERE email=?',v.email))error(409,'Unable to create this account. Try signing in.');payload={mode,userId:randomUUID(),...v};}
   }
   const options=mode==='login'?await generateAuthenticationOptions({rpID,userVerification:'required'}):await generateRegistrationOptions({rpName:'Wishlist',rpID,userName:payload.email!,userDisplayName:payload.name!,userID:new TextEncoder().encode(payload.userId!),attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:all<Key>('SELECT * FROM passkeys WHERE user_id=?',payload.userId!).map(k=>({id:k.id,transports:JSON.parse(k.transports)}))});
   const id=secret();run('DELETE FROM challenges WHERE expires<?',Date.now());run('INSERT INTO challenges VALUES (?,?,?,?)',id,options.challenge,JSON.stringify(payload),Date.now()+300000);
   event.cookies.set('challenge',id,{path:'/',httpOnly:true,sameSite:'strict',secure:event.url.protocol==='https:',maxAge:300});
   return json(options);
 }
 if(action==='passkey-verify'){
   const id=event.cookies.get('challenge');event.cookies.delete('challenge',{path:'/'});
   const c=id?one<{challenge:string;payload:string;expires:number}>('SELECT * FROM challenges WHERE id=?',id):undefined;
   if(id)run('DELETE FROM challenges WHERE id=?',id);
   if(!c||c.expires<Date.now())error(400,'This passkey request expired. Try again.');
   const payload=JSON.parse(c.payload);let userId:string;
   try {
     if(payload.mode==='login'){
       const key=one<Key>('SELECT * FROM passkeys WHERE id=?',String(body.id));if(!key)error(401,'Passkey not recognized.');
       const v=await verifyAuthenticationResponse({response:body,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{id:key.id,publicKey:new Uint8Array(Buffer.from(key.public_key,'base64url')),counter:key.counter,transports:JSON.parse(key.transports) as AuthenticatorTransportFuture[]}});
       if(!v.verified)error(401,'Passkey verification failed.');run('UPDATE passkeys SET counter=? WHERE id=?',v.authenticationInfo.newCounter,key.id);userId=key.user_id;
     }else{
       if(payload.mode==='enroll'&&sessionUser(event).id!==payload.userId)error(403,'Sign in again.');
       const v=await verifyRegistrationResponse({response:body,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
       if(!v.verified||!v.registrationInfo)error(401,'Passkey verification failed.');const {credential}=v.registrationInfo;
       userId=payload.userId;
       transaction(()=>{if(payload.mode==='register'){if(one('SELECT id FROM users WHERE email=?',payload.email))error(409,'Account already exists.');run('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)',userId,payload.email,payload.name,now());createFolder({userId,write:true,folderId:null},'My wishlist');}run('INSERT INTO passkeys VALUES (?,?,?,?,?,?,?)',credential.id,userId,Buffer.from(credential.publicKey).toString('base64url'),credential.counter,JSON.stringify(credential.transports||[]),'Passkey',now());});
     }
   }catch(e){if(e&&typeof e==='object'&&'status'in e)throw e;error(400,'Passkey verification failed. Please try again.');}
   setSession(event,userId);return json({ok:true});
 }
 error(404,'Unknown authentication action.');
};
