/**
 * AI layer — a single OpenAI-compatible client that fans out across providers.
 *
 * We run a *combo* of OpenRouter and NVIDIA NIM. Both speak the OpenAI
 * chat-completions wire format, so one client serves both: the only per-provider
 * differences are the base URL, the API key, and the default model name — all
 * read from env. Providers are tried in order and we fail over on any error
 * (network, 4xx, 5xx). Since both run free tiers with their own rate limits,
 * failover doubles our effective headroom: when OpenRouter is throttling (429)
 * we fall through to NIM, and vice-versa.
 *
 * Pure plumbing lives in `ai-core.ts` (unit-tested). This module binds it to
 * `$env`. Server-only — never import it from client code, it reads secret keys.
 */
import { env } from '$env/dynamic/private';
import {
	AiNotConfiguredError,
	buildMessages,
	callProvider,
	extractJson,
	resolveProviders,
	type CompleteOptions
} from './ai-core';

// Re-export the pure surface so callers can import everything from `$lib/server/ai`.
export {
	AiNotConfiguredError,
	buildMessages,
	callProvider,
	extractJson,
	parseCompletionText,
	resolveProviders
} from './ai-core';
export type { AiMessage, CompleteOptions, EnvLike, ProviderConfig } from './ai-core';

const referer = () => env.PUBLIC_ORIGIN || 'https://mimun.app';

/** Is at least one provider usable right now? */
export function isAiConfigured(): boolean {
	return resolveProviders(env).length > 0;
}

/** Human-readable list of active providers (for diagnostics / admin UI). */
export function aiStatus(): {
	configured: boolean;
	providers: { id: string; label: string; model: string }[];
} {
	const providers = resolveProviders(env).map((p) => ({ id: p.id, label: p.label, model: p.model }));
	return { configured: providers.length > 0, providers };
}

/**
 * Run a completion, trying each configured provider in order until one succeeds.
 * Throws AiNotConfiguredError if none are configured, or the last provider error
 * if all fail.
 */
export async function aiComplete(
	opts: CompleteOptions
): Promise<{ text: string; provider: string; model: string }> {
	const providers = resolveProviders(env);
	if (!providers.length) throw new AiNotConfiguredError();
	const messages = buildMessages(opts);

	let lastErr: unknown;
	for (const p of providers) {
		try {
			const text = await callProvider(p, messages, opts, referer());
			return { text, provider: p.id, model: p.model };
		} catch (err) {
			lastErr = err;
			// Fall through to the next provider (covers 429 rate limits, 5xx, timeouts).
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error('All AI providers failed');
}

/** Convenience wrapper that parses the completion as JSON (with extraction). */
export async function aiJson<T>(
	opts: CompleteOptions
): Promise<{ data: T; provider: string; model: string }> {
	const r = await aiComplete(opts);
	const data = extractJson<T>(r.text);
	if (data == null) throw new Error('AI response was not valid JSON');
	return { data, provider: r.provider, model: r.model };
}
