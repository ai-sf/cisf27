const DURATION = 1500;

interface TextToken {
	type: 'text';
	value: string;
}

interface NumberToken {
	type: 'number';
	target: number;
	decimals: number;
}

type CounterToken = TextToken | NumberToken;

interface ParsedCounter {
	original: string;
	tokens: CounterToken[];
	hasPositiveNumber: boolean;
}

function parseCounter(rawText: string): ParsedCounter {
	const original = rawText.trim();
	const tokens: CounterToken[] = [];
	let hasPositiveNumber = false;
	const numberRegex = /\d+(?:\.\d+)?/g;
	let lastIndex = 0;

	for (const match of original.matchAll(numberRegex)) {
		const index = match.index ?? 0;
		if (index > lastIndex) {
			tokens.push({ type: 'text', value: original.slice(lastIndex, index) });
		}

		const numStr = match[0];
		const target = parseFloat(numStr);
		const dotIndex = numStr.indexOf('.');
		const decimals = dotIndex === -1 ? 0 : numStr.length - dotIndex - 1;

		if (target > 0) {
			hasPositiveNumber = true;
		}

		tokens.push({ type: 'number', target, decimals });
		lastIndex = index + numStr.length;
	}

	if (lastIndex < original.length) {
		tokens.push({ type: 'text', value: original.slice(lastIndex) });
	}

	return { original, tokens, hasPositiveNumber };
}

function formatCounter(tokens: CounterToken[], factor: number): string {
	return tokens
		.map((token) => {
			if (token.type === 'text') return token.value;
			const current = token.target * factor;
			return token.decimals > 0 ? current.toFixed(token.decimals) : Math.round(current).toString();
		})
		.join('');
}

function animateCounter(el: HTMLElement, parsed: ParsedCounter): void {
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
		el.textContent = parsed.original;
		return;
	}

	const start = performance.now();

	function tick(now: number) {
		const elapsed = now - start;
		const progress = Math.min(elapsed / DURATION, 1);
		const eased = 1 - (1 - progress) * (1 - progress);

		if (progress < 1) {
			el.textContent = formatCounter(parsed.tokens, eased);
			requestAnimationFrame(tick);
		} else {
			el.textContent = parsed.original;
		}
	}

	requestAnimationFrame(tick);
}

export function initCounters(selector: string = '.stat-value'): void {
	if (!('IntersectionObserver' in window)) return;

	const elements = document.querySelectorAll<HTMLElement>(selector);
	const observed = new WeakSet<Element>();

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && !observed.has(entry.target)) {
					observed.add(entry.target);
					const el = entry.target as HTMLElement;
					const sourceText = el.dataset.counterTarget ?? el.textContent ?? '';
					const parsed = parseCounter(sourceText);
					if (parsed.hasPositiveNumber) animateCounter(el, parsed);
					observer.unobserve(el);
				}
			}
		},
		{ threshold: 0.5 }
	);

	for (const el of elements) {
		const sourceText = el.dataset.counterTarget ?? el.textContent ?? '';
		const parsed = parseCounter(sourceText);
		if (parsed.hasPositiveNumber) {
			el.dataset.counterTarget = parsed.original;
			observer.observe(el);
		}
	}
}
