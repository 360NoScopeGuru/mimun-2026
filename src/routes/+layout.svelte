<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<!-- A tenant's accent overrides the brass token app-wide (display:contents keeps layout untouched). -->
<div style="display: contents" style:--color-brass-500={data.branding?.accent}>
	{@render children()}
</div>
