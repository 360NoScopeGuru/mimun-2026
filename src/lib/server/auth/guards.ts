import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { committees, type delegates } from '../db/schema';

type Delegate = typeof delegates.$inferSelect;

/** Cross-committee staff (secretariat / admin) see and act on any committee. */
export function isStaff(delegate: Delegate): boolean {
	return delegate.role === 'admin' || delegate.role === 'secretariat';
}

/** Anyone who may run a committee floor: the dais (chair/deputy) plus staff. */
export function isChair(delegate: Delegate): boolean {
	return delegate.role === 'chair' || delegate.role === 'deputy_chair' || isStaff(delegate);
}

/** Throws 401 if not signed in; otherwise returns the (narrowed) delegate. */
export function requireDelegate(delegate: Delegate | null): Delegate {
	if (!delegate) error(401, 'Not signed in');
	return delegate;
}

/** Throws unless the delegate belongs to (or is staff over) the committee. */
export function assertMember(delegate: Delegate | null, committeeId: string): Delegate {
	const d = requireDelegate(delegate);
	if (!isStaff(d) && d.committeeId !== committeeId) error(403, 'Not a member of this committee');
	return d;
}

/** Throws unless the delegate may run this committee's floor (dais or staff). */
export function assertChair(delegate: Delegate | null, committeeId: string): Delegate {
	const d = assertMember(delegate, committeeId);
	if (!isChair(d)) error(403, 'Chair only');
	return d;
}

/** Throws unless the delegate is conference staff (secretariat / admin). */
export function assertConferenceStaff(delegate: Delegate | null): Delegate {
	const d = requireDelegate(delegate);
	if (!isStaff(d)) error(403, 'Secretariat only');
	return d;
}

/** Loads a committee by slug or throws 404. */
export async function loadCommittee(slug: string) {
	const [committee] = await db.select().from(committees).where(eq(committees.slug, slug));
	if (!committee) error(404, 'Committee not found');
	return committee;
}
