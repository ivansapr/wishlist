<script lang="ts">
 import { onMount, untrack } from 'svelte';
 import { api,passkey } from '#lib/client';
 import type { User } from '#lib/types';
 let {user,onupdated}:{user:User;onupdated:()=>void}=$props();
 let name=$state(untrack(()=>user.name)),currency=$state(untrack(()=>user.currency)),current=$state(''),password=$state(''),message=$state(''),busy=$state(false),profile=$state<any>(null);
 async function refresh(){profile=await api('profile');}
 onMount(()=>{refresh().catch(e=>message=e.message);});
 async function action(fn:()=>Promise<unknown>){busy=true;message='';try{await fn();await refresh();message='Saved.';}catch(e){message=(e as Error).message;}finally{busy=false;}}
</script>
<div class="settings-page"><span class="eyebrow">A space of your own</span><h1>Your profile.</h1><p class="intro">The essentials, kept simple.</p>
 <section class="settings-card"><h2>About you</h2><form class="stacked-form" onsubmit={e=>{e.preventDefault();action(async()=>{await api('profile','PATCH',{name,currency});onupdated();});}}><label>Display name<input bind:value={name} required maxlength="100"/></label><label>Email<input value={user.email} readonly type="email"/></label><label>Preferred currency<input bind:value={currency} pattern={'[A-Z]{3}'} maxlength="3" required/></label><button class="button" disabled={busy}>Save profile</button></form></section>
 <section class="settings-card"><h2>Passkeys</h2><p>Sign in with your fingerprint, face, or device lock. Keep a second passkey or a password so you have another way in.</p>{#each profile?.keys||[] as k}<div class="settings-row"><div><strong>{k.name}</strong><small>Added {new Date(k.created_at).toLocaleDateString('en')}</small></div><button class="text-button" disabled={busy} onclick={()=>action(()=>api('passkeys/'+encodeURIComponent(k.id),'DELETE'))}>Remove</button></div>{/each}<button class="button" disabled={busy} onclick={()=>action(()=>passkey('enroll'))}>Add a passkey</button></section>
 <section class="settings-card"><h2>Password</h2><form class="stacked-form" onsubmit={e=>{e.preventDefault();action(async()=>{await api('auth/password','POST',{current,password});current='';password='';});}}><label>Current password <span class="optional">Leave blank if you use only a passkey</span><input type="password" bind:value={current} autocomplete="current-password" maxlength="256"/></label><label>New password<input type="password" bind:value={password} minlength="12" maxlength="256" autocomplete="new-password" required/></label><p class="field-hint">At least 12 characters. Changing it signs out your other sessions.</p><button class="button" disabled={busy}>Set password</button></form></section>
 <section class="settings-card"><h2>Signed-in sessions</h2>{#each profile?.sessions||[] as s}<div class="settings-row"><div><strong>{s.current?'This session':'Other session'}</strong><small>Expires {new Date(s.expires).toLocaleDateString('en')}</small></div>{#if !s.current}<button class="text-button" disabled={busy} onclick={()=>action(()=>api('sessions/'+s.id,'DELETE'))}>Sign out</button>{/if}</div>{/each}</section>
 {#if message}<p class="notice" role="status">{message}</p>{/if}
</div>
