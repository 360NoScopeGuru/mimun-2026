import { fail } from '@sveltejs/kit';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { files, resolutions, delegates } from '$lib/server/db/schema';
import { loadCommittee, assertMember, assertChair, isChair } from '$lib/server/auth/guards';
import { storeFile, validateUpload, type FileKind } from '$lib/server/storage';

const DOC_KINDS: FileKind[] = ['background_guide', 'rop', 'agenda', 'study_guide', 'other'];

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);
	const chair = isChair(delegate);

	const meta = {
		id: files.id,
		kind: files.kind,
		title: files.title,
		fileName: files.fileName,
		mime: files.mime,
		sizeBytes: files.sizeBytes,
		delegateId: files.delegateId,
		createdAt: files.createdAt
	};

	const [documents, myPaper, allPapers, adopted] = await Promise.all([
		db.select(meta).from(files).where(and(eq(files.committeeId, committee.id), ne(files.kind, 'position_paper'))).orderBy(desc(files.createdAt)),
		db
			.select(meta)
			.from(files)
			.where(and(eq(files.committeeId, committee.id), eq(files.kind, 'position_paper'), eq(files.delegateId, delegate.id)))
			.limit(1),
		chair
			? db
					.select({ ...meta, author: delegates.fullName, country: delegates.country })
					.from(files)
					.innerJoin(delegates, eq(files.delegateId, delegates.id))
					.where(and(eq(files.committeeId, committee.id), eq(files.kind, 'position_paper')))
					.orderBy(delegates.country)
			: Promise.resolve([]),
		db
			.select({ id: resolutions.id, designation: resolutions.designation, title: resolutions.title })
			.from(resolutions)
			.where(and(eq(resolutions.committeeId, committee.id), eq(resolutions.status, 'adopted')))
			.orderBy(desc(resolutions.approvedAt))
	]);

	return { committee, isChair: chair, documents, myPaper: myPaper[0] ?? null, allPapers, adopted };
};

export const actions: Actions = {
	uploadDocument: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const form = await request.formData();
		const kind = String(form.get('kind') ?? '') as FileKind;
		const title = String(form.get('title') ?? '').trim().slice(0, 200);
		if (!DOC_KINDS.includes(kind)) return fail(400, { message: 'Pick a document type' });

		const check = validateUpload(form.get('file') as File | null);
		if (!check.ok) return fail(400, { message: check.message });

		await storeFile({ committeeId: committee.id, kind, title, file: check.file, uploadedById: chair.id });
		return { success: true };
	},

	uploadPositionPaper: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const check = validateUpload((await request.formData()).get('file') as File | null);
		if (!check.ok) return fail(400, { message: check.message });

		// One position paper per delegation — replace any previous upload.
		await db.delete(files).where(and(eq(files.committeeId, committee.id), eq(files.kind, 'position_paper'), eq(files.delegateId, delegate.id)));
		await storeFile({
			committeeId: committee.id,
			kind: 'position_paper',
			title: `Position paper — ${delegate.country || delegate.fullName}`,
			file: check.file,
			delegateId: delegate.id,
			uploadedById: delegate.id
		});
		return { success: true };
	},

	deleteFile: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const fileId = String((await request.formData()).get('fileId') ?? '');
		const [f] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.committeeId, committee.id)));
		if (!f) return fail(404);
		// The uploader, the owning delegate, or a chair may delete.
		if (f.uploadedById !== delegate.id && f.delegateId !== delegate.id && !isChair(delegate)) return fail(403);

		await db.delete(files).where(eq(files.id, f.id));
		return { success: true };
	}
};
