import { describe, it, expect } from 'vitest';
import {
	resolveProviders,
	parseCompletionText,
	extractJson,
	buildMessages,
	type EnvLike
} from './ai-core';

const KEYS = {
	OPENROUTER_API_KEY: 'or-key',
	NVIDIA_NIM_API_KEY: 'nim-key'
} satisfies EnvLike;

describe('resolveProviders', () => {
	it('returns nothing when no keys are configured', () => {
		expect(resolveProviders({})).toEqual([]);
	});

	it('treats a whitespace-only key as absent', () => {
		expect(resolveProviders({ OPENROUTER_API_KEY: '   ' })).toEqual([]);
	});

	it('includes only providers that have a key', () => {
		const only = resolveProviders({ OPENROUTER_API_KEY: 'or-key' });
		expect(only.map((p) => p.id)).toEqual(['openrouter']);
	});

	it('orders openrouter before nvidia by default', () => {
		expect(resolveProviders(KEYS).map((p) => p.id)).toEqual(['openrouter', 'nvidia']);
	});

	it('honours AI_PROVIDER_ORDER', () => {
		const ordered = resolveProviders({ ...KEYS, AI_PROVIDER_ORDER: 'nvidia,openrouter' });
		expect(ordered.map((p) => p.id)).toEqual(['nvidia', 'openrouter']);
	});

	it('sinks unknown ids in the order list to the end', () => {
		// "foo" is unknown; nvidia is ranked, openrouter is not → nvidia first.
		const ordered = resolveProviders({ ...KEYS, AI_PROVIDER_ORDER: 'foo,nvidia' });
		expect(ordered.map((p) => p.id)).toEqual(['nvidia', 'openrouter']);
	});

	it('trims the api key and strips trailing slashes from the base url', () => {
		const [p] = resolveProviders({
			OPENROUTER_API_KEY: '  spaced-key  ',
			OPENROUTER_BASE_URL: 'https://example.test/v1///'
		});
		expect(p.apiKey).toBe('spaced-key');
		expect(p.baseUrl).toBe('https://example.test/v1');
	});

	it('uses default base + model, overridable via env', () => {
		const [def] = resolveProviders({ OPENROUTER_API_KEY: 'k' });
		expect(def.baseUrl).toBe('https://openrouter.ai/api/v1');
		expect(def.model).toBe('openai/gpt-oss-120b:free');

		const [over] = resolveProviders({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'some/other-model' });
		expect(over.model).toBe('some/other-model');
	});
});

describe('parseCompletionText', () => {
	it('reads and trims the first choice content', () => {
		const body = { choices: [{ message: { content: '  hello  ' } }] };
		expect(parseCompletionText(body)).toBe('hello');
	});

	it('returns empty string for missing/empty/malformed bodies', () => {
		expect(parseCompletionText(undefined)).toBe('');
		expect(parseCompletionText({})).toBe('');
		expect(parseCompletionText({ choices: [] })).toBe('');
		expect(parseCompletionText({ choices: [{ message: { content: 42 } }] })).toBe('');
	});
});

describe('extractJson', () => {
	it('parses a bare JSON object', () => {
		expect(extractJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
	});

	it('parses an array', () => {
		expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
	});

	it('strips a ```json fence', () => {
		expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
	});

	it('strips an unlabelled ``` fence', () => {
		expect(extractJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
	});

	it('pulls an object out of surrounding prose', () => {
		const text = 'Sure! Here is the JSON you asked for:\n{"score": 5}\nHope that helps.';
		expect(extractJson(text)).toEqual({ score: 5 });
	});

	it('returns null for empty input', () => {
		expect(extractJson('')).toBeNull();
	});

	it('returns null when there is no recoverable JSON', () => {
		expect(extractJson('absolutely no json here')).toBeNull();
	});

	it('is typed on the way out', () => {
		const fb = extractJson<{ scores: { clarity: number } }>('{"scores":{"clarity":4}}');
		expect(fb?.scores.clarity).toBe(4);
	});
});

describe('buildMessages', () => {
	it('returns an explicit message list as-is', () => {
		const messages = [
			{ role: 'system' as const, content: 's' },
			{ role: 'user' as const, content: 'u' }
		];
		expect(buildMessages({ messages, system: 'ignored', prompt: 'ignored' })).toBe(messages);
	});

	it('assembles system + prompt into two turns', () => {
		expect(buildMessages({ system: 'sys', prompt: 'ask' })).toEqual([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'ask' }
		]);
	});

	it('supports a lone prompt or a lone system message', () => {
		expect(buildMessages({ prompt: 'ask' })).toEqual([{ role: 'user', content: 'ask' }]);
		expect(buildMessages({ system: 'sys' })).toEqual([{ role: 'system', content: 'sys' }]);
	});

	it('returns an empty list when nothing is supplied', () => {
		expect(buildMessages({})).toEqual([]);
	});
});
