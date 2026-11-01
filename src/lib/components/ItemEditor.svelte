<script lang="ts">
 import { untrack } from 'svelte';
 import Modal from './Modal.svelte';
 import { api,upload } from '#lib/client';
 import { minorUnits,type Item,type Folder } from '#lib/types';
 let {item,folders,folderId,currency='EUR',onsaved,onclose}:{item:Item|null;folders:Folder[];folderId:string;currency?:string;onsaved:()=>void;onclose:()=>void}=$props();
 let title=$state(untrack(()=>item?.title||'')),folder=$state(untrack(()=>item?.folder_id||folderId||folders[0]?.id||'')),style=$state(untrack(()=>item?.style||'sticker')),size=$state(untrack(()=>item?.size||'medium')),source=$state(untrack(()=>item?.source_url||'')),notes=$state(untrack(()=>item?.notes||'')),description=$state(untrack(()=>item?.description||'')),amount=$state(''),unit=$state(untrack(()=>currency)),busy=$state(false),message=$state('');
 let file:HTMLInputElement;let uploadedFile:File|undefined;let uploadedAsset:string|null=null;
 const observedAt=new Date().toISOString();const requestKey=crypto.randomUUID();
 async function save(e:SubmitEvent){e.preventDefault();message='';busy=true;try{const price=amount!==''?{amount:minorUnits(amount,unit),currency:unit,source_url:source,observed_at:observedAt}:undefined;let asset=item?.asset_id||null;if(file.files?.[0]){if(uploadedFile!==file.files[0]){uploadedAsset=await upload(file.files[0]);uploadedFile=file.files[0];}asset=uploadedAsset;}const body={title,folder_id:folder,style,size,source_url:source,notes,description,asset_id:asset,...price?{price_data:price}:{}};await api(item?'items/'+item.id:'items',item?'PATCH':'POST',item?{...body,revision:item.revision}:body,item?undefined:requestKey);onsaved();}catch(e){message=(e as Error).message;}finally{busy=false;}}
</script>
<Modal title={item?'Edit item':'Save a little something'} {onclose}>
 <span class="eyebrow">{item?'Make it yours':'For the collection'}</span><h2>{item?'A few details.':'Save a little something.'}</h2>
 <form onsubmit={save} class="stacked-form">
 <label>What is it?<input bind:value={title} required maxlength="160" placeholder="Something worth remembering"/></label>
 <div class="field-row"><label>Folder<select bind:value={folder} required>{#each folders as f}<option value={f.id}>{f.name}</option>{/each}</select></label><label>Presentation<select bind:value={style}><option value="sticker">Sticker</option><option value="stamp">Postage stamp</option><option value="object">3D object</option></select></label></div>
 <div class="field-row"><label>Display size<select bind:value={size}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label>{item?'Record a new price':'Price, if known'}<input bind:value={amount} inputmode="decimal" placeholder="0.00"/></label><label class="currency-field">Currency<input bind:value={unit} maxlength="3" pattern={'[A-Z]{3}'} required/></label></div>
 <label>Original link<input bind:value={source} type="url" placeholder="https://" maxlength="2048"/></label>
 <label>Artwork <span class="optional">PNG or WebP · up to 5 MB</span><input type="file" bind:this={file!} accept="image/png,image/webp"/></label><p class="field-hint">Have your connected AI create a transparent {style==='object'?'3D object':style==='stamp'?'postage stamp':'sticker'}. You can save now and add artwork later.</p>
 <label>Public description<textarea bind:value={description} maxlength="2000" rows="2" placeholder="A little context, visible when shared"></textarea></label>
 <label>Private notes<textarea bind:value={notes} maxlength="10000" rows="2" placeholder="Just for you"></textarea></label>
 {#if message}<p class="form-error" role="alert">{message}</p>{/if}
 <button class="button primary" disabled={busy}>{busy?'Saving…':item?'Save changes':'Add to scrapbook'}</button>
 </form>
</Modal>
