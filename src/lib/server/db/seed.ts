import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { committees, delegates } from './schema.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const db = drizzle(postgres(process.env.DATABASE_URL), { schema: { committees, delegates } });

function randomCode(prefix: string) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
	return `${prefix}-${code}`;
}

async function seed() {
	const [committee] = await db
		.insert(committees)
		.values({ name: 'Security Council', slug: 'security-council', topic: 'Maritime security in contested waters', status: 'pending' })
		.returning();

	// Chairs and admins (the dais / secretariat) are neutral — they do not
	// represent a country, so country is left empty for them.
	const roster = [
		{ fullName: 'Avery Chen', country: '', role: 'chair' as const },
		{ fullName: 'Jordan Blake', country: '', role: 'admin' as const },
		{ fullName: 'Sam Okafor', country: 'United States', role: 'delegate' as const },
		{ fullName: 'Lena Petrova', country: 'Russia', role: 'delegate' as const },
		{ fullName: 'Wei Zhang', country: 'China', role: 'delegate' as const },
		{ fullName: 'Amara Diallo', country: 'Senegal', role: 'delegate' as const }
	];

	const rolePrefix: Record<string, string> = { chair: 'CH', admin: 'AD', delegate: 'UN' };
	const rows = roster.map((r) => ({
		fullName: r.fullName,
		country: r.country,
		role: r.role,
		committeeId: committee.id,
		inviteCode: randomCode(r.country ? r.country.slice(0, 2).toUpperCase() : rolePrefix[r.role])
	}));

	const inserted = await db.insert(delegates).values(rows).returning();

	console.log(`\nCommittee: ${committee.name} (/committee/${committee.slug})\n`);
	for (const d of inserted) {
		console.log(`${d.fullName.padEnd(16)} ${d.role.padEnd(8)} ${d.country.padEnd(14)} ${d.inviteCode}`);
	}
	console.log('');
	process.exit(0);
}

seed().catch((err) => {
	console.error(err);
	process.exit(1);
});
