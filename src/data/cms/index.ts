import type { CmsData } from '../../types/cms';

// Base types defining the content schema
import type conferenceBase from './it/conference.json';
import type homeBase from './it/home.json';
import type aboutBase from './it/about.json';
import type structuresBase from './it/structures.json';
import type programBase from './it/program.json';
import type pricingBase from './it/pricing.json';
import type contactsBase from './it/contacts.json';
import type errorBase from './it/error.json';
import type sponsorBase from './it/sponsor.json';
import type themeBase from './it/theme.json';
import type bolognaBase from './it/bologna.json';
import type thesisBase from './it/thesis.json';
import type historyBase from './it/history.json';
import type iapsBase from './it/iaps.json';
import type footerBase from './it/footer.json';
import type navBase from './it/nav.json';
import type partnersBase from './it/partners.json';
import type peopleBase from './it/people.json';
import type pageLinksBase from './it/pageLinks.json';
import type statsBase from './it/stats.json';

// Eagerly import all CMS json files across all languages dynamically
const cmsModules = import.meta.glob<Record<string, unknown>>('./*/*.json', {
	eager: true,
	import: 'default',
});

function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
	if (!override) return base;
	if (typeof base !== 'object' || base === null) return (override ?? base) as T;
	if (Array.isArray(base)) {
		if (Array.isArray(override) && override.length > 0) {
			return base.map((baseItem, idx) => {
				const overItem = (override as unknown[])[idx];
				if (
					typeof baseItem === 'object' &&
					baseItem !== null &&
					typeof overItem === 'object' &&
					overItem !== null
				) {
					return deepMerge(baseItem, overItem as Partial<typeof baseItem>);
				}
				return overItem !== undefined ? overItem : baseItem;
			}) as unknown as T;
		}
		return base;
	}
	const result = { ...base } as Record<string, unknown>;
	for (const [key, val] of Object.entries(override as Record<string, unknown>)) {
		if (val !== undefined && val !== null) {
			if (
				typeof val === 'object' &&
				!Array.isArray(val) &&
				typeof result[key] === 'object' &&
				result[key] !== null &&
				!Array.isArray(result[key])
			) {
				result[key] = deepMerge(result[key], val);
			} else {
				result[key] = val;
			}
		}
	}
	return result as T;
}

/**
 * Retrieves a single catalog for a given locale, falling back to Italian
 */
export function getCatalog(name: string, locale: string = 'it'): unknown {
	const base = cmsModules[`./it/${name}.json`];
	if (!base) return {};
	if (locale === 'it' || !locale) return base;
	const override = cmsModules[`./${locale}/${name}.json`];
	if (!override) return base;
	return deepMerge(base, override);
}

