import { describe, it, expect } from 'vitest';
import {
	describePreset,
	parliamentarianPrompt,
	resolutionFeedbackPrompt,
	positionPaperFeedbackPrompt,
	sessionSummaryPrompt,
	type SessionStats
} from './aiFeatures';
import { THIMUN } from './procedure';

describe('describePreset', () => {
	const text = describePreset(THIMUN);
	it('names the preset and states the quorum percentage', () => {
		expect(text).toContain('THIMUN');
		expect(text).toContain('25%'); // 1/4
	});
	it('states majorities and default timings', () => {
		expect(text).toContain('simple majority');
		expect(text).toContain('90s'); // default speaking time
	});
});

describe('parliamentarianPrompt', () => {
	const opts = parliamentarianPrompt({
		preset: THIMUN,
		committeeName: 'UNSC',
		modeLabel: 'Moderated caucus',
		question: 'How many votes to pass an amendment?'
	});
	it('passes the question through as the user prompt', () => {
		expect(opts.prompt).toBe('How many votes to pass an amendment?');
	});
	it('grounds the system prompt in the committee, mode, and preset', () => {
		expect(opts.system).toContain('UNSC');
		expect(opts.system).toContain('Moderated caucus');
		expect(opts.system).toContain('THIMUN');
	});
	it('keeps answers short and low-temperature', () => {
		expect(opts.system).toContain('120 words');
		expect(opts.temperature).toBe(0.3);
	});
});

describe('resolutionFeedbackPrompt', () => {
	it('numbers preambulatory and operative clauses and asks for JSON only', () => {
		const opts = resolutionFeedbackPrompt({
			committeeName: 'UNEP',
			agendaIssue: 'Plastic waste',
			title: 'On marine plastics',
			preambulatory: ['Deeply concerned by ocean pollution'],
			operative: ['Calls upon member states to reduce single-use plastics']
		});
		expect(opts.prompt).toContain('1. Deeply concerned by ocean pollution');
		expect(opts.prompt).toContain('1. Calls upon member states');
		expect(opts.system).toContain('Return ONLY a JSON object');
	});
	it('renders "(none)" when a clause list is empty', () => {
		const opts = resolutionFeedbackPrompt({
			committeeName: 'UNEP',
			agendaIssue: '',
			title: '',
			preambulatory: [],
			operative: []
		});
		expect(opts.prompt).toContain('(none)');
	});
});

describe('positionPaperFeedbackPrompt', () => {
	it('caps the submitted text at 8000 characters', () => {
		const opts = positionPaperFeedbackPrompt({
			committeeName: 'WHO',
			country: 'Brazil',
			topic: 'Pandemic preparedness',
			text: 'x'.repeat(10_000)
		});
		expect(opts.prompt?.length).toBe(8000);
	});
	it('names the country and topic in the system prompt', () => {
		const opts = positionPaperFeedbackPrompt({
			committeeName: 'WHO',
			country: 'Brazil',
			topic: 'Pandemic preparedness',
			text: 'short draft'
		});
		expect(opts.system).toContain('Brazil');
		expect(opts.system).toContain('Pandemic preparedness');
	});
});

describe('sessionSummaryPrompt', () => {
	const stats: SessionStats = {
		committeeName: 'DISEC',
		topic: 'Autonomous weapons',
		present: 18,
		total: 20,
		messages: 240,
		speeches: 31,
		motions: [{ label: 'Moderated caucus', status: 'adopted' }],
		votes: [{ label: 'Resolution 1.1', result: 'Passed', tally: '12–6–2' }],
		adoptedResolutions: ['1.1 · On verification regimes']
	};
	const opts = sessionSummaryPrompt(stats);
	it('includes attendance, motions, votes and adopted resolutions', () => {
		expect(opts.prompt).toContain('18/20 present');
		expect(opts.prompt).toContain('Moderated caucus — adopted');
		expect(opts.prompt).toContain('Resolution 1.1: Passed (12–6–2)');
		expect(opts.prompt).toContain('1.1 · On verification regimes');
	});
	it('caps the rapporteur recap length', () => {
		expect(opts.system).toContain('220 words');
	});
});
