import type { PageServerLoad } from './$types';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { getCommitteeState } from '$lib/server/committeeState';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);
	const state = await getCommitteeState(committee, delegate);
	return { committee, state };
};
