import type { PageServerLoad } from './$types';
import { loadCommittee, assertChair } from '$lib/server/auth/guards';
import { getParticipation } from '$lib/server/participation';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertChair(locals.delegate, committee.id);

	const rows = await getParticipation(committee.id);
	rows.sort((a, b) => b.score - a.score);

	return { committee, rows };
};
