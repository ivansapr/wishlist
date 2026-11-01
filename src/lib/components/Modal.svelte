<script lang="ts">
 import { onMount } from 'svelte';
 import type { Snippet } from 'svelte';
 let { title,children,onclose,wide=false }:{title:string;children:Snippet;onclose:()=>void;wide?:boolean}=$props();
 let dialog:HTMLDialogElement;
 onMount(()=>{const previous=document.activeElement as HTMLElement|null;dialog.showModal();return()=>{dialog?.close();previous?.focus({preventScroll:true});};});
</script>
<dialog bind:this={dialog!} class:wide aria-label={title} oncancel={(e)=>{e.preventDefault();onclose();}} onclick={(e)=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onclose();}}}>
 <button class="modal-close text-button" onclick={onclose}>Close</button>
 {@render children()}
</dialog>
