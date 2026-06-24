import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFile } from '$lib/server/storage';
import { assertMember, isChair } from '$lib/server/auth/guards';

export const GET: RequestHandler = async ({ params, locals }) => {
	const file = await getFile(params.id);
	if (!file) error(404);

	// Must be a member of (or staff over) the file's committee.
	const delegate = assertMember(locals.delegate, file.committeeId);

	// Position papers are visible only to their owner and the dais/secretariat.
	if (file.kind === 'position_paper' && file.delegateId !== delegate.id && !isChair(delegate)) error(403, 'Not permitted');

	// Buffer is a valid response body at runtime; cast past the DOM typed-array generics.
	return new Response(file.bytes as unknown as BodyInit, {
		headers: {
			'Content-Type': file.mime,
			'Content-Disposition': `inline; filename="${file.fileName.replace(/["\\\r\n]/g, '')}"`,
			'Content-Length': String(file.sizeBytes),
			'Cache-Control': 'private, max-age=300'
		}
	});
};
