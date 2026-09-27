<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { session, canUseBuilder } from '$lib/services/authService';
	import LoginScreen from '$lib/components/LoginScreen.svelte';

	let { children } = $props();
	const allowed = $derived(canUseBuilder($session));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}

{#if !allowed}
	<LoginScreen />
{/if}