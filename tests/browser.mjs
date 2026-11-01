import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,mkdir,rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'wishlist-browser-'));
const origin='http://localhost:4174';
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4174',ORIGIN:origin,DATA_DIR:dir,BODY_SIZE_LIMIT:'6M'},stdio:'pipe'});
let log='';server.stderr.on('data',v=>log+=v);
let browser,page;
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('work/screenshots',{recursive:true});
 await page.goto(origin);await page.getByRole('heading',{name:'Start collecting.'}).waitFor();
 await page.screenshot({path:'work/screenshots/welcome-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'Take a look inside'}).click();await page.locator('.item-card').first().waitFor();assert.equal(await page.locator('.item-card').count(),6);
 await page.screenshot({path:'work/screenshots/scrapbook-desktop.png',fullPage:true});
 const card=page.locator('.item-card').first();await card.click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(350);
 await page.screenshot({path:'work/screenshots/item-dialog.png',fullPage:true});
 // Dialog retains keyboard focus and Escape returns it to the originating card.
 await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('dialog')));
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert(await card.evaluate(el=>document.activeElement===el));
 await page.goto(origin);await page.getByLabel('Your name',{exact:true}).fill('Mira');await page.getByLabel('Email address').fill('mira@example.test');await page.getByLabel('Password',{exact:true}).fill('a very long browser password');await page.getByRole('button',{name:'Create your account',exact:true}).click();await page.getByRole('heading',{name:'All the things.'}).waitFor();
 await page.getByRole('button',{name:'Add a find'}).click();await page.getByLabel('What is it?').fill('The weekend cup');await page.getByLabel('Price, if known').fill('38.50');await page.getByRole('button',{name:'Add to scrapbook'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.getByRole('button',{name:/Open The weekend cup/}).waitFor();
 await page.getByRole('button',{name:/Open The weekend cup/}).click();await page.getByRole('button',{name:'Edit item',exact:true}).click();await page.getByLabel('Private notes').fill('My private note');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:/My wishlist/}).click();await page.getByRole('button',{name:'Share folder',exact:true}).click();await page.getByRole('button',{name:'Create sharing link',exact:true}).click();const link=await page.getByLabel('Your view-only link').inputValue();assert(link.includes('/share/'));await page.getByRole('button',{name:'Close',exact:true}).click();
 const publicPage=await browser.newPage();await publicPage.goto(link);assert(!((await publicPage.content()).includes('My private note')));await publicPage.close();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/screenshots/scrapbook-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Folders',exact:true}).click();await page.getByRole('button',{name:'Mira Your profile'}).click();await page.getByRole('heading',{name:'Your profile.'}).waitFor();
 // Verify real WebAuthn server challenges and signatures using Chromium's virtual authenticator.
 const cdp=await page.context().newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.getByRole('button',{name:'Add a passkey',exact:true}).click();await page.getByRole('button',{name:'Remove',exact:true}).waitFor();
 await page.getByRole('button',{name:'Folders',exact:true}).click();await page.getByRole('complementary').getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Start collecting.'}).waitFor();await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Sign in with a passkey',exact:true}).click();await page.getByRole('heading',{name:'All the things.'}).waitFor();
 // Passkey-first account creation also exercises registration without a password.
 await page.getByRole('button',{name:'Folders',exact:true}).click();await page.getByRole('complementary').getByRole('button',{name:'Sign out',exact:true}).click();await page.getByLabel('Your name',{exact:true}).fill('Passkey Person');await page.getByLabel('Email address').fill('key@example.test');await page.getByRole('button',{name:'Create account with a passkey',exact:true}).click();await page.getByRole('heading',{name:'All the things.'}).waitFor();
 // Reduced motion still opens a usable item dialog.
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/demo');await page.locator('.item-card').first().click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.flying-art').count(),0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: desktop/mobile layouts, dialog focus, item creation/editing, sharing privacy, password registration, passkey enrollment/login/registration, reduced motion.');
}catch(e){console.error(log);if(page){console.error(await page.locator('.form-error').allTextContents());await page.screenshot({path:'work/screenshots/failure.png',fullPage:true}).catch(()=>{});}throw e;}finally{await browser?.close();server.kill();await new Promise(r=>setTimeout(r,100));await rm(dir,{recursive:true,force:true});}
