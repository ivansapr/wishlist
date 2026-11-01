<script lang="ts">
 import { onMount } from 'svelte';
 import { api } from '#lib/client';
 import type { Folder } from '#lib/types';
 let {folders}:{folders:Folder[]}=$props();
 let tokens=$state<any[]>([]),name=$state('My assistant'),permission=$state('write'),folder=$state(''),token=$state(''),message=$state(''),busy=$state(false),origin=$state('');
 onMount(()=>{origin=location.origin;refresh();});
 async function refresh(){try{tokens=(await api('profile')).tokens;}catch(e){message=(e as Error).message;}}
 async function create(e:SubmitEvent){e.preventDefault();busy=true;message='';try{token=(await api('tokens','POST',{name,permission,folder_id:folder||null})).token;await refresh();}catch(e){message=(e as Error).message;}finally{busy=false;}}
 async function revoke(id:string){try{await api('tokens/'+id,'DELETE');token='';await refresh();}catch(e){message=(e as Error).message;}}
 async function copy(){try{await navigator.clipboard.writeText(token);message='Token copied.';}catch{message='Select the token below and copy it.';}}
</script>
<div class="settings-page"><span class="eyebrow">A little help finding things</span><h1>Your AI, connected.</h1><p class="intro">Let your assistant add finds, make artwork, and keep an eye on prices. Your scrapbook keeps the results.</p>
 <section class="settings-card"><h2>Connection details</h2><label>MCP endpoint<input readonly value={origin+'/mcp'}/></label><p class="subtle">Streamable HTTP · bearer token authentication</p><p>Use a client that supports a remote MCP server with a custom Authorization header. OAuth-only clients are not supported yet.</p><p class="field-hint">Your assistant does the research and image generation. This app does not automatically search shops, check prices, or generate images.</p></section>
 <section class="settings-card"><h2>Create a connection</h2><form class="stacked-form" onsubmit={create}><label>Connection name<input bind:value={name} required maxlength="100"/></label><div class="field-row"><label>Access<select bind:value={permission}><option value="write">Read and edit</option><option value="read">Read only</option></select></label><label>Collection<select bind:value={folder}><option value="">All folders</option>{#each folders as f}<option value={f.id}>{f.name}</option>{/each}</select></label></div><button class="button primary" disabled={busy}>{busy?'Creating…':'Create token'}</button></form>
 {#if token}<div class="token-result"><p>Save this token now. It will only be shown once.</p><textarea aria-label="New connection token" readonly value={token} rows="3"></textarea><button class="text-button" onclick={copy}>Copy token</button><p class="field-hint">Send it as Authorization: Bearer YOUR_TOKEN. Treat it like a password.</p></div>{/if}</section>
 <section class="settings-card"><h2>Active connections</h2>{#each tokens as t}<div class="settings-row"><div><strong>{t.name}</strong><small>{t.permission==='write'?'Read and edit':'Read only'} · {folders.find(f=>f.id===t.folder_id)?.name||'All folders'}</small></div><button class="text-button" onclick={()=>revoke(t.id)}>Revoke</button></div>{:else}<p class="subtle">No connections yet.</p>{/each}</section>
 {#if message}<p role="status" class="notice">{message}</p>{/if}
</div>
