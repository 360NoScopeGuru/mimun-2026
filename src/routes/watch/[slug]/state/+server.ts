import type { RequestHandler } from './$types';
import { loadCommittee } from '$lib/server/auth/guards';
import { getSpectatorState } from '$lib/server/spectator';

// Public GET — NO auth gate. loadCommittee throws 404 if the slug is unknown.
export const GET: RequestHandler = async ({ params }) => {
	const committee = await loadCommittee(params.slug);
	return Response.json(await getSpectatorState(committee));
};
