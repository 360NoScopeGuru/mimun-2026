/**
 * Pure AI plumbing — no `$env`, no SvelteKit imports — so it's unit-testable in
 * plain Vitest. The env-bound orchestration (reading keys, picking the referer)
 * lives in `ai.ts`, which re-exports everything here. This mirrors the codebase
 * split between pure `procedure/` and query-owning `committeeState.ts`.
 */

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ProviderConfig = {
	id: string;
	label: string;
	baseUrl: string;
	apiKey: string;
	model: string;
};

/** Thrown when no provider key is configured, so callers can degrade gracefully. */
export class AiNotConfiguredError extends Error {
	constructor() {
		super('No AI provider is configured');
		this.name = 'AiNotConfiguredError';
	}
}

export type EnvLike = Record<string, string | undefined>;

// Provider catalog. Models are env-overridable because free model slugs change
// over time; if a default 404s or 429s, set the *_MODEL var without touching code.
// Defaults chosen from live probing (Jun 2026): OpenRouter's gpt-oss-120b free
// endpoint answers in ~2.5s at high quality; NIM's llama-3.1-8b is a reliable
// ~1.2s failover when OpenRouter's free pool is rate-limited.
export const PROVIDER_DEFS = [
	{
		id: 'openrouter',
		label: 'OpenRouter',
		keyVar: 'OPENROUTER_API_KEY',
		baseVar: 'OPENROUTER_BASE_URL',
		modelVar: 'OPENROUTER_MODEL',
		defaultBase: 'https://openrouter.ai/api/v1',
		defaultModel: 'openai/gpt-oss-120b:free'
	},
	{
		id: 'nvidia',
		label: 'NVIDIA NIM',
		keyVar: 'NVIDIA_NIM_API_KEY',
		baseVar: 'NVIDIA_NIM_BASE_URL',
		modelVar: 'NVIDIA_NIM_MODEL',
		defaultBase: 'https://integrate.api.nvidia.com/v1',
		defaultModel: 'meta/llama-3.1-8b-instruct'
	}
] as const;

/**
 * Given an env-like record, return the configured providers in priority order.
 * Order is controlled by AI_PROVIDER_ORDER (comma-separated ids); unknown ids
 * sink to the end. Only providers with a non-empty key are included.
 */
export function resolveProviders(e: EnvLike): ProviderConfig[] {
	const order = (e.AI_PROVIDER_ORDER || 'openrouter,nvidia')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const rank = (id: string) => {
		const i = order.indexOf(id);
		return i < 0 ? PROVIDER_DEFS.length : i;
	};
	return PROVIDER_DEFS.filter((d) => (e[d.keyVar] ?? '').trim().length > 0)
		.map((d) => ({
			id: d.id,
			label: d.label,
			baseUrl: (e[d.baseVar] || d.defaultBase).replace(/\/+$/, ''),
			apiKey: (e[d.keyVar] as string).trim(),
			model: e[d.modelVar] || d.defaultModel
		}))
		.sort((a, b) => rank(a.id) - rank(b.id));
}

/** Read the assistant text out of an OpenAI-compatible completion body. */
export function parseCompletionText(body: unknown): string {
	const choices = (body as { choices?: { message?: { content?: unknown } }[] })?.choices;
	const content = choices?.[0]?.message?.content;
	return typeof content === 'string' ? content.trim() : '';
}

/**
 * Pull the first JSON value out of an LLM response. Tolerates ```json fences and
 * prose wrapped around the object/array, which free models love to add.
 */
export function extractJson<T = unknown>(text: string): T | null {
	if (!text) return null;
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : text;
	// Try a straight parse first, then fall back to the first balanced {…} or […].
	const attempts: string[] = [candidate.trim()];
	const start = candidate.search(/[[{]/);
	if (start >= 0) {
		const open = candidate[start];
		const close = open === '{' ? '}' : ']';
		const end = candidate.lastIndexOf(close);
		if (end > start) attempts.push(candidate.slice(start, end + 1));
	}
	for (const a of attempts) {
		try {
			return JSON.parse(a) as T;
		} catch {
			/* try next */
		}
	}
	return null;
}

export type CompleteOptions = {
	/** System prompt (role + grounding). */
	system?: string;
	/** Convenience single user turn; ignored if `messages` is given. */
	prompt?: string;
	/** Full message list; takes precedence over `system`/`prompt`. */
	messages?: AiMessage[];
	temperature?: number;
	maxTokens?: number;
	/** Per-attempt timeout. */
	timeoutMs?: number;
};

/** Assemble the chat message array from the convenience fields. */
export function buildMessages(opts: CompleteOptions): AiMessage[] {
	if (opts.messages?.length) return opts.messages;
	const msgs: AiMessage[] = [];
	if (opts.system) msgs.push({ role: 'system', content: opts.system });
	if (opts.prompt) msgs.push({ role: 'user', content: opts.prompt });
	return msgs;
}

/** POST one chat completion to a provider. Throws on any non-2xx or empty body. */
export async function callProvider(
	p: ProviderConfig,
	messages: AiMessage[],
	opts: CompleteOptions,
	referer: string
): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
	try {
		const res = await fetch(`${p.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${p.apiKey}`,
				// OpenRouter uses these for app attribution/rankings; harmless elsewhere.
				'HTTP-Referer': referer,
				'X-Title': 'MIMUN 2026'
			},
			body: JSON.stringify({
				model: p.model,
				messages,
				temperature: opts.temperature ?? 0.4,
				max_tokens: opts.maxTokens ?? 900
			}),
			signal: controller.signal
		});
		if (!res.ok) {
			const detail = (await res.text().catch(() => '')).slice(0, 300);
			throw new Error(`${p.label} ${res.status}: ${detail}`);
		}
		const text = parseCompletionText(await res.json());
		if (!text) throw new Error(`${p.label} returned an empty completion`);
		return text;
	} finally {
		clearTimeout(timer);
	}
}
