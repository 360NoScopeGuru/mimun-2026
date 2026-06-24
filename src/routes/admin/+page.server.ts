import type { PageServerLoad } from './$types';
import { getConferenceOverview } from '$lib/server/admin';

export const load: PageServerLoad = async () => {
	return { overview: await getConferenceOverview() };
};
