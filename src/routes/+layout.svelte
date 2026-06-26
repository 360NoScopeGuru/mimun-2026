<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	// Cross-fade between pages on navigation using the browser's View Transitions
	// API. Falls back to an instant swap where unsupported, and the reduced-motion
	// guard in layout.css disables the cross-fade for users who ask for less motion.
	onNavigate((navigation) => {
		if (typeof document === 'undefined' || !document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
