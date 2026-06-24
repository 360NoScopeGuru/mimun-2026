import type { RequestHandler } from './$types';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { getCommitteeState } from '$lib/server/committeeState';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	const since = url.searchParams.get('since') ?? undefined;
	const state = await getCommitteeState(committee, delegate, since);

	return Response.json(state);
};
