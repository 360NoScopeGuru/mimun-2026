import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
	conferences,
	committees,
	delegates,
	attendance,
	committeeFloor,
	resolutions,
	resolutionClauses,
	resolutionSponsors
} from './schema.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const db = drizzle(postgres(process.env.DATABASE_URL));

function randomCode(prefix: string) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
	return `${prefix}-${code}`;
}

const rolePrefix: Record<string, string> = { chair: 'CH', admin: 'AD', delegate: 'UN' };

async function seed() {
	const [conference] = await db
		.insert(conferences)
		.values({ name: 'MIMUN 2026', slug: 'mimun-2026', settings: { procedurePreset: 'THIMUN' } })
		.returning();

	const [committee] = await db
		.insert(committees)
		.values({
			conferenceId: conference.id,
			name: 'Security Council',
			slug: 'security-council',
			topic: 'Maritime security in contested waters',
			agenda: ['Maritime security in contested waters', 'Freedom of navigation and the law of the sea'],
			rulesConfig: { preset: 'THIMUN' },
			status: 'pending'
		})
		.returning();

	// Chairs/admins (the dais/secretariat) are neutral — no country. [[mun-chair-neutral]]
	const roster = [
		{ fullName: 'Avery Chen', country: '', role: 'chair' as const },
		{ fullName: 'Jordan Blake', country: '', role: 'admin' as const },
		{ fullName: 'Sam Okafor', country: 'United States', role: 'delegate' as const },
		{ fullName: 'Lena Petrova', country: 'Russia', role: 'delegate' as const },
		{ fullName: 'Wei Zhang', country: 'China', role: 'delegate' as const },
		{ fullName: 'Amara Diallo', country: 'Senegal', role: 'delegate' as const },
		{ fullName: 'Mateo Rossi', country: 'Italy', role: 'delegate' as const },
		{ fullName: 'Priya Nair', country: 'India', role: 'delegate' as const },
		{ fullName: 'Tomás Herrera', country: 'Mexico', role: 'delegate' as const },
		{ fullName: 'Fatima Al-Sayed', country: 'Egypt', role: 'delegate' as const }
	];

	const inserted = await db
		.insert(delegates)
		.values(
			roster.map((r) => ({
				fullName: r.fullName,
				country: r.country,
				role: r.role,
				committeeId: committee.id,
				inviteCode: randomCode(r.country ? r.country.slice(0, 2).toUpperCase() : rolePrefix[r.role])
			}))
		)
		.returning();

	// The committee floor starts closed.
	await db.insert(committeeFloor).values({ committeeId: committee.id, mode: 'closed' });

	// Seed attendance: all voting delegates present and voting (so quorum/votes demo well).
	const votingDelegates = inserted.filter((d) => d.role === 'delegate');
	await db.insert(attendance).values(
		votingDelegates.map((d) => ({ committeeId: committee.id, delegateId: d.id, status: 'present_and_voting' as const }))
	);

	// A sample draft resolution for the Paper surface.
	const mainSubmitter = inserted.find((d) => d.fullName === 'Sam Okafor')!;
	const coItaly = inserted.find((d) => d.fullName === 'Mateo Rossi')!;
	const coIndia = inserted.find((d) => d.fullName === 'Priya Nair')!;

	const [resolution] = await db
		.insert(resolutions)
		.values({
			committeeId: committee.id,
			agendaIssue: 'Maritime security in contested waters',
			title: 'Strengthening maritime security and freedom of navigation',
			mainSubmitterId: mainSubmitter.id,
			status: 'lobbying',
			designation: '1.1'
		})
		.returning();

	await db.insert(resolutionClauses).values([
		{ resolutionId: resolution.id, kind: 'preambulatory', position: 0, text: 'Deeply concerned by the escalation of incidents threatening freedom of navigation in contested waters,' },
		{ resolutionId: resolution.id, kind: 'preambulatory', position: 1, text: 'Recalling the principles enshrined in the United Nations Convention on the Law of the Sea,' },
		{ resolutionId: resolution.id, kind: 'operative', position: 0, text: 'Calls upon all Member States to refrain from unilateral actions that escalate maritime tensions;' },
		{ resolutionId: resolution.id, kind: 'operative', position: 1, text: 'Requests the establishment of a joint maritime monitoring mechanism to report incidents to the committee;' }
	]);

	await db.insert(resolutionSponsors).values([
		{ resolutionId: resolution.id, delegateId: mainSubmitter.id, role: 'main_submitter' },
		{ resolutionId: resolution.id, delegateId: coItaly.id, role: 'co_submitter' },
		{ resolutionId: resolution.id, delegateId: coIndia.id, role: 'co_submitter' }
	]);

	console.log(`\nConference: ${conference.name} (/${conference.slug})`);
	console.log(`Committee:  ${committee.name} (/committee/${committee.slug})\n`);
	for (const d of inserted) {
		console.log(`${d.fullName.padEnd(18)} ${d.role.padEnd(9)} ${(d.country || '—').padEnd(14)} ${d.inviteCode}`);
	}
	console.log('');
	process.exit(0);
}

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});
