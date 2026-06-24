// Invite-code generation, shared by the seed, roster import, and delegate admin.

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
const ROLE_PREFIX: Record<string, string> = {
	chair: 'CH',
	deputy_chair: 'DC',
	admin: 'AD',
	secretariat: 'SC',
	delegate: 'UN'
};

/** Prefix derived from country (delegates) or role (dais/staff). */
export function codePrefix(country: string, role: string): string {
	return country ? country.slice(0, 2).toUpperCase() : (ROLE_PREFIX[role] ?? 'UN');
}

/** A random invite code like "FR-7K2P". Caller ensures uniqueness (DB unique + retry). */
export function makeInviteCode(country: string, role: string): string {
	let suffix = '';
	for (let i = 0; i < 4; i++) suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
	return `${codePrefix(country, role)}-${suffix}`;
}
