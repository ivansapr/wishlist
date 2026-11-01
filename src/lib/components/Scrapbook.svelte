<script lang="ts">
 import { tick } from 'svelte';
 import Artwork from './Artwork.svelte';
 import Modal from './Modal.svelte';
 import { latestPrice,money,type Item } from '#lib/types';
 let {items,folderName='All the things',shareToken='',readonly=false,onedit,ondelete,hasMore=false,onmore}:{items:Item[];folderName?:string;shareToken?:string;readonly?:boolean;onedit?:(item:Item)=>void;ondelete?:(item:Item)=>void;hasMore?:boolean;onmore?:()=>void}=$props();
 let selected=$state<Item|null>(null);
 let transition=$state<{src:string;left:number;top:number;width:number;height:number;toLeft:number;toTop:number;toWidth:number;toHeight:number}|null>(null);
 let moving=$state(false),closing=$state(false);
 async function closeSelected(){if(closing)return;const image=document.querySelector<HTMLImageElement>('dialog .hero img');const target=selected?document.querySelector<HTMLImageElement>(`[data-item-id="${selected.id}"] img`):null;const from=image?.getBoundingClientRect(),to=target?.getBoundingClientRect();if(from&&to&&image&&!matchMedia('(prefers-reduced-motion: reduce)').matches){closing=true;transition={src:image.src,left:from.left,top:from.top,width:from.width,height:from.height,toLeft:to.left,toTop:to.top,toWidth:to.width,toHeight:to.height};moving=false;requestAnimationFrame(()=>requestAnimationFrame(()=>moving=true));await new Promise(r=>setTimeout(r,290));}transition=null;selected=null;closing=false;}
 async function open(item:Item,event:MouseEvent){const img=(event.currentTarget as HTMLElement).querySelector('img');const r=img?.getBoundingClientRect();selected=item;await tick();if(r&&img&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const target=document.querySelector('dialog .hero img')?.getBoundingClientRect();if(target){transition={src:img.src,left:r.left,top:r.top,width:r.width,height:r.height,toLeft:target.left,toTop:target.top,toWidth:target.width,toHeight:target.height};moving=false;requestAnimationFrame(()=>requestAnimationFrame(()=>moving=true));setTimeout(()=>transition=null,300);}}}
 const date=(s:string)=>new Date(s).toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'});
</script>
{#if items.length}
 <div class="scrapbook" aria-label={folderName}>
 {#each items as item,i (item.id)}
 {@const price=latestPrice(item)}
 <button class="item-card size-{item.size}" style:--offset={`${[0,32,9,28,-2,20][i%6]}px`} onclick={(e)=>open(item,e)} data-item-id={item.id} aria-label={`Open ${item.title}${price?', '+money(price.amount,price.currency):''}`}>
 <div class="item-visual"><Artwork {item} {shareToken}/>{#if price}<span class="price-sticker">{money(price.amount,price.currency)}</span>{/if}</div>
 <span class="item-title">{item.title}</span><span class="item-kind">{item.style==='object'?'A little dimension':item.style==='stamp'?'A small keepsake':'Something to keep'}</span>
 </button>
 {/each}
 </div>
 {#if hasMore}<button class="button load-more" onclick={onmore}>Load more items</button>{/if}
{:else}<div class="empty"><span class="eyebrow">A little room for possibility</span><h2>What caught your eye?</h2><p>Save your first find. Give it a place to stay.</p></div>{/if}
{#if selected}
 {@const p=latestPrice(selected)}
 <Modal title={selected.title} wide onclose={closeSelected}>
 <div class="item-dialog">
 <div class="hero-wrap" class:in-flight={!!transition}><Artwork item={selected} {shareToken} hero/></div>
 <div class="details-paper">
 <span class="eyebrow">A closer look</span><h2>{selected.title}</h2>
 {#if p}<p class="detail-price">{money(p.amount,p.currency)}</p><p class="subtle">Recorded {date(p.observed_at)}{p.merchant?' · '+p.merchant:''}</p>{:else}<p class="subtle">No price recorded yet.</p>{/if}
 {#if selected.description}<p>{selected.description}</p>{/if}
 {#if !readonly&&selected.notes}<p class="private-note">{selected.notes}<small>Private note</small></p>{/if}
 {#if selected.source_url}<a class="inline-link" href={selected.source_url} target="_blank" rel="noopener noreferrer">Visit original source</a>{/if}
 {#if selected.prices.length}<details><summary>Price history <span>{selected.prices.length}</span></summary><div class="price-history">{#each selected.prices as price}<div><strong>{money(price.amount,price.currency)}</strong><span>{date(price.observed_at)}</span>{#if price.deal}<p>{price.deal}{price.expires_at&&Date.parse(price.expires_at)<Date.now()?' · Expired':''}</p>{/if}{#if price.shipping}<p>{price.shipping}</p>{/if}{#if price.source_url}<a href={price.source_url} target="_blank" rel="noopener noreferrer">{price.merchant||'Price source'}</a>{/if}</div>{/each}</div></details>{/if}
 {#if !readonly}<div class="detail-actions"><button class="text-button" onclick={()=>{const i=selected!;selected=null;onedit?.(i);}}>Edit item</button><button class="text-button" onclick={()=>{const i=selected!;selected=null;ondelete?.(i);}}>Move to trash</button></div>{/if}
 <p class="paper-footnote">{selected.style==='object'?'3D object':selected.style==='stamp'?'Postage stamp':'Sticker'} · {folderName}</p>
 </div></div>
 {#if transition}<div class="flying-art" style:left={`${moving?transition.toLeft:transition.left}px`} style:top={`${moving?transition.toTop:transition.top}px`} style:width={`${moving?transition.toWidth:transition.width}px`} style:height={`${moving?transition.toHeight:transition.height}px`}><img src={transition.src} alt=""/></div>{/if}
 </Modal>
{/if}
