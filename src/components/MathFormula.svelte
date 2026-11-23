<script lang="ts">
	import katex from 'katex';

	let {
		expr,
		displayMode = false,
		class: className = '',
	}: {
		expr: string;
		displayMode?: boolean;
		class?: string;
	} = $props();

	let containerEl = $state<HTMLSpanElement | null>(null);

	$effect(() => {
		if (!containerEl) return;
		katex.render(expr, containerEl, {
			displayMode,
			throwOnError: false,
			strict: 'ignore',
		});
	});
</script>

<span bind:this={containerEl} class={className} aria-label={expr}></span>
