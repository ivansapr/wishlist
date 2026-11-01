<script lang="ts">
 import type { Item } from '#lib/types';
 let {item,shareToken='',hero=false}:{item:Item;shareToken?:string;hero?:boolean}=$props();
 const rotation=$derived(((Array.from(item.id).reduce((n,c)=>n+c.charCodeAt(0),0)%9)-4));
 let failed=$state(false);
 const src=$derived(item.artwork|| (item.asset_id?`/assets/${item.asset_id}${shareToken?'?share='+encodeURIComponent(shareToken):''}`:''));
</script>
<div class="artwork {item.style}" class:hero style:--rotation={`${rotation}deg`}>
 {#if src&&!failed}<img {src} alt={item.title} onerror={()=>failed=true}/>{:else}<div class="awaiting"><span>{item.title}</span><small>Awaiting artwork</small></div>{/if}
</div>
