// Plain-English definitions of the procedural jargon, surfaced via <GlossaryTerm>
// inline and a glossary sheet in the room — so a first-time delegate isn't left
// guessing what "quorum" or "preambulatory" means.
export const GLOSSARY: Record<string, string> = {
	quorum: 'The minimum number of delegations that must be present for the committee to do business and hold votes.',
	roll_call: 'The chair runs through the roster so each delegation declares itself present — and whether it will vote.',
	present_and_voting: 'A delegation that must cast For or Against on resolutions; it gives up the right to abstain.',
	moderated_caucus: 'A timed debate on a sub-topic where the chair calls on speakers one at a time for short turns.',
	unmoderated_caucus: 'A timed, informal block where delegates leave their seats to negotiate and draft together.',
	motion: 'A formal proposal a delegate raises for the committee to do something — start a caucus, extend debate, move to a vote.',
	point_of_order: 'A flag that the rules of procedure are being broken; the chair rules on it immediately.',
	point_of_information: 'A question put to the delegate who is speaking, or to the chair.',
	parliamentary_inquiry: 'A question to the chair about the rules, or about what is in order right now.',
	personal_privilege: 'A request about a delegate’s ability to take part — e.g. “could the speaker please talk louder?”.',
	preambulatory: 'The opening clauses of a resolution that set context and cite precedent; they begin with participles (“Recalling…”, “Noting…”).',
	operative: 'The numbered action clauses of a resolution; each begins with an active verb (“Calls upon…”, “Urges…”).',
	friendly_amendment: 'A change the resolution’s main submitter accepts — it is applied without a vote.',
	unfriendly_amendment: 'A contested change to a resolution that goes to a vote of the whole committee.',
	two_thirds: 'A higher threshold: at least two-thirds of those voting must agree for it to pass.'
};

export type GlossaryKey = keyof typeof GLOSSARY;
