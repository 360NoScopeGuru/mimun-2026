<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const roleLabel: Record<string, string> = {
		delegate: 'Delegate',
		chair: 'Chair',
		deputy_chair: 'Deputy chair',
		admin: 'Admin',
		secretariat: 'Secretariat'
	};

	const count = $derived(data.delegates.length);

	function onFilter(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		const url = new URL(window.location.href);
		if (value) url.searchParams.set('committee', value);
		else url.searchParams.delete('committee');
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	// Submit a small inline form when its <select> changes.
	function submitOnChange(event: Event) {
		(event.currentTarget as HTMLSelectElement).form?.requestSubmit();
	}
</script>

<svelte:head><title>Delegates — MIMUN 2026</title></svelte:head>

<div class="mx-auto max-w-6xl px-6 py-8">
	<!-- header -->
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="display text-3xl text-ink-50">Delegates</h1>
			<p class="label mt-1 text-ink-400">
				{count} {count === 1 ? 'delegation' : 'delegations'}
			</p>
		</div>

		<label class="flex items-center gap-2">
			<span class="label-brass">Committee</span>
			<select class="input py-1.5 text-sm" value={data.committeeFilter ?? ''} onchange={onFilter}>
				<option value="">All committees</option>
				{#each data.committees as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</select>
		</label>
	</div>

	<!-- table head (desktop) -->
	<div
		class="mt-6 hidden grid-cols-[1.6fr_1.4fr_1.1fr_0.9fr_auto] gap-3 border-b border-white/[0.07] px-4 pb-2 lg:grid"
	>
		<span class="label text-ink-500">Delegate</span>
		<span class="label text-ink-500">Committee</span>
		<span class="label text-ink-500">Role</span>
		<span class="label text-ink-500">Invite code</span>
		<span class="label text-right text-ink-500">Status</span>
	</div>

	<ul class="mt-2 space-y-2 lg:space-y-0">
		{#each data.delegates as d (d.id)}
			<li
				class="card grid grid-cols-1 gap-3 p-4 lg:grid-cols-[1.6fr_1.4fr_1.1fr_0.9fr_auto] lg:items-center lg:rounded-none lg:border-0 lg:border-b lg:border-white/[0.06] lg:bg-transparent lg:px-4 lg:py-3 {d.active
					? ''
					: 'opacity-50'}"
			>
				<!-- name + country/role -->
				<div class="min-w-0">
					<p class="truncate font-medium text-ink-100">{d.fullName}</p>
					<p class="truncate text-xs text-ink-400">
						{#if d.country}{d.country} · {/if}{roleLabel[d.role] ?? d.role}
					</p>
				</div>

				<!-- committee reassign -->
				<form method="POST" action="?/reassign" use:enhance class="flex items-center gap-2">
					<input type="hidden" name="delegateId" value={d.id} />
					<select
						name="committeeId"
						value={d.committeeId ?? ''}
						onchange={submitOnChange}
						class="input min-w-0 flex-1 py-1.5 text-sm"
						aria-label="Committee"
					>
						<option value="">— Unassigned —</option>
						{#each data.committees as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
					<button class="btn btn-quiet focus-ring px-2.5 py-1.5 text-xs">Move</button>
				</form>

				<!-- role -->
				<form method="POST" action="?/setRole" use:enhance>
					<input type="hidden" name="delegateId" value={d.id} />
					<select
						name="role"
						value={d.role}
						onchange={submitOnChange}
						class="input w-full py-1.5 text-sm"
						aria-label="Role"
					>
						{#each data.roles as r (r)}
							<option value={r}>{roleLabel[r] ?? r}</option>
						{/each}
					</select>
				</form>

				<!-- invite code -->
				<div class="flex items-center gap-2">
					<code class="font-mono text-sm text-brass-300 tabular-nums">{d.inviteCode}</code>
					<form method="POST" action="?/regenerateCode" use:enhance>
						<input type="hidden" name="delegateId" value={d.id} />
						<button
							class="btn btn-quiet focus-ring px-2 py-1 text-[0.7rem]"
							title="Regenerate invite code"
						>
							Regenerate
						</button>
					</form>
				</div>

				<!-- status + activate/deactivate -->
				<div class="flex items-center justify-between gap-3 lg:justify-end">
					{#if d.active}
						<span class="text-xs font-medium text-signal-green">Active</span>
						<form method="POST" action="?/deactivate" use:enhance>
							<input type="hidden" name="delegateId" value={d.id} />
							<button class="btn btn-quiet focus-ring px-2.5 py-1.5 text-xs">Deactivate</button>
						</form>
					{:else}
						<span class="text-xs font-medium text-ink-500">Inactive</span>
						<form method="POST" action="?/activate" use:enhance>
							<input type="hidden" name="delegateId" value={d.id} />
							<button class="btn btn-ghost focus-ring px-2.5 py-1.5 text-xs">Activate</button>
						</form>
					{/if}
				</div>
			</li>
		{:else}
			<li class="card p-10 text-center">
				<p class="display text-xl text-ink-100">No delegates</p>
				<p class="mt-2 text-sm text-ink-400">
					{#if data.committeeFilter}
						No delegations in this committee yet.
					{:else}
						Import a roster to populate delegations.
					{/if}
				</p>
			</li>
		{/each}
	</ul>
</div>
