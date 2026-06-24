import { eq } from 'drizzle-orm';
import { db } from './db';
import { files } from './db/schema';

// Files are stored as Postgres bytea (testable, free, no external service).
// To move to Vercel Blob later, swap storeFile/getFile to put()/redirect and
// keep the rest of the app unchanged.

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — stays under Vercel's serverless body limit

const ALLOWED_MIME: Record<string, true> = {
	'application/pdf': true,
	'application/msword': true,
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
	'text/plain': true,
	'image/png': true,
	'image/jpeg': true
};

export type FileKind = 'position_paper' | 'background_guide' | 'rop' | 'agenda' | 'study_guide' | 'other';

export function validateUpload(file: File | null): { ok: true; file: File } | { ok: false; message: string } {
	if (!file || typeof file === 'string' || file.size === 0) return { ok: false, message: 'No file selected' };
	if (file.size > MAX_FILE_BYTES) return { ok: false, message: `File too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)` };
	if (!ALLOWED_MIME[file.type]) return { ok: false, message: 'Unsupported type — use PDF, Word, text, or an image' };
	return { ok: true, file };
}

export async function storeFile(opts: {
	committeeId: string;
	kind: FileKind;
	title: string;
	file: File;
	delegateId?: string | null;
	uploadedById: string;
}): Promise<string> {
	const buf = Buffer.from(await opts.file.arrayBuffer());
	const [row] = await db
		.insert(files)
		.values({
			committeeId: opts.committeeId,
			kind: opts.kind,
			title: opts.title || opts.file.name,
			fileName: opts.file.name,
			mime: opts.file.type,
			sizeBytes: opts.file.size,
			bytes: buf,
			delegateId: opts.delegateId ?? null,
			uploadedById: opts.uploadedById
		})
		.returning({ id: files.id });
	return row.id;
}

export async function getFile(id: string) {
	const [row] = await db.select().from(files).where(eq(files.id, id));
	return row ?? null;
}
