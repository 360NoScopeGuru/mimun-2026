// White-label branding resolved from a conference's `settings.branding` jsonb,
// merged over the MIMUN defaults. One deployment can therefore present itself as
// any conference's own platform. The `settings` column already exists; this is
// the first thing to read it.
export type Branding = {
	name: string;
	wordmark: string;
	tagline: string;
	emblem: string;
	/** Hex accent that overrides --color-brass-500 app-wide. */
	accent: string;
};

const DEFAULTS: Branding = {
	name: 'MIMUN 2026',
	wordmark: 'MIMUN 2026',
	tagline: 'Council Platform',
	emblem: 'M',
	accent: '#b8924a'
};

export function getBranding(conference?: { settings?: unknown } | null): Branding {
	const b = (conference?.settings as { branding?: Partial<Branding> } | null)?.branding ?? {};
	return { ...DEFAULTS, ...b };
}
