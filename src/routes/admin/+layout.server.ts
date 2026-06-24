import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isStaff } from '$lib/server/auth/guards';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.delegate) throw redirect(302, '/login');
	if (!isStaff(locals.delegate)) throw redirect(302, '/');
	return { delegate: locals.delegate };
};
