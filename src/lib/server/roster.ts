// Bulk roster CSV parsing for the secretariat's "Roster import" screen.
// Pure (no DB): takes raw CSV text + the known committees, returns one parsed
// row per line with a resolved committeeId or a human-readable `.error`.

export type ParsedRow = {
	fullName: string;
	country: string;
	role: string;
	committeeId: string | null;
	committeeName: string;
	error?: string;
};

const VALID_ROLES = new Set(['delegate', 'chair', 'deputy_chair']);

/** A first line is treated as a header when it mentions both name and country. */
function looksLikeHeader(line: string): boolean {
	const l = line.toLowerCase();
	return l.includes('name') && l.includes('country');
}

/**
 * Parse roster CSV into rows. Expected columns: name, country, committee, role
 * (role optional → 'delegate'). Committee is matched against slug OR name,
 * case-insensitive. Blank lines are skipped; a leading header row is skipped.
 * Invalid rows are still returned with `.error` set so the caller can show them.
 */
export function parseRoster(
	csv: string,
	committees: { id: string; name: string; slug: string }[]
): { rows: ParsedRow[] } {
	// Index committees by both name and slug (lowercased) for resolution.
	const byKey = new Map<string, { id: string; name: string }>();
	for (const c of committees) {
		byKey.set(c.slug.toLowerCase(), { id: c.id, name: c.name });
		byKey.set(c.name.toLowerCase(), { id: c.id, name: c.name });
	}

	const lines = csv.split(/\r?\n/);
	const rows: ParsedRow[] = [];
	let seenFirst = false;

	for (const raw of lines) {
		if (!raw.trim()) continue; // ignore blank lines

		// Skip a leading header row.
		if (!seenFirst) {
			seenFirst = true;
			if (looksLikeHeader(raw)) continue;
		}

		const cells = raw.split(',').map((c) => c.trim());
		const fullName = cells[0] ?? '';
		const country = cells[1] ?? '';
		const committeeCell = cells[2] ?? '';
		const role = (cells[3] ?? '').toLowerCase() || 'delegate';

		const match = committeeCell ? byKey.get(committeeCell.toLowerCase()) : undefined;
		const row: ParsedRow = {
			fullName,
			country,
			role,
			committeeId: match?.id ?? null,
			committeeName: match?.name ?? committeeCell
		};

		// First failing check wins, reported as a single error string.
		if (!fullName) {
			row.error = 'Missing name';
		} else if (!match) {
			row.error = `Unknown committee: ${committeeCell || '(blank)'}`;
		} else if (!VALID_ROLES.has(role)) {
			row.error = `Invalid role: ${cells[3]}`;
		}

		rows.push(row);
	}

	return { rows };
}
