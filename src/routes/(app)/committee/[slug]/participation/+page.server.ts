import type { PageServerLoad } from './$types';
import { loadCommittee, assertChair } from '$lib/server/auth/guards';
import { getParticipation } from '$lib/server/participation';
import { getVotingBlocs, getEngagementTimeline, getNegotiationNetwork } from '$lib/server/analytics';
import { isAiConfigured } from '$lib/server/ai';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertChair(locals.delegate, committee.id);

	const [rows, blocs, engagement, network] = await Promise.all([
		getParticipation(committee.id),
		getVotingBlocs(committee.id),
		getEngagementTimeline(committee.id),
		getNegotiationNetwork(committee.id)
	]);
	rows.sort((a, b) => b.score - a.score);

	return { committee, rows, blocs, engagement, network, aiConfigured: isAiConfigured() };
};
