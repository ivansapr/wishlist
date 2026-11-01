<script>import { page } from '$app/state';</script>
<svelte:head><title>Not quite here — Wishlist</title></svelte:head>
<main class="error-page"><a href="/" class="wordmark">Wishlist.</a><span class="eyebrow">{page.status}</span><h1>Not quite here.</h1><p>{page.error?.message||'This page is unavailable.'}</p><a href="/" class="button">Back to your collection</a></main>
