// Motion system — reduced-motion-aware Svelte transition helpers.
//
// One easing curve and one accessibility gate for the whole app, so motion stays
// coherent and every animation collapses to instant under prefers-reduced-motion.
// Svelte's built-in transitions don't check that media query themselves, so we
// wrap them. No runtime dependency beyond Svelte itself.

import { fly, scale, slide, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

/** True when the user has asked the OS to minimise motion. Safe on the server. */
export function prefersReduced(): boolean {
	return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

// cubicOut closely matches the design system's --ease-out-soft (a soft, no-overshoot
// landing), so transitions feel of-a-piece with the CSS button/input easing.
const SOFT = cubicOut;

/** Rise + fade — list items, messages, cards entering the room. */
export function rise(node: Element, { y = 8, duration = 260, delay = 0 }: { y?: number; duration?: number; delay?: number } = {}): TransitionConfig {
	if (prefersReduced()) return { duration: 0 };
	return fly(node, { y, duration, delay, easing: SOFT });
}

/** Scale + fade — the live-action surfaces that should pull the eye (an open vote). */
export function pop(node: Element, { duration = 240, start = 0.96 }: { duration?: number; start?: number } = {}): TransitionConfig {
	if (prefersReduced()) return { duration: 0 };
	return scale(node, { start, opacity: 0, duration, easing: SOFT });
}

/** Height slide — banners and rows that should open/close space rather than pop. */
export function slideY(node: Element, { duration = 240 }: { duration?: number } = {}): TransitionConfig {
	if (prefersReduced()) return { duration: 0 };
	return slide(node, { duration, easing: SOFT });
}

/** Flip params for `animate:flip` — the speaker list reordering when a speaker is recognised. */
export const flipParams = { duration: prefersReduced() ? 0 : 260, easing: SOFT };

/**
 * `use:flash={value}` — pulses the element (brass tick) whenever `value` changes.
 * Used on live counters: vote tallies, quorum, the floor-mode chip. The pulse is
 * driven by a CSS class so it's GPU-cheap and respects reduced motion via CSS too.
 */
export function flash(node: HTMLElement, value: unknown) {
	let prev = value;
	function pulse() {
		if (prefersReduced()) return;
		node.classList.remove('is-flashing');
		void node.offsetWidth; // force reflow so the animation restarts even on rapid changes
		node.classList.add('is-flashing');
	}
	return {
		update(next: unknown) {
			if (next !== prev) {
				prev = next;
				pulse();
			}
		}
	};
}
