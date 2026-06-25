import type { PageServerLoad } from './$types';
import { loadCommittee } from '$lib/server/auth/guards';
import { getSpectatorState } from '$lib/server/spectator';

// PUBLIC route (not under the (app) group): no auth, no assertMember.
export const load: PageServerLoad = async ({ params }) => {
	const committee = await loadCommittee(params.slug);
	return {
		slug: committee.slug,
		committeeName: committee.name,
		initial: await getSpectatorState(committee)
	};
};
