import { initCounters } from './counter.ts';

function initReveal(): void {
	const singles = document.querySelectorAll<HTMLElement>('.reveal, .reveal-fast, .reveal-scale');
	const staggerParents = document.querySelectorAll<HTMLElement>('.reveal-stagger');
	const all: HTMLElement[] = [...singles];

	for (const parent of staggerParents) {
		all.push(...(Array.from(parent.children) as HTMLElement[]));
	}

	if (!all.length) return;

	if (!('IntersectionObserver' in window)) {
		all.forEach((el) => el.classList.add('reveal-visible'));
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					(entry.target as HTMLElement).classList.add('reveal-visible');
					observer.unobserve(entry.target);
				}
			}
		},
		{ threshold: 0.15 }
	);

	for (const el of all) {
		observer.observe(el);
	}
}

function initTypewriter(): void {
	const els = document.querySelectorAll<HTMLElement>('.typewriter');
	if (!els.length) return;

	const obs = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				obs.unobserve(el);
				const text = el.dataset.text || el.textContent || '';
				if (!text) continue;
				el.innerHTML =
					'<span class="typewriter-content"></span><span class="typewriter-cursor" aria-hidden="true"></span>';
				const content = el.querySelector('.typewriter-content')!;
				let i = 0;
				const id = setInterval(() => {
					if (i < text.length) {
						content.textContent += text[i];
						i++;
					} else {
						clearInterval(id);
						el.classList.add('done');
					}
				}, 30);
			}
		},
		{ threshold: 0.3 }
	);

	for (const el of els) obs.observe(el);
}

function initCharStagger(): void {
	const els = document.querySelectorAll<HTMLElement>('.char-stagger');
	if (!els.length) return;

	for (const el of els) {
		const text = (el.textContent || '').trim();
		if (!text) continue;

		// Walk up the DOM to find the ancestor that owns the gradient + bg-clip:text.
		// The gradient is often on a parent (e.g. Tailwind bg-gradient-* + bg-clip-text
		// + text-transparent), not on .char-stagger itself.
		let gradientBg = '';
		let clipSource: HTMLElement | null = null;
		let node: HTMLElement | null = el;
		while (node) {
			const cs = getComputedStyle(node);
			const bgImg = cs.backgroundImage;
			const bgClip = cs.getPropertyValue('-webkit-background-clip') || cs.backgroundClip;
			if (bgImg && bgImg !== 'none' && bgClip === 'text') {
				gradientBg = bgImg;
				clipSource = node;
				break;
			}
			node = node.parentElement;
		}

		// If we found a gradient+clip ancestor, strip it from that element so the
		// inherited -webkit-text-fill-color:transparent stops making child spans
		// invisible. We'll stamp the gradient directly on each char span instead,
		// which Chrome handles correctly.
		if (gradientBg && clipSource) {
			clipSource.style.backgroundImage = 'none';
			clipSource.style.webkitBackgroundClip = 'unset';
			clipSource.style.backgroundClip = 'unset';
			clipSource.style.webkitTextFillColor = 'unset';
			clipSource.style.color = 'unset';
		}

		// Count only visible characters (no whitespace) to calculate gradient positions
		const visibleChars = text.replace(/\s/g, '').length;
		let globalIndex = 0;
		let charIndex = 0;
		el.innerHTML = text
			.split(/(\s+)/)
			.map((token) => {
				if (/^\s+$/.test(token)) return token;
				const chars = token
					.split('')
					.map((char) => {
						const delay = `${globalIndex++ * 0.03}s`;
						// To make the gradient span the full title rather than repeating
						// per-char, we set background-size to (totalChars * 100%) so the
						// gradient is stretched across all characters, then shift
						// background-position left by the char's index so each span shows
						// only its own slice of the gradient.
						const gradStyle = gradientBg
							? `background:${gradientBg};background-size:${visibleChars * 100}% 100%;background-position:${charIndex++ * -100}% 0;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
							: '';
						return `<span style="display:inline-block;opacity:0;padding-bottom:0.2em;margin-bottom:-0.2em;--delay:${delay};${gradStyle}">${char}</span>`;
					})
					.join('');
				return `<span style="display:inline-block;white-space:nowrap;padding-bottom:0.2em;margin-bottom:-0.2em">${chars}</span>`;
			})
			.join('');
	}

	if (!('IntersectionObserver' in window)) {
		els.forEach((el) => el.classList.add('active'));
		return;
	}

	const obs = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				(entry.target as HTMLElement).classList.add('active');
				obs.unobserve(entry.target);
			}
		},
		{ threshold: 0.3 }
	);

	for (const el of els) obs.observe(el);
}

function initTextScramble(): void {
	const els = document.querySelectorAll<HTMLElement>('.scramble-text');
	if (!els.length) return;

	const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const frames = 15;
	const ms = 50;

	const obs = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				obs.unobserve(el);
				const text = el.dataset.text || el.textContent || '';
				if (!text) continue;

				el.innerHTML = text
					.split('')
					.map(() => '<span class="scramble-char"></span>')
					.join('');
				const spans = el.querySelectorAll<HTMLElement>('.scramble-char');
				let frame = 0;

				const id = setInterval(() => {
					const reveal = Math.floor((frame / frames) * text.length);
					for (let i = 0; i < spans.length; i++) {
						spans[i].textContent =
							i < reveal ? text[i] : pool[Math.floor(Math.random() * pool.length)];
					}
					frame++;
					if (frame > frames) {
						clearInterval(id);
						for (let i = 0; i < spans.length; i++) spans[i].textContent = text[i];
					}
				}, ms);
			}
		},
		{ threshold: 0.3 }
	);

	for (const el of els) obs.observe(el);
}

function initScrollProgress(): void {
	const el = document.querySelector<HTMLElement>('.scroll-progress');
	if (!el) return;
	const update = () => {
		const max = document.body.scrollHeight - window.innerHeight;
		el.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
	};
	window.addEventListener('scroll', update, { passive: true });
	window.addEventListener('resize', update, { passive: true });
	update();
}

function initBackToTop(): void {
	const btn = document.querySelector<HTMLAnchorElement>('.back-to-top');
	if (!btn || btn.dataset.bttInit) return;
	btn.dataset.bttInit = '';
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});
	const toggle = () => {
		btn.classList.toggle('visible', window.scrollY > 300);
	};
	toggle();
	window.addEventListener('scroll', toggle, { passive: true });
}

export function initAnimations(): void {
	initReveal();
	initCounters('.stat-value');
	initTypewriter();
	initCharStagger();
	initTextScramble();
	initScrollProgress();
	initBackToTop();
}