export function getCmsData(locale: string = 'it') {
	const conf = getCatalog('conference', locale);
	const hm = getCatalog('home', locale);
	const ab = getCatalog('about', locale);
	const st = getCatalog('structures', locale);
	const pr = getCatalog('program', locale);
	const pri = getCatalog('pricing', locale);
	const ct = getCatalog('contacts', locale);
	const err = getCatalog('error', locale);
	const sp = getCatalog('sponsor', locale);
	const th = getCatalog('theme', locale);
	const bg = getCatalog('bologna', locale);
	const ts = getCatalog('thesis', locale);
	const hi = getCatalog('history', locale);
	const ia = getCatalog('iaps', locale);
	const ft = getCatalog('footer', locale);
	const nv = getCatalog('nav', locale);
	const pt = getCatalog('partners', locale);
	const pe = getCatalog('people', locale);
	const pl = getCatalog('pageLinks', locale);
	const stt = getCatalog('stats', locale);

	return {
		conference: conf as CmsData<typeof conferenceBase>,
		home: hm as CmsData<typeof homeBase>,
		about: ab as CmsData<typeof aboutBase>,
		structures: st as CmsData<typeof structuresBase>,
		structuresData: st as CmsData<typeof structuresBase>,
		program: pr as CmsData<typeof programBase>,
		programData: pr as CmsData<typeof programBase>,
		pricing: pri as CmsData<typeof pricingBase>,
		contacts: ct as CmsData<typeof contactsBase>,
		error: err as CmsData<typeof errorBase>,
		errorContent: err as CmsData<typeof errorBase>,
		sponsor: sp as CmsData<typeof sponsorBase>,
		theme: th as CmsData<typeof themeBase>,
		themeData: th as CmsData<typeof themeBase>,
		bologna: bg as CmsData<typeof bolognaBase>,
		bolognaData: bg as CmsData<typeof bolognaBase>,
		thesis: ts as CmsData<typeof thesisBase>,
		thesisContent: ts as CmsData<typeof thesisBase>,
		history: hi as CmsData<typeof historyBase>,
		iaps: ia as CmsData<typeof iapsBase>,
		footer: ft as CmsData<typeof footerBase>,
		nav: nv as CmsData<typeof navBase>,
		partners: pt as CmsData<typeof partnersBase>,
		partnersData: pt as CmsData<typeof partnersBase>,
		people: pe as CmsData<typeof peopleBase>,
		peopleJson: pe as CmsData<typeof peopleBase>,
		pageLinks: pl as CmsData<typeof pageLinksBase>,
		pageLinksData: pl as CmsData<typeof pageLinksBase>,
		stats: stt as CmsData<typeof statsBase>,
		statsData: stt as CmsData<typeof statsBase>,
	};
}

export const getCms = getCmsData;

// Direct base exports (Italian by default for backward compatibility)
const base = getCmsData('it');
export const conference = base.conference;
export const home = base.home;
export const about = base.about;
export const structuresData = base.structuresData;
export const programData = base.programData;
export const pricing = base.pricing;
export const contacts = base.contacts;
export const errorContent = base.errorContent;
export const sponsor = base.sponsor;
export const themeData = base.themeData;
export const bolognaData = base.bolognaData;
export const thesisContent = base.thesisContent;
export const history = base.history;
export const iaps = base.iaps;
export const footer = base.footer;
export const nav = base.nav;
export const partnersData = base.partnersData;
export const peopleJson = base.peopleJson;
export const pageLinksData = base.pageLinksData;
export const statsData = base.statsData;

export const partnerCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./it/partner-categories/*.json', {
	eager: true,
});

export const localizedPartnerCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./*/partner-categories/*.json', {
	eager: true,
});

export const committeeRoleGlob = import.meta.glob<{
	default: { id?: string; label?: string; description?: string };
}>('./it/people-roles/*.json', {
	eager: true,
});

export const localizedCommitteeRoleGlob = import.meta.glob<{
	default: { id?: string; label?: string; description?: string };
}>('./*/people-roles/*.json', {
	eager: true,
});

export const structureGlob = import.meta.glob<{
	default: {
		id?: string;
		label?: string;
		category?: string;
		address?: string;
		mapUrl?: string;
		mapEmbedUrl?: string;
		description?: string;
		distance?: string;
		capacity?: string;
		rooms?: string;
		price?: string;
		phone?: string;
		whatsapp?: string;
		email?: string;
		features?: string[];
		image?: string;
	};
}>('./it/structures/*.json', {
	eager: true,
});

export const localizedStructureGlob = import.meta.glob<{
	default: {
		id?: string;
		label?: string;
		category?: string;
		address?: string;
		mapUrl?: string;
		mapEmbedUrl?: string;
		description?: string;
		distance?: string;
		capacity?: string;
		rooms?: string;
		price?: string;
		phone?: string;
		whatsapp?: string;
		email?: string;
		features?: string[];
		image?: string;
	};
}>('./*/structures/*.json', {
	eager: true,
});

export const structureCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./it/structure-categories/*.json', {
	eager: true,
});

export const localizedStructureCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./*/structure-categories/*.json', {
	eager: true,
});

export { getLocale } from '../../utils/i18n';
