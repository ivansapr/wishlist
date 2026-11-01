<script lang="ts">
 import { untrack } from 'svelte';
 let {data}=$props();
 let permission=$state(untrack(()=>data.requestedWrite?'write':'read'));
 let folder=$state('');
</script>
<svelte:head><title>Connect your assistant — Wishlist</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<main class="oauth-consent">
 <a href="/" class="wordmark">Wishlist.</a>
 <section class="auth-paper">
 <span class="eyebrow">A little help, with your permission</span>
 <h1>Connect your assistant.</h1>
 <p><strong>{data.clientName}</strong> is asking to connect to your Wishlist account.</p>
 <p class="subtle">Signed in as {data.userName}. The client name is supplied by the app. Continue only if you started this connection.</p>
 <p class="oauth-destination">Return address <strong>{data.redirectOrigin}</strong></p>
 <form method="POST" class="stacked-form">
 <input type="hidden" name="request_id" value={data.requestId}/>
 <label>Allow this assistant to<select name="permission" bind:value={permission}><option value="read">Read my saved items and prices</option>{#if data.requestedWrite}<option value="write">Read and edit my items, artwork and prices</option>{/if}</select></label>
 <label>Collection<select name="folder_id" bind:value={folder}><option value="">All folders</option>{#each data.folders as f}<option value={f.id}>{f.name}</option>{/each}</select></label>
 <p class="field-hint">{permission==='write'?'This includes adding, moving, editing and moving items to trash.':'This includes private notes and recorded price history.'} Your assistant can read private notes and price history within the allowed collection. It cannot change your password, sharing links, or other connections. You can revoke access in Connect AI.</p>
 <div class="detail-actions"><button class="button primary" name="decision" value="allow">Allow connection</button><button class="text-button" name="decision" value="deny">Cancel connection</button></div>
 </form>
 </section>
</main>
