const DURATION = 1500;

function parseNumber(text: string): number {
	const cleaned = text.replace(/[^0-9.]/g, '');
	return parseFloat(cleaned) || 0;
}

function animateCounter(el: HTMLElement, target: number): void {
	const start = performance.now();
	const isFloat = target !== Math.floor(target);

	function tick(now: number) {
		const elapsed = now - start;
		const progress = Math.min(elapsed / DURATION, 1);
		const eased = 1 - (1 - progress) * (1 - progress);
		const current = target * eased;

		el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toString();

		if (progress < 1) {
			requestAnimationFrame(tick);
		} else {
			el.textContent = target.toString();
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
					const target = parseNumber(el.textContent || '');
					if (target > 0) animateCounter(el, target);
					observer.unobserve(el);
				}
			}
		},
		{ threshold: 0.5 }
	);

	for (const el of elements) {
		const target = parseNumber(el.textContent || '');
		if (target > 0) observer.observe(el);
	}
}
