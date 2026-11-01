<script lang="ts">
 import Scrapbook from '#lib/components/Scrapbook.svelte';
 import { untrack } from 'svelte';
 import type { Item } from '#lib/types';
 let {data}=$props();
 let items=$state<Item[]>(untrack(()=>data.items)),hasMore=$state(untrack(()=>data.hasMore)),message=$state('');
 async function more(){try{const r=await fetch(`/share/${data.token}/items?offset=${items.length}`);const next=await r.json();if(!r.ok)throw new Error(next.message||'Unable to load this folder.');items=[...items,...next.items];hasMore=next.hasMore;}catch(e){message=(e as Error).message;}}
</script>
<svelte:head><title>{data.folder.name} — Wishlist</title><meta name="robots" content="noindex,nofollow"/></svelte:head>
<div class="public-shell"><header class="public-header"><a href="/" class="wordmark">Wishlist.</a><span>A collection, shared with you.</span><a href="/" class="text-button">Make your own</a></header><main><div class="collection-heading"><div><span class="eyebrow">A little inspiration</span><h1>{data.folder.name}.</h1><p>{items.length}{hasMore?'+':''} things worth remembering.</p></div><span class="eyebrow">View-only collection</span></div><Scrapbook {items} {hasMore} onmore={more} folderName={data.folder.name} shareToken={data.token} readonly/>{#if message}<p class="notice" role="status">{message}</p>{/if}</main><footer class="collection-footer">Good things are better shared.</footer></div>
