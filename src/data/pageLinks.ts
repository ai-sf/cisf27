import type { Icon } from '@lucide/astro';
import { resolveIcon } from '../utils/helpers';
import { pageLinksData, getCmsData } from './cms';
import { getLocalizedHref } from '../utils/i18n';

const p = pageLinksData;

export const resolveHref = (href?: string, locale?: string): string => {
	return getLocalizedHref(href, locale);
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

export function getPageLinks(locale: string = 'it'): PageLink[] {
	if (!locale || locale === 'it') return pageLinks;
	const { pageLinksData: pl } = getCmsData(locale);
	return [
		{
			name: pl.home?.name ?? homeLink.name,
			href: resolveHref(pl.home?.href ?? p.home?.href ?? '/', locale),
			icon: homeLink.icon,
		},
		{
			name: pl.sponsor?.name ?? sponsorLink.name,
			href: resolveHref(pl.sponsor?.href ?? p.sponsor?.href ?? '/sponsor', locale),
			icon: sponsorLink.icon,
		},
		{
			name: pl.program?.name ?? programLink.name,
			href: resolveHref(pl.program?.href ?? p.program?.href ?? '/programma', locale),
			icon: programLink.icon,
		},
		{
			name: pl.structures?.name ?? structuresLink.name,
			href: resolveHref(pl.structures?.href ?? p.structures?.href ?? '/strutture', locale),
			icon: structuresLink.icon,
		},
		{
			name: pl.tesi?.name ?? tesiLink.name,
			href: resolveHref(pl.tesi?.href ?? p.tesi?.href ?? '/tesi', locale),
			icon: tesiLink.icon,
		},
		{
			name: pl.about?.name ?? aboutLink.name,
			href: resolveHref(pl.about?.href ?? p.about?.href ?? '/chi-siamo', locale),
			icon: aboutLink.icon,
		},
		{
			name: pl.contact?.name ?? contactLink.name,
			href: resolveHref(pl.contact?.href ?? p.contact?.href ?? '/contatto', locale),
			icon: contactLink.icon,
		},
	];
}

export function getPageLink(
	id: 'home' | 'about' | 'program' | 'structures' | 'sponsor' | 'tesi' | 'contact' | string,
	locale: string = 'it'
): PageLink {
	if (!locale || locale === 'it') {
		switch (id) {
			case 'home':
				return homeLink;
			case 'about':
				return aboutLink;
			case 'program':
				return programLink;
			case 'structures':
				return structuresLink;
			case 'sponsor':
				return sponsorLink;
			case 'tesi':
				return tesiLink;
			case 'contact':
				return contactLink;
			default:
				return { name: id, href: resolveHref(id) };
		}
	}
	const links = getPageLinks(locale);
	const ids = ['home', 'sponsor', 'program', 'structures', 'tesi', 'about', 'contact'];
	const idx = ids.indexOf(id);
	return idx !== -1 ? links[idx] : { name: id, href: resolveHref(id, locale) };
}
