import type { Icon } from '@lucide/astro';
import { resolveIcon } from '../utils/helpers';
import { pageLinksData } from './cms';

const p = pageLinksData;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const resolveHref = (href?: string): string => {
	if (!href) return base ? `${base}/` : '/';
	if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#'))
		return href;
	const clean = href.startsWith(base) ? href.slice(base.length) : href;
	if (clean === '' || clean === '/') return base ? `${base}/` : '/';
	return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

export interface PageLink {
	name: string;
	href: string;
	icon?: typeof Icon;
}

export const homeLink: PageLink = {
	name: p.home?.name ?? '',
	href: resolveHref(p.home?.href ?? '/'),
	icon: resolveIcon(p.home?.icon),
};
export const aboutLink: PageLink = {
	name: p.about?.name ?? '',
	href: resolveHref(p.about?.href ?? '/chi-siamo'),
	icon: resolveIcon(p.about?.icon),
};
export const programLink: PageLink = {
	name: p.program?.name ?? '',
	href: resolveHref(p.program?.href ?? '/programma'),
	icon: resolveIcon(p.program?.icon),
};
export const structuresLink: PageLink = {
	name: p.structures?.name ?? '',
	href: resolveHref(p.structures?.href ?? '/strutture'),
	icon: resolveIcon(p.structures?.icon),
};
export const sponsorLink: PageLink = {
	name: p.sponsor?.name ?? '',
	href: resolveHref(p.sponsor?.href ?? '/sponsor'),
	icon: resolveIcon(p.sponsor?.icon),
};
export const tesiLink: PageLink = {
	name: p.tesi?.name ?? '',
	href: resolveHref(p.tesi?.href ?? '/tesi'),
	icon: resolveIcon(p.tesi?.icon),
};
export const contactLink: PageLink = {
	name: p.contact?.name ?? '',
	href: resolveHref(p.contact?.href ?? '/contatto'),
	icon: resolveIcon(p.contact?.icon),
};

export const pageLinks: PageLink[] = [
	homeLink,
	sponsorLink,
	programLink,
	structuresLink,
	tesiLink,
	aboutLink,
	contactLink,
] as const;
