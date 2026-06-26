<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Practice mode — MIMUN 2026 Secretariat</title></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label label-brass">Secretariat</p>
			<h1 class="display mt-1 text-3xl text-ink-50">Practice mode</h1>
			<p class="mt-1 max-w-lg text-sm text-ink-400">
				Spin up a throwaway committee — already in session, with stand-in delegations marked present — so chairs and delegates can rehearse before the real thing. Delete it when you're done; nothing here touches your live rooms.
			</p>
		</div>
		<form method="POST" action="?/create" use:enhance>
			<button class="btn btn-brass focus-ring px-4 py-2 text-sm">Create practice room</button>
		</form>
	</div>

	{#if data.rooms.length === 0}
		<p class="mt-10 text-sm text-ink-500">No practice rooms yet — create one to get started.</p>
	{:else}
		<div class="mt-6 space-y-4">
			{#each data.rooms as room (room.id)}
				<div class="card p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="min-w-0">
							<h2 class="truncate text-base font-semibold text-ink-50">{room.name}</h2>
							<p class="text-xs text-ink-500">Hand a code below to whoever's rehearsing. Open the room with the Practice Chair code to drive it.</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<a href="/committee/{room.slug}" class="btn btn-ghost focus-ring px-3 py-1.5 text-xs">Open room</a>
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="committeeId" value={room.id} />
								<button class="btn btn-quiet focus-ring px-3 py-1.5 text-xs">Delete</button>
							</form>
						</div>
					</div>
					<ul class="mt-3 grid gap-1.5 sm:grid-cols-2">
						{#each room.people as person (person.inviteCode)}
							<li class="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm">
								<span class="min-w-0 truncate text-ink-200">{person.country || person.fullName} <span class="text-ink-500">· {person.role}</span></span>
								<span class="shrink-0 font-mono text-xs text-brass-300">{person.inviteCode}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</div>
